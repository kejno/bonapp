import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as net from 'node:net';
import { resolve as pathResolve } from 'node:path';

import { stopDevProcess } from '../src/stop-dev-process';

const repositoryRoot = pathResolve(__dirname, '../../..');
const COMPOSE_TIMEOUT = 120_000;
const HEALTHCHECK_TIMEOUT = 120_000;
const STARTUP_SCENARIO_TIMEOUT = 420_000;
let postgresPort: number;
let redisPort: number;
let minioApiPort: number;
let minioConsolePort: number;

const getAvailablePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not allocate an isolated test port'));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });

const compose = (...args: string[]) =>
  execFileSync('docker', ['compose', ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: COMPOSE_TIMEOUT,
    env: {
      ...process.env,
      BONAPP_POSTGRES_PORT: String(postgresPort),
      BONAPP_REDIS_PORT: String(redisPort),
      BONAPP_MINIO_API_PORT: String(minioApiPort),
      BONAPP_MINIO_CONSOLE_PORT: String(minioConsolePort),
      COMPOSE_PROJECT_NAME: `bonapp-bnp325-${process.pid}`,
    },
  });

interface ServiceStatus {
  Service: string;
  Health: string;
}

function parseServiceStatuses(raw: string): ServiceStatus[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    return JSON.parse(trimmed) as ServiceStatus[];
  }
  return trimmed
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ServiceStatus);
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const waitForApiStartup = (apiProcess: ChildProcess) =>
  new Promise<void>((resolve, reject) => {
    let output = '';
    const startTimeout = setTimeout(() => {
      clearInterval(readinessCheck);
      reject(
        new Error(`API did not become ready within 30 s. Output:\n${output}`),
      );
    }, 30_000);

    const handleData = (data: Buffer) => {
      output += data.toString();
    };
    const checkReadiness = async () => {
      try {
        const response = await fetch('http://127.0.0.1:3000/api/v1');
        if (response.ok) {
          clearTimeout(startTimeout);
          clearInterval(readinessCheck);
          expect(output).not.toMatch(/ECONNREFUSED/);
          expect(output).not.toMatch(/connection refused/i);
          resolve();
        }
      } catch {
        // The API is still starting.
      }
    };
    const readinessCheck = setInterval(() => {
      void checkReadiness();
    }, 250);

    apiProcess.stdout?.on('data', handleData);
    apiProcess.stderr?.on('data', handleData);
    apiProcess.once('error', (error) => {
      clearTimeout(startTimeout);
      clearInterval(readinessCheck);
      reject(error);
    });
    void checkReadiness();
  });

async function waitForServicesHealthy() {
  const deadline = Date.now() + HEALTHCHECK_TIMEOUT;
  let statuses: ServiceStatus[] = [];

  while (Date.now() < deadline) {
    statuses = parseServiceStatuses(compose('ps', '--format', 'json'));
    const postgres = statuses.find((service) => service.Service === 'postgres');
    const redis = statuses.find((service) => service.Service === 'redis');

    if (postgres?.Health === 'healthy' && redis?.Health === 'healthy') {
      return;
    }

    await wait(1_000);
  }

  throw new Error(
    `PostgreSQL and Redis did not become healthy within ${HEALTHCHECK_TIMEOUT} ms: ${JSON.stringify(statuses)}`,
  );
}

describe('BNP-325: local start guide', () => {
  const envExamplePath = pathResolve(repositoryRoot, 'apps/api/.env.example');
  let databaseUrl: string;
  let redisUrl: string;
  let runtimeEnvironment: NodeJS.ProcessEnv;

  beforeAll(async () => {
    [postgresPort, redisPort, minioApiPort, minioConsolePort] =
      await Promise.all([
        getAvailablePort(),
        getAvailablePort(),
        getAvailablePort(),
        getAvailablePort(),
      ]);
    const environmentTemplate = readFileSync(envExamplePath, 'utf8');
    const templateEnvironment = Object.fromEntries(
      environmentTemplate.split('\n').flatMap((line) => {
        const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
        return match ? [[match[1], match[2]]] : [];
      }),
    );
    const databaseUrlMatch = environmentTemplate.match(/^DATABASE_URL=(.+)$/m);
    const redisUrlMatch = environmentTemplate.match(/^REDIS_URL=(.+)$/m);
    if (!databaseUrlMatch || !redisUrlMatch) {
      throw new Error('.env.example must define DATABASE_URL and REDIS_URL');
    }

    databaseUrl = databaseUrlMatch[1]
      .trim()
      .replace(/localhost:\d+/, `localhost:${postgresPort}`);
    redisUrl = redisUrlMatch[1]
      .trim()
      .replace(/localhost:\d+/, `localhost:${redisPort}`);
    runtimeEnvironment = {
      ...process.env,
      ...templateEnvironment,
      DATABASE_URL: databaseUrl,
      REDIS_URL: redisUrl,
    };
  });

  afterAll(() => {
    try {
      compose('down', '--volumes');
    } catch {
      // Cleanup must not hide the assertion result.
    }
  });

  it('README documents all three startup commands in the correct order', () => {
    const readme = readFileSync(
      pathResolve(repositoryRoot, 'README.md'),
      'utf8',
    );

    const localDevelopmentSection = readme.match(
      /^## Локальная разработка\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/m,
    );
    expect(localDevelopmentSection).not.toBeNull();

    const commandBlocks = [
      ...(localDevelopmentSection?.[1].matchAll(/```bash\s*\n([\s\S]*?)```/g) ??
        []),
    ].map((match) =>
      match[1]
        .trim()
        .split('\n')
        .map((command) => command.trim())
        .filter(Boolean),
    );
    const startupBlocks = commandBlocks.filter((commands) =>
      commands.includes('docker compose up -d'),
    );

    expect(startupBlocks).toHaveLength(1);
    expect(startupBlocks[0]).toEqual([
      'docker compose up -d',
      'npx prisma migrate dev --schema apps/api/prisma/schema.prisma',
      'npm run dev',
    ]);
  });

  it(
    'executes the documented startup sequence: services become healthy, migration succeeds, API starts without connection errors',
    async () => {
      // Step 1: execute the documented command exactly, then poll healthchecks.
      compose('up', '-d');
      await waitForServicesHealthy();

      const statuses = parseServiceStatuses(compose('ps', '--format', 'json'));
      const postgres = statuses.find((s) => s.Service === 'postgres');
      const redis = statuses.find((s) => s.Service === 'redis');
      expect(postgres?.Health).toBe('healthy');
      expect(redis?.Health).toBe('healthy');

      // Step 2: execute the exact documented migration command.
      const migrateOutput = execFileSync(
        'npx',
        [
          'prisma',
          'migrate',
          'dev',
          '--schema',
          'apps/api/prisma/schema.prisma',
        ],
        {
          cwd: repositoryRoot,
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 60_000,
          env: runtimeEnvironment,
        },
      );
      expect(migrateOutput).not.toMatch(/error/i);

      // Step 3: execute the documented workspace startup command and verify the API boots.
      let apiProcess: ChildProcess | undefined;
      try {
        apiProcess = spawn('npm', ['run', 'dev'], {
          cwd: repositoryRoot,
          detached: process.platform !== 'win32',
          stdio: 'pipe',
          env: runtimeEnvironment,
        });
        await waitForApiStartup(apiProcess);
      } finally {
        if (apiProcess) {
          await stopDevProcess(apiProcess);
        }
      }
    },
    STARTUP_SCENARIO_TIMEOUT,
  );
});
