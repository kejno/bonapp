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

interface StopDevProcessOptions {
  platform?: NodeJS.Platform;
  executeCommand?: ExecuteCommand;
  killProcess?: typeof process.kill;
}

const executeCommand: ExecuteCommand = (file, args, callback) => {
  execFile(file, args, callback);
};

const terminateWindowsProcessTree = (pid: number, runCommand: ExecuteCommand) =>
  new Promise<void>((resolve) => {
    runCommand('taskkill', ['/pid', String(pid), '/t', '/f'], () => resolve());
  });

export const stopDevProcess = async (
  apiProcess: ManagedProcess,
  {
    platform = process.platform,
    executeCommand: runCommand = executeCommand,
    killProcess = process.kill,
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
  const closed = new Promise<void>((resolve) => {
    apiProcess.once('close', () => resolve());
  });
  const terminate = async (signal: NodeJS.Signals) => {
    if (platform === 'win32') {
      await terminateWindowsProcessTree(pid, runCommand);
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

  await terminate('SIGTERM');
  await closed;
  clearTimeout(forceStopTimeout);
};
