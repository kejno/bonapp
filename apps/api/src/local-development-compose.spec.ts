import { isPostgresPortConflict } from './local-development-compose';

describe('isPostgresPortConflict', () => {
  it('accepts a Docker bind conflict for the PostgreSQL port', () => {
    const error = Object.assign(new Error('Command failed'), {
      stderr: 'Bind for 0.0.0.0:5432 failed: port is already allocated\n',
    });

    expect(isPostgresPortConflict(error)).toBe(true);
  });

  it('accepts a Docker bind conflict reported through standard output', () => {
    const error = Object.assign(new Error('Command failed'), {
      stdout: 'Bind for 0.0.0.0:5432 failed: port is already allocated\n',
    });

    expect(isPostgresPortConflict(error)).toBe(true);
  });

  it.each([
    new Error('Cannot connect to the Docker daemon'),
    Object.assign(new Error('Command failed'), {
      stderr: 'pull access denied for postgres:15',
    }),
    Object.assign(new Error('Command failed'), {
      stderr: 'Bind for 0.0.0.0:6379 failed: port is already allocated',
    }),
  ])('rejects unrelated Compose failures', (error) => {
    expect(isPostgresPortConflict(error)).toBe(false);
  });
});
