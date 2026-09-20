import { ChildProcess, spawn } from 'child_process';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const SERVER_TIMEOUT_MS = 30_000;
const RETRY_INTERVAL_MS = 250;

interface DevServer {
  name: string;
  url: string;
  process: ChildProcess;
}

function startDevServer(workspace: string, port: number): DevServer {
  const childProcess = spawn('npm', ['run', 'dev', '-w', workspace, '--', '--host', '127.0.0.1'], {
    cwd: REPO_ROOT,
    detached: process.platform !== 'win32',
    stdio: 'pipe',
  });

  return { name: workspace, url: `http://127.0.0.1:${port}`, process: childProcess };
}

async function waitForServer(server: DevServer): Promise<Response> {
  const deadline = Date.now() + SERVER_TIMEOUT_MS;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(server.url);
      if (response.ok) {
        return response;
      }
      lastError = new Error(`${server.name} returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, RETRY_INTERVAL_MS));
  }

  throw new Error(`Dev server ${server.name} did not become ready: ${String(lastError)}`);
}

function stopDevServer(server: DevServer): void {
  if (!server.process.pid || server.process.killed) {
    return;
  }

  if (process.platform === 'win32') {
    server.process.kill('SIGTERM');
    return;
  }

  try {
    process.kill(-server.process.pid, 'SIGTERM');
  } catch {
    server.process.kill('SIGTERM');
  }
}

describe('BNP-312: Vite dev servers — correct ports', () => {
  let servers: DevServer[];

  beforeAll(() => {
    servers = [
      startDevServer('apps/guest-web', 5173),
      startDevServer('apps/admin-web', 5174),
    ];
  });

  afterAll(() => {
    servers.forEach(stopDevServer);
  });

  it(
    'starts both servers on their assigned ports and returns their pages over HTTP',
    async () => {
      const [guestResponse, adminResponse] = await Promise.all(servers.map(waitForServer));

      expect(guestResponse.status).toBe(200);
      expect(guestResponse.headers.get('content-type')).toMatch(/text\/html/);
      expect(adminResponse.status).toBe(200);
      expect(adminResponse.headers.get('content-type')).toMatch(/text\/html/);
    },
    SERVER_TIMEOUT_MS + 5_000,
  );
});
