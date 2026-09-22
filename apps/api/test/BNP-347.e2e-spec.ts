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

    expect(() =>
      prisma(databaseUrl, 'generate', '--schema', 'prisma/schema.prisma'),
    ).not.toThrow();
    expect(() => prisma(databaseUrl, 'migrate', 'deploy')).not.toThrow();

    expect(
      sql(
        "SELECT string_agg(tablename, ',' ORDER BY tablename) FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('tenants', 'users', 'dining_areas', 'tables')",
      ),
    ).toBe('dining_areas,tables,tenants,users');
    expect(
      sql(
        "SELECT string_agg(extname, ',' ORDER BY extname) FROM pg_extension WHERE extname IN ('pgcrypto', 'uuid-ossp')",
      ),
    ).toBe('pgcrypto,uuid-ossp');
    expect(
      sql(
        "SELECT enumlabel FROM pg_enum WHERE enumtypid = '" +
          '"UserRole"' +
          "'::regtype ORDER BY enumsortorder",
      ),
    ).toBe('SUPER_ADMIN\nOWNER\nMANAGER\nWAITER\nCHEF\nCASHIER');
    expect(
      sql(
        "SELECT indexname FROM pg_indexes WHERE tablename = 'tables' AND indexname = 'idx_tables_qr_token'",
      ),
    ).toBe('idx_tables_qr_token');
    expect(
      sql(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name IN ('id', 'slug', 'name', 'created_at', 'updated_at') ORDER BY column_name",
      ),
    ).toBe('created_at\nid\nname\nslug\nupdated_at');
    expect(
      sql(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name IN ('id', 'tenant_id', 'email', 'password_hash', 'full_name', 'role', 'created_at') ORDER BY column_name",
      ),
    ).toBe('created_at\nemail\nfull_name\nid\npassword_hash\nrole\ntenant_id');
    expect(
      sql(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'dining_areas' AND column_name IN ('id', 'tenant_id', 'name', 'is_active', 'sort_order', 'created_at', 'updated_at') ORDER BY column_name",
      ),
    ).toBe(
      'created_at\nid\nis_active\nname\nsort_order\ntenant_id\nupdated_at',
    );
    expect(
      sql(
        "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'tables' AND column_name IN ('id', 'tenant_id', 'area_id', 'table_number', 'seats_count', 'qr_token', 'status', 'created_at') ORDER BY column_name",
      ),
    ).toBe(
      'area_id\ncreated_at\nid\nqr_token\nseats_count\nstatus\ntable_number\ntenant_id',
    );
    expect(
      sql(
        "SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'tenants' AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%(slug)%'",
      ),
    ).toContain('UNIQUE');
    expect(
      sql(
        "SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'users' AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%(tenant_id, email)%'",
      ),
    ).toContain('UNIQUE');
    expect(
      sql(
        "SELECT tc.table_name || '.' || kcu.column_name || '->' || ccu.table_name || '.' || ccu.column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.constraint_schema = tc.table_schema WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public' AND tc.table_name IN ('users', 'dining_areas', 'tables') ORDER BY 1",
      ),
    ).toContain('dining_areas.tenant_id->tenants.id');
    expect(
      sql(
        "SELECT tc.table_name || '.' || kcu.column_name || '->' || ccu.table_name || '.' || ccu.column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.constraint_schema = tc.table_schema WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public' AND tc.table_name IN ('users', 'dining_areas', 'tables') ORDER BY 1",
      ),
    ).toContain('tables.area_id->dining_areas.id');
    expect(
      sql(
        "SELECT tc.table_name || '.' || kcu.column_name || '->' || ccu.table_name || '.' || ccu.column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.constraint_schema = tc.table_schema WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public' AND tc.table_name IN ('users', 'dining_areas', 'tables') ORDER BY 1",
      ),
    ).toContain('tables.tenant_id->tenants.id');
    expect(
      sql(
        "SELECT tc.table_name || '.' || kcu.column_name || '->' || ccu.table_name || '.' || ccu.column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.constraint_schema = tc.table_schema WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public' AND tc.table_name IN ('users', 'dining_areas', 'tables') ORDER BY 1",
      ),
    ).toContain('users.tenant_id->tenants.id');
  }, 120_000);
});
