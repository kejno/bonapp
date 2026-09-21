import { EventEmitter } from 'node:events';

import { stopDevProcess } from './stop-dev-process';

describe('stopDevProcess', () => {
  it('terminates the complete dev-process tree on Windows', async () => {
    const process = new EventEmitter() as EventEmitter & {
      pid: number;
      exitCode: number | null;
      signalCode: NodeJS.Signals | null;
      kill: jest.Mock;
    };
    process.pid = 1234;
    process.exitCode = null;
    process.signalCode = null;
    process.kill = jest.fn();
    const executeCommand = jest.fn(
      (_file: string, _args: string[], callback: (error: unknown) => void) => {
        callback(null);
        process.emit('close');
      },
    );

    await stopDevProcess(process, {
      platform: 'win32',
      executeCommand,
    });

    expect(executeCommand).toHaveBeenCalledWith(
      'taskkill',
      ['/pid', '1234', '/t', '/f'],
      expect.any(Function),
    );
    expect(process.kill).not.toHaveBeenCalled();
  });
});
