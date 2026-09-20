import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const repositoryRoot = resolve(__dirname, '../../..');
const compose = (...args: string[]) =>
  execFileSync('docker', ['compose', ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  });

describe('BNP-323: local Docker Compose services', () => {
  afterAll(() => {
    try {
      compose('down');
    } catch {
      // Cleanup must not hide the assertion result.
    }
  });

  it('starts PostgreSQL and Redis as healthy services and preserves their data', () => {
    expect(() => compose('up', '-d')).not.toThrow();

    const services = compose('ps', '--format', 'json');
    expect(services).toContain('postgres');
    expect(services).toContain('redis');
    expect(services).toContain('healthy');

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

    compose('restart', 'postgres', 'redis');

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
