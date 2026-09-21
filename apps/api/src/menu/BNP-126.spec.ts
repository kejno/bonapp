import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repositoryRoot = resolve(__dirname, '../../../..');
const schemaPath = resolve(repositoryRoot, 'apps/api/prisma/schema.prisma');
const migrationPath = resolve(
  repositoryRoot,
  'apps/api/prisma/migrations/20260918000000_menu_schema/migration.sql',
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

    it('uses Decimal(10,2) for monetary fields', () => {
      expect(schema).toContain('@db.Decimal(10,2)');
    });

    it('uses String[] for allergens field', () => {
      expect(schema).toMatch(/allergens\s+String\[\]/);
    });

    it('defines partial index on (tenantId, categoryId)', () => {
      expect(schema).toContain('idx_menu_items_tenant_cat');
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
  });

  describe('migration SQL — DDL correctness', () => {
    it('creates MenuCategory table', () => {
      expect(migration).toContain('CREATE TABLE "MenuCategory"');
    });

    it('creates MenuItem table', () => {
      expect(migration).toContain('CREATE TABLE "MenuItem"');
    });

    it('creates ModifierGroup table', () => {
      expect(migration).toContain('CREATE TABLE "ModifierGroup"');
    });

    it('creates ModifierOption table', () => {
      expect(migration).toContain('CREATE TABLE "ModifierOption"');
    });

    it('uses DECIMAL(10,2) for price_byn and cost_price_byn', () => {
      const priceMatches = (migration.match(/DECIMAL\(10,2\)/g) ?? []).length;
      expect(priceMatches).toBeGreaterThanOrEqual(3);
    });

    it('uses TEXT[] for allergens column', () => {
      expect(migration).toContain('TEXT[]');
    });

    it('creates partial index on (tenantId, categoryId) WHERE isActive = TRUE', () => {
      expect(migration).toMatch(
        /CREATE INDEX "idx_menu_items_tenant_cat".*WHERE "isActive" = TRUE/s,
      );
    });

    it('adds foreign keys for all relations', () => {
      expect(migration).toContain('MenuCategory_tenantId_fkey');
      expect(migration).toContain('MenuItem_tenantId_fkey');
      expect(migration).toContain('MenuItem_tenantId_categoryId_fkey');
      expect(migration).toContain('ModifierGroup_tenantId_itemId_fkey');
      expect(migration).toContain('ModifierOption_groupId_fkey');
    });

    it('uses composite foreign keys for tenant-scoped category and item references', () => {
      expect(migration).toContain(
        'FOREIGN KEY ("tenantId", "categoryId") REFERENCES "MenuCategory"("tenantId", "id")',
      );
      expect(migration).toContain(
        'FOREIGN KEY ("tenantId", "itemId") REFERENCES "MenuItem"("tenantId", "id")',
      );
    });
  });
});
