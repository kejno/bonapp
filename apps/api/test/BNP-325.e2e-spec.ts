import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import * as net from 'node:net';
import { resolve as pathResolve } from 'node:path';

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
  const envPath = pathResolve(repositoryRoot, 'apps/api/.env');
  const envExamplePath = pathResolve(repositoryRoot, 'apps/api/.env.example');
  let envCreatedByTest = false;
  let originalEnvContent: string | null = null;

  beforeAll(async () => {
    [postgresPort, redisPort, minioApiPort, minioConsolePort] = await Promise.all([
      getAvailablePort(),
      getAvailablePort(),
      getAvailablePort(),
      getAvailablePort(),
    ]);
    originalEnvContent = existsSync(envPath) ? readFileSync(envPath, 'utf8') : null;
    envCreatedByTest = originalEnvContent === null;
    const sourceEnv = originalEnvContent ?? readFileSync(envExamplePath, 'utf8');
    const isolatedEnv = sourceEnv
      .replace(
        /^DATABASE_URL=.*$/m,
        `DATABASE_URL=postgresql://postgres:postgres@localhost:${postgresPort}/bonapp`,
      )
      .replace(/^REDIS_URL=.*$/m, `REDIS_URL=redis://localhost:${redisPort}`);
    writeFileSync(envPath, isolatedEnv);
  });

  afterAll(() => {
    if (originalEnvContent !== null) {
      writeFileSync(envPath, originalEnvContent);
    } else if (envCreatedByTest && existsSync(envPath)) {
      unlinkSync(envPath);
    }
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

      // Load DATABASE_URL from the .env created from .env.example so the migration
      // runs in the documented environment rather than a hardcoded override.
      const createdEnvContent = readFileSync(envPath, 'utf8');
      const dbUrlMatch = createdEnvContent.match(/^DATABASE_URL=(.+)$/m);
      expect(dbUrlMatch).not.toBeNull();
      const databaseUrl = dbUrlMatch![1]
        .trim()
        .replace(/localhost:\d+/, `localhost:${postgresPort}`);
      const redisUrl = `redis://localhost:${redisPort}`;

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
          env: {
            ...process.env,
            DATABASE_URL: databaseUrl,
          },
        },
      );
      expect(migrateOutput).not.toMatch(/error/i);

      // Step 3: execute the documented workspace startup command and verify the API boots.
      await new Promise<void>((resolve, reject) => {
        const apiProcess = spawn('npm', ['run', 'dev'], {
          cwd: repositoryRoot,
          stdio: 'pipe',
          env: {
            ...process.env,
            DATABASE_URL: databaseUrl,
            REDIS_URL: redisUrl,
          },
        });

        let output = '';
        const startTimeout = setTimeout(() => {
          apiProcess.kill('SIGTERM');
          reject(
            new Error(
              `API did not emit a ready signal within 30 s. Output:\n${output}`,
            ),
          );
        }, 30_000);

        const handleData = (data: Buffer) => {
          const chunk = data.toString();
          output += chunk;
          if (
            /Nest application successfully started/i.test(output) ||
            /Application is running on/i.test(output)
          ) {
            clearTimeout(startTimeout);
            apiProcess.kill('SIGTERM');
            try {
              expect(output).not.toMatch(/ECONNREFUSED/);
              expect(output).not.toMatch(/connection refused/i);
              resolve();
            } catch (e) {
              reject(e instanceof Error ? e : new Error(String(e)));
            }
          }
        };

        apiProcess.stdout?.on('data', handleData);
        apiProcess.stderr?.on('data', handleData);

        apiProcess.on('error', (err) => {
          clearTimeout(startTimeout);
          reject(err);
        });
      });
    },
    STARTUP_SCENARIO_TIMEOUT,
  );
});
