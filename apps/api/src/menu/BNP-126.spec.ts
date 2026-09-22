import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repositoryRoot = resolve(__dirname, '../../../..');
const schemaPath = resolve(repositoryRoot, 'apps/api/prisma/schema.prisma');
const migrationPath = resolve(
  repositoryRoot,
  'apps/api/prisma/migrations/20260922060000_extend_menu_schema/migration.sql',
);

describe('BNP-126: menu schema — Prisma models and migration', () => {
  let schema: string;
  let migration: string;

  beforeAll(() => {
    schema = readFileSync(schemaPath, 'utf8');
    migration = readFileSync(migrationPath, 'utf8');
  });

  describe('Prisma schema — model definitions', () => {
    it('defines MenuCategory model', () => {
      expect(schema).toContain('model MenuCategory {');
    });

    it('defines MenuCategory with tenant isolation and sort order', () => {
      expect(schema).toContain('tenantId');
      expect(schema).toContain('sortOrder');
      expect(schema).toContain('isActive');
    });

    it('defines MenuItem model', () => {
      expect(schema).toContain('model MenuItem {');
    });

    it('defines MenuItem with all required fields', () => {
      expect(schema).toContain('priceByn');
      expect(schema).toContain('costPriceByn');
      expect(schema).toContain('allergens');
      expect(schema).toContain('isInStopList');
      expect(schema).toContain('isHit');
      expect(schema).toContain('posItemId');
      expect(schema).toContain('kitchenDepartment');
      expect(schema).toContain('cookingTimeMinutes');
    });

    it('uses Decimal(10, 2) for monetary fields', () => {
      expect(schema).toContain('@db.Decimal(10, 2)');
    });

    it('uses String[] for allergens field', () => {
      expect(schema).toMatch(/allergens\s+String\[\]/);
    });

    it('leaves the partial menu item index under manual SQL migration management', () => {
      expect(schema).toContain(
        'idx_menu_items_tenant_cat is managed in migration SQL because Prisma does not support partial indexes.',
      );
      expect(schema).not.toContain(
        '@@index([tenantId, categoryId], map: "idx_menu_items_tenant_cat")',
      );
    });

    it('defines ModifierGroup model', () => {
      expect(schema).toContain('model ModifierGroup {');
    });

    it('defines ModifierGroup with selection constraints', () => {
      expect(schema).toContain('isRequired');
      expect(schema).toContain('minSelection');
      expect(schema).toContain('maxSelection');
    });

    it('defines ModifierOption model', () => {
      expect(schema).toContain('model ModifierOption {');
    });

    it('defines ModifierOption with extra price and default flag', () => {
      expect(schema).toContain('extraPriceByn');
      expect(schema).toContain('isDefault');
    });

    it('wires relations: Tenant → MenuCategory, Tenant → MenuItem, Tenant → ModifierGroup', () => {
      expect(schema).toContain('menuCategories');
      expect(schema).toContain('menuItems');
      expect(schema).toContain('modifierGroups');
    });

    it('keeps category and item references within the same tenant', () => {
      expect(schema).toContain('@@unique([tenantId, id])');
      expect(schema).toContain(
        '@relation(fields: [tenantId, categoryId], references: [tenantId, id])',
      );
      expect(schema).toContain(
        '@relation(fields: [tenantId, itemId], references: [tenantId, id])',
      );
    });

    it('maps menu models and multiword fields to the physical snake_case contract', () => {
      expect(schema).toContain('@@map("menu_categories")');
      expect(schema).toContain('@@map("menu_items")');
      expect(schema).toContain('@@map("modifier_groups")');
      expect(schema).toContain('@@map("modifier_options")');
      expect(schema).toContain('@map("tenant_id")');
      expect(schema).toContain('@map("price_byn")');
    });
  });

  describe('migration SQL — DDL correctness', () => {
    it('is ordered after the core schema migrations and targets the renamed tenants table', () => {
      expect(migrationPath).toContain('20260922060000_extend_menu_schema');
      expect(migration).not.toContain('REFERENCES "Tenant"');
      expect(migration).toContain('REFERENCES "menu_categories"');
      expect(migration).toContain('REFERENCES "menu_items"');
    });

    it('extends menu_categories table', () => {
      expect(migration).toContain('ALTER TABLE "menu_categories"');
    });

    it('extends menu_items table', () => {
      expect(migration).toContain('ALTER TABLE "menu_items"');
    });

    it('extends modifier_groups table', () => {
      expect(migration).toContain('ALTER TABLE "modifier_groups"');
    });

    it('creates ModifierOption table', () => {
      expect(migration).toContain('CREATE TABLE "modifier_options"');
    });

    it('uses DECIMAL(10,2) for price_byn and cost_price_byn', () => {
      expect(migration).toContain('"cost_price_byn" DECIMAL(10,2)');
      expect(migration).toContain('"extra_price_byn" DECIMAL(10,2)');
    });

    it('uses TEXT[] for allergens column', () => {
      expect(migration).toContain('TEXT[]');
    });

    it('creates partial index on (tenant_id, category_id) WHERE is_active = TRUE', () => {
      expect(migration).toMatch(
        /CREATE INDEX "idx_menu_items_tenant_cat".*WHERE "is_active" = TRUE/s,
      );
    });

    it('adds foreign keys for all relations', () => {
      expect(migration).toContain('menu_items_tenant_id_category_id_fkey');
      expect(migration).toContain('modifier_groups_tenant_id_item_id_fkey');
      expect(migration).toContain('modifier_options_group_id_fkey');
    });

    it('uses composite foreign keys for tenant-scoped category and item references', () => {
      expect(migration).toContain(
        'FOREIGN KEY ("tenant_id", "category_id") REFERENCES "menu_categories"("tenant_id", "id")',
      );
      expect(migration).toContain(
        'FOREIGN KEY ("tenant_id", "item_id") REFERENCES "menu_items"("tenant_id", "id")',
      );
    });

    it('protects all menu monetary values from negative writes', () => {
      expect(migration).toContain('menu_items_price_byn_non_negative_check');
      expect(migration).toContain('menu_items_cost_price_byn_non_negative_check');
      expect(migration).toContain('modifier_options_extra_price_byn_non_negative_check');
    });
  });
});
