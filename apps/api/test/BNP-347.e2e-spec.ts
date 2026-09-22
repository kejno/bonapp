import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const apiDirectory = resolve(__dirname, '..');

describe('BNP-347: начальная Prisma-миграция', () => {
  let container: string;
  let port: string;

  function docker(...args: string[]): string {
    return execFileSync('docker', args, { encoding: 'utf8', stdio: 'pipe' });
  }

  function prisma(databaseUrl: string, ...args: string[]): string {
    return execFileSync('npx', ['prisma', ...args], {
      cwd: apiDirectory,
      encoding: 'utf8',
      stdio: 'pipe',
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
  }

  function sql(statement: string): string {
    return docker(
      'exec',
      container,
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-v',
      'ON_ERROR_STOP=1',
      '-tAc',
      statement,
    ).trim();
  }

  beforeAll(() => {
    container = docker(
      'run',
      '--detach',
      '--rm',
      '--publish',
      '127.0.0.1::5432',
      '--env',
      'POSTGRES_PASSWORD=postgres',
      'postgres:15',
    ).trim();
    port = docker('port', container, '5432/tcp').trim().split(':').at(-1)!;

    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        sql('SELECT 1');
        return;
      } catch {
        if (attempt === 29) throw new Error('PostgreSQL did not become ready');
        execFileSync('sleep', ['1']);
      }
    }
  }, 60_000);

  afterAll(() => {
    if (container) docker('stop', container);
  });

  it('генерирует Prisma Client и применяет историю миграций к чистой БД', () => {
    const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;

    expect(() => prisma(databaseUrl, 'generate', '--schema', 'prisma/schema.prisma')).not.toThrow();
    expect(() => prisma(databaseUrl, 'migrate', 'deploy')).not.toThrow();

    expect(sql("SELECT string_agg(tablename, ',' ORDER BY tablename) FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('tenants', 'users', 'dining_areas', 'tables')")).toBe(
      'dining_areas,tables,tenants,users',
    );
    expect(sql("SELECT string_agg(extname, ',' ORDER BY extname) FROM pg_extension WHERE extname IN ('pgcrypto', 'uuid-ossp')")).toBe(
      'pgcrypto,uuid-ossp',
    );
    expect(sql("SELECT enumlabel FROM pg_enum WHERE enumtypid = '" + '"UserRole"' + "'::regtype ORDER BY enumsortorder")).toBe(
      'SUPER_ADMIN\nOWNER\nMANAGER\nWAITER\nCHEF\nCASHIER',
    );
    expect(sql("SELECT indexname FROM pg_indexes WHERE tablename = 'tables' AND indexname = 'idx_tables_qr_token'"))
      .toBe('idx_tables_qr_token');
  }, 120_000);
});
