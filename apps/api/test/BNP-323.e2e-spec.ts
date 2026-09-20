import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

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

      // Step 3: write test data to both services.
      compose(
        'exec',
        '-T',
        'redis',
        'redis-cli',
        'SET',
        'bnp323-persistence',
        'preserved',
      );
      compose(
        'exec',
        '-T',
        'postgres',
        'psql',
        '-U',
        'postgres',
        '-d',
        'bonapp',
        '-c',
        'CREATE TABLE IF NOT EXISTS bnp323_persistence (value text)',
      );
      compose(
        'exec',
        '-T',
        'postgres',
        'psql',
        '-U',
        'postgres',
        '-d',
        'bonapp',
        '-c',
        "INSERT INTO bnp323_persistence (value) VALUES ('preserved')",
      );

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

      // Step 5: verify test data survived the down/up cycle.
      expect(
        compose('exec', '-T', 'redis', 'redis-cli', 'GET', 'bnp323-persistence'),
      ).toContain('preserved');
      expect(
        compose(
          'exec',
          '-T',
          'postgres',
          'psql',
          '-U',
          'postgres',
          '-d',
          'bonapp',
          '-tAc',
          'SELECT value FROM bnp323_persistence LIMIT 1',
        ),
      ).toContain('preserved');
    },
    SCENARIO_TIMEOUT,
  );
});
