import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const schemaPath = join(process.cwd(), 'prisma', 'schema.prisma');
const schema = readFileSync(schemaPath, 'utf8');
const ordersMigrationPath = join(
  process.cwd(),
  'prisma',
  'migrations',
  '20260921130000_orders_payments',
  'migration.sql',
);
const ordersMigration = readFileSync(ordersMigrationPath, 'utf8');
const packageJson = JSON.parse(
  readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
) as { scripts: Record<string, string> };

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

  it('keeps order, table, waiter, and payment references within one tenant', () => {
    expect(schema).toContain(
      'assignedWaiter   User?          @relation("AssignedWaiterOrders", fields: [assignedWaiterId, tenantId], references: [id, tenantId], onDelete: Restrict)',
    );
    expect(schema).toContain(
      'order                 Order         @relation(fields: [orderId, tenantId], references: [id, tenantId], onDelete: Cascade)',
    );
    expect(schema).toContain('@@unique([id, tenantId])');
    expect(ordersMigration).toContain(
      'FOREIGN KEY ("order_id", "tenant_id") REFERENCES "orders"("id", "tenant_id")',
    );
    expect(ordersMigration).toContain(
      'FOREIGN KEY ("assigned_waiter_id", "tenant_id") REFERENCES "users"("id", "tenant_id")',
    );
  });

  it('adds orders incrementally after the core schema migrations', () => {
    expect(ordersMigration).not.toContain('CREATE TABLE "Tenant"');
    expect(ordersMigration).not.toContain('CREATE TABLE "User"');
    expect(ordersMigration).toContain('CREATE TABLE "orders"');
    expect(ordersMigration).toContain('CREATE TABLE "order_items"');
    expect(ordersMigration).toContain('CREATE TABLE "payments"');
  });

  it('generates the Prisma client before unit tests', () => {
    expect(packageJson.scripts.pretest).toBe(
      'prisma generate --schema prisma/schema.prisma',
    );
  });

  it('protects order and payment monetary values with database constraints', () => {
    expect(ordersMigration).toContain('CHECK ("daily_order_number" > 0)');
    expect(ordersMigration).toContain('CHECK ("total_amount_byn" >= 0)');
    expect(ordersMigration).toContain('CHECK ("tips_amount_byn" >= 0)');
    expect(ordersMigration).toContain('CHECK ("quantity" > 0)');
    expect(ordersMigration).toContain('CHECK ("unit_price_byn" >= 0)');
    expect(ordersMigration).toContain('CHECK ("amount_byn" >= 0)');
  });
});
