import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationsDirectory = join(__dirname, '../../prisma/migrations');

describe('Prisma migration history', () => {
  it('keeps applied migrations intact and appends tenant changes after main', () => {
    const expandedCoreSchema = readFileSync(
      join(
        migrationsDirectory,
        '20260921120000_expand_core_schema/migration.sql',
      ),
      'utf8',
    );

    expect(expandedCoreSchema).toContain(
      'CREATE UNIQUE INDEX "users_email_key" ON "users"("email");',
    );
    expect(
      existsSync(
        join(
          migrationsDirectory,
          '20260922000000_enable_rls_for_users_and_tenants',
        ),
      ),
    ).toBe(true);
    expect(
      existsSync(
        join(
          migrationsDirectory,
          '20260922010000_enable_rls_for_dining_areas_and_tables',
        ),
      ),
    ).toBe(true);
    expect(
      existsSync(
        join(
          migrationsDirectory,
          '20260922020000_enable_rls_for_orders_and_payments',
        ),
      ),
    ).toBe(true);
    expect(
      existsSync(
        join(
          migrationsDirectory,
          '20260922030000_drop_email_unique_add_tenant_email_unique',
        ),
      ),
    ).toBe(true);
  });

  it('adds the login migration after every migration already on main', () => {
    const migrations = readdirSync(migrationsDirectory);

    expect(migrations).toContain('20260925000000_add_totp_and_blocked_to_users');
    expect(migrations).not.toContain('20260924000000_add_totp_and_blocked_to_users');
  });
});
