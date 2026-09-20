import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repositoryRoot = resolve(__dirname, '../../..');
const compose = (...args: string[]) =>
  execFileSync('docker', ['compose', ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  });

describe('BNP-324: API local environment template', () => {
  afterAll(() => {
    try {
      compose('down');
    } catch {
      // Cleanup must not hide the assertion result.
    }
  });

  it('provides local PostgreSQL and Redis URLs and starts their services', () => {
    const environment = readFileSync(
      resolve(repositoryRoot, 'apps/api/.env.example'),
      'utf8',
    );

    expect(environment).toContain(
      'DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bonapp',
    );
    expect(environment).toContain('REDIS_URL=redis://localhost:6379');
    expect(() => compose('up', '-d', 'postgres', 'redis')).not.toThrow();

    const services = compose('ps', '--format', 'json');
    expect(services).toContain('postgres');
    expect(services).toContain('redis');
    expect(services).toContain('healthy');
  });
});
