import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const repositoryRoot = resolve(__dirname, '../../..');
const COMPOSE_TIMEOUT = 120_000;

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

describe('BNP-323: local Docker Compose services', () => {
  afterAll(() => {
    try {
      compose('down');
    } catch {
      // Cleanup must not hide the assertion result.
    }
  });

  it('starts PostgreSQL and Redis as healthy services and preserves their data across down/up cycle', () => {
    compose('up', '-d', 'postgres', 'redis', '--wait');

    const initial = parseServiceStatuses(compose('ps', '--format', 'json'));
    const postgres = initial.find((s) => s.Service === 'postgres');
    const redis = initial.find((s) => s.Service === 'redis');
    expect(postgres?.Health).toBe('healthy');
    expect(redis?.Health).toBe('healthy');

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

    // Use down/up cycle (not restart) to verify named volume persistence.
    compose('down');
    compose('up', '-d', 'postgres', 'redis', '--wait');

    const afterUp = parseServiceStatuses(compose('ps', '--format', 'json'));
    expect(afterUp.find((s) => s.Service === 'postgres')?.Health).toBe(
      'healthy',
    );
    expect(afterUp.find((s) => s.Service === 'redis')?.Health).toBe('healthy');

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
  });
});
