import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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

describe('BNP-324: API local environment template', () => {
  afterAll(() => {
    try {
      compose('down');
    } catch {
      // Cleanup must not hide the assertion result.
    }
  });

  it('provides local PostgreSQL and Redis URLs and starts their services as healthy', () => {
    const environment = readFileSync(
      resolve(repositoryRoot, 'apps/api/.env.example'),
      'utf8',
    );

    expect(environment).toContain(
      'DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bonapp',
    );
    expect(environment).toContain('REDIS_URL=redis://localhost:6379');

    compose('up', '-d', 'postgres', 'redis', '--wait');

    const statuses = parseServiceStatuses(compose('ps', '--format', 'json'));
    const postgres = statuses.find((s) => s.Service === 'postgres');
    const redis = statuses.find((s) => s.Service === 'redis');
    expect(postgres?.Health).toBe('healthy');
    expect(redis?.Health).toBe('healthy');
  });
});
