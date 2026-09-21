import { execFile } from 'node:child_process';

interface ManagedProcess {
  pid?: number;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  kill(signal?: NodeJS.Signals): boolean;
  once(event: 'close', listener: () => void): unknown;
}

type ExecuteCommand = (
  file: string,
  args: string[],
  callback: (error: unknown) => void,
) => unknown;

type KillProcess = (pid: number, signal?: NodeJS.Signals) => boolean;

interface StopDevProcessOptions {
  platform?: NodeJS.Platform;
  executeCommand?: ExecuteCommand;
  killProcess?: KillProcess;
}

const executeCommand: ExecuteCommand = (file, args, callback) => {
  execFile(file, args, callback);
};

const terminateWindowsProcessTree = (pid: number, runCommand: ExecuteCommand) =>
  new Promise<boolean>((resolve) => {
    runCommand('taskkill', ['/pid', String(pid), '/t', '/f'], (error) => {
      resolve(!error);
    });
  });

export const stopDevProcess = async (
  apiProcess: ManagedProcess,
  {
    platform = process.platform,
    executeCommand: runCommand = executeCommand,
    killProcess = (targetPid, signal) => process.kill(targetPid, signal),
  }: StopDevProcessOptions = {},
) => {
  if (
    !apiProcess.pid ||
    apiProcess.exitCode !== null ||
    apiProcess.signalCode !== null
  ) {
    return;
  }

  const pid = apiProcess.pid;
  let rejectClose: (error: Error) => void;
  const closed = new Promise<void>((resolve, reject) => {
    rejectClose = reject;
    apiProcess.once('close', () => resolve());
  });
  const terminate = async (signal: NodeJS.Signals) => {
    if (platform === 'win32') {
      const terminated = await terminateWindowsProcessTree(pid, runCommand);
      if (!terminated) {
        apiProcess.kill(signal);
      }
      return;
    }

    try {
      killProcess(-pid, signal);
    } catch {
      apiProcess.kill(signal);
    }
  };
  const forceStopTimeout = setTimeout(() => {
    void terminate('SIGKILL');
  }, 10_000);
  const closeTimeout = setTimeout(() => {
    rejectClose(new Error(`Dev process ${pid} did not close after termination`));
  }, 11_000);

  try {
    await terminate('SIGTERM');
    await closed;
  } finally {
    clearTimeout(forceStopTimeout);
    clearTimeout(closeTimeout);
  }
};
