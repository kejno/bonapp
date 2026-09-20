import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { Redis } from 'ioredis';

const repositoryRoot = resolve(__dirname, '../../..');
const COMPOSE_TIMEOUT = 120_000;
const HEALTHCHECK_TIMEOUT = 120_000;
// Two full up+healthcheck cycles + data ops + down
const SCENARIO_TIMEOUT = 600_000;

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

function psql(...args: string[]): string {
  return execFileSync('psql', ['--host', 'localhost', '--port', '5432', '--username', 'postgres', ...args], {
    env: { ...process.env, PGPASSWORD: 'postgres' },
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 10_000,
  });
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function waitForServicesHealthy() {
  const deadline = Date.now() + HEALTHCHECK_TIMEOUT;
  let statuses: ServiceStatus[] = [];

  while (Date.now() < deadline) {
    statuses = parseServiceStatuses(compose('ps', '--format', 'json'));
    const postgres = statuses.find((s) => s.Service === 'postgres');
    const redis = statuses.find((s) => s.Service === 'redis');

    if (postgres?.Health === 'healthy' && redis?.Health === 'healthy') {
      return;
    }

    await wait(1_000);
  }

  throw new Error(
    `PostgreSQL and Redis did not become healthy within ${HEALTHCHECK_TIMEOUT} ms: ${JSON.stringify(statuses)}`,
  );
}

describe('BNP-323: local Docker Compose services', () => {
  afterAll(() => {
    try {
      compose('down');
    } catch {
      // Cleanup must not hide the assertion result.
    }
  });

  it(
    'starts PostgreSQL and Redis as healthy services and preserves their data across down/up cycle',
    async () => {
      // Step 1: execute the exact documented command, then wait for healthchecks separately.
      compose('up', '-d');
      await waitForServicesHealthy();

      const initial = parseServiceStatuses(compose('ps', '--format', 'json'));
      const postgres = initial.find((s) => s.Service === 'postgres');
      const redis = initial.find((s) => s.Service === 'redis');
      expect(postgres?.Health).toBe('healthy');
      expect(redis?.Health).toBe('healthy');

      // Step 3: write test data via localhost clients to verify host-port accessibility.
      const redisWrite = new Redis({ host: 'localhost', port: 6379 });
      try {
        await redisWrite.set('bnp323-persistence', 'preserved');
      } finally {
        await redisWrite.quit();
      }

      psql('--dbname', 'bonapp', '--command', 'CREATE TABLE IF NOT EXISTS bnp323_persistence (value text)');
      psql('--dbname', 'bonapp', '--command', "INSERT INTO bnp323_persistence (value) VALUES ('preserved')");

      // Step 4: down/up cycle to verify named volume persistence.
      compose('down');
      compose('up', '-d');
      await waitForServicesHealthy();

      const afterUp = parseServiceStatuses(compose('ps', '--format', 'json'));
      expect(afterUp.find((s) => s.Service === 'postgres')?.Health).toBe(
        'healthy',
      );
      expect(afterUp.find((s) => s.Service === 'redis')?.Health).toBe(
        'healthy',
      );

      // Step 5: verify test data survived the down/up cycle via localhost clients.
      const redisRead = new Redis({ host: 'localhost', port: 6379 });
      let redisValue: string | null;
      try {
        redisValue = await redisRead.get('bnp323-persistence');
      } finally {
        await redisRead.quit();
      }
      expect(redisValue).toBe('preserved');

      const pgResult = psql('--dbname', 'bonapp', '--tuples-only', '--no-align', '--command', 'SELECT value FROM bnp323_persistence LIMIT 1');
      expect(pgResult.trim()).toBe('preserved');
    },
    SCENARIO_TIMEOUT,
  );
});
