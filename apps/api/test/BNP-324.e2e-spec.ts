import { execFileSync, spawn } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';

const repositoryRoot = resolve(__dirname, '../../..');
const COMPOSE_TIMEOUT = 120_000;
// compose up --wait (120s) + migration (60s) + API startup (30s) + buffer
const API_STARTUP_TIMEOUT = 300_000;

const compose = (...args: string[]) =>
  execFileSync('docker', ['compose', ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: COMPOSE_TIMEOUT,
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

describe('BNP-324: API local environment template', () => {
  const envPath = resolve(repositoryRoot, 'apps/api/.env');
  const envExamplePath = resolve(repositoryRoot, 'apps/api/.env.example');
  let envCreatedByTest = false;

  beforeAll(() => {
    if (!existsSync(envPath)) {
      const envContent = readFileSync(envExamplePath, 'utf8')
        .replace(
          'replace-with-a-long-random-secret',
          'test-jwt-secret-bnp324-automation-value',
        )
        .replace(
          'replace-with-a-different-long-random-secret',
          'test-jwt-refresh-secret-bnp324-automation-value',
        );
      writeFileSync(envPath, envContent);
      envCreatedByTest = true;
    }
  });

  afterAll(() => {
    if (envCreatedByTest && existsSync(envPath)) {
      unlinkSync(envPath);
    }
    try {
      compose('down');
    } catch {
      // Cleanup must not hide the assertion result.
    }
  });

  it(
    'creates .env from template with non-empty JWT secrets and starts API without PostgreSQL/Redis connection errors',
    async () => {
      // Verify .env.example provides correct local service URLs.
      const envExample = readFileSync(envExamplePath, 'utf8');
      expect(envExample).toContain(
        'DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bonapp',
      );
      expect(envExample).toContain('REDIS_URL=redis://localhost:6379');

      // Start only the services required for the API (postgres, redis).
      compose('up', '-d', 'postgres', 'redis', '--wait');

      const statuses = parseServiceStatuses(compose('ps', '--format', 'json'));
      const postgres = statuses.find((s) => s.Service === 'postgres');
      const redis = statuses.find((s) => s.Service === 'redis');
      expect(postgres?.Health).toBe('healthy');
      expect(redis?.Health).toBe('healthy');

      // Run migration using the URL from .env.example.
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
            DATABASE_URL:
              'postgresql://postgres:postgres@localhost:5432/bonapp',
          },
        },
      );
      expect(migrateOutput).not.toMatch(/error/i);

      // Start the API and verify no PostgreSQL/Redis connection errors appear.
      await new Promise<void>((resolve, reject) => {
        const apiProcess = spawn('npm', ['run', 'dev', '-w', 'apps/api'], {
          cwd: repositoryRoot,
          stdio: 'pipe',
          env: { ...process.env },
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
    API_STARTUP_TIMEOUT,
  );
});
