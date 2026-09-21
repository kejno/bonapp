import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const schemaPath = join(process.cwd(), 'prisma', 'schema.prisma');
const schema = readFileSync(schemaPath, 'utf8');
const rlsMigrationPath = join(
  process.cwd(),
  'prisma',
  'migrations',
  '20260921130000_enable_rls_for_dining_areas_and_tables',
  'migration.sql',
);

describe('Prisma core schema', () => {
  it('defines the tenant, user, dining area, and table data contracts', () => {
    expect(schema).toContain('enum UserRole');
    expect(schema).toContain('SUPER_ADMIN');
    expect(schema).toContain('enum TableStatus');
    expect(schema).toContain('AVAILABLE');
    expect(schema).toContain('model DiningArea');
    expect(schema).toContain('@@map("dining_areas")');
    expect(schema).toContain('model Table');
    expect(schema).toContain('@@unique([tenantId, tableNumber])');
    expect(schema).toContain('@@index([qrToken], map: "idx_tables_qr_token")');
  });

  it('uses independent service-mode flags and a string subscription plan', () => {
    expect(schema).toMatch(/dineIn\s+Boolean\s+@default\(true\)/);
    expect(schema).toMatch(/takeaway\s+Boolean\s+@default\(false\)/);
    expect(schema).toMatch(/delivery\s+Boolean\s+@default\(false\)/);
    expect(schema).toMatch(/subscriptionPlan\s+String/);
  });

  it('enables RLS for every new tenant-dependent table', () => {
    const migration = readFileSync(rlsMigrationPath, 'utf8');

    expect(migration).toContain('ALTER TABLE "dining_areas" ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('ALTER TABLE "tables" ENABLE ROW LEVEL SECURITY');
    expect(migration).toMatch(/"tenant_id" = current_setting/);
  });
});
