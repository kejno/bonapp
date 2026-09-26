import {
  PrismaService,
  scopedDelegateOperation,
  scopeTenantQueryArgs,
  TENANT_SCOPED_MODELS,
} from './prisma.service';
import { PrismaClient } from '@prisma/client';

describe('PrismaService tenant query scope', () => {
  it('does not expose PrismaClient delegates through the injectable service', () => {
    expect(Object.getPrototypeOf(PrismaService.prototype)).not.toBe(
      PrismaClient.prototype,
    );
  });

  it('registers every model that contains tenant data', () => {
    expect(TENANT_SCOPED_MODELS).toEqual(
      new Set([
        'User',
        'Tenant',
        'DiningArea',
        'Table',
        'Order',
        'OrderItem',
        'Payment',
        'MenuCategory',
        'MenuItem',
        'ModifierGroup',
        'ModifierOption',
        'Modifier',
        'MenuItemModifierGroup',
        'StopListItem',
        'Shift',
        'ShiftReport',
      ]),
    );
  });

  it('adds tenantId to every create payload, including multiple rows', () => {
    expect(
      scopeTenantQueryArgs(
        'User',
        'createMany',
        {
          data: [{ email: 'a@test' }, { email: 'b@test', tenantId: 'other' }],
        },
        'tenant-a',
      ),
    ).toEqual({
      data: [
        { email: 'a@test', tenantId: 'tenant-a' },
        { email: 'b@test', tenantId: 'tenant-a' },
      ],
    });
  });

  it('uses the composite tenant/email key for a user upsert', () => {
    const input = {
      where: { email: 'shared@test' },
      create: { email: 'shared@test' },
      update: { fullName: 'Updated' },
    };
    const tenantA = scopeTenantQueryArgs('User', 'upsert', input, 'tenant-a');
    const tenantB = scopeTenantQueryArgs('User', 'upsert', input, 'tenant-b');

    expect(tenantA).toEqual({
      where: {
        tenantId_email: { tenantId: 'tenant-a', email: 'shared@test' },
      },
      create: { email: 'shared@test', tenantId: 'tenant-a' },
      update: { fullName: 'Updated', tenantId: 'tenant-a' },
    });
    expect(tenantB).toEqual(
      expect.objectContaining({
        where: {
          tenantId_email: { tenantId: 'tenant-b', email: 'shared@test' },
        },
      }),
    );
  });

  it('adds tenantId to the lookup and payload of a non-user upsert', () => {
    const input = {
      where: { id: 'area-a' },
      create: { id: 'area-a', name: 'Main hall' },
      update: { name: 'Updated hall' },
    };

    expect(
      scopeTenantQueryArgs('DiningArea', 'upsert', input, 'tenant-a'),
    ).toEqual({
      where: { id: 'area-a', tenantId: 'tenant-a' },
      create: { id: 'area-a', name: 'Main hall', tenantId: 'tenant-a' },
      update: { name: 'Updated hall', tenantId: 'tenant-a' },
    });
    expect(input).toEqual({
      where: { id: 'area-a' },
      create: { id: 'area-a', name: 'Main hall' },
      update: { name: 'Updated hall' },
    });
  });

  it('replaces a tenant lookup id with the active tenant for tenant upserts', () => {
    expect(
      scopeTenantQueryArgs(
        'Tenant',
        'upsert',
        {
          where: { id: 'other-tenant' },
          create: { slug: 'tenant-a' },
          update: { name: 'Updated tenant' },
        },
        'tenant-a',
      ),
    ).toEqual({
      where: { id: 'tenant-a' },
      create: { slug: 'tenant-a', id: 'tenant-a' },
      update: { name: 'Updated tenant', id: 'tenant-a' },
    });
  });

  it('adds the tenant filter to reads and does not mutate caller arguments', () => {
    const args = { where: { email: 'a@test' } };

    expect(scopeTenantQueryArgs('User', 'findMany', args, 'tenant-a')).toEqual({
      where: { email: 'a@test', tenantId: 'tenant-a' },
    });
    expect(args).toEqual({ where: { email: 'a@test' } });
  });

  it.each(['findUnique', 'findUniqueOrThrow'])(
    'uses the composite key for a user %s lookup by email',
    (operation) => {
      const args = { where: { email: 'shared@test' } };

      expect(scopeTenantQueryArgs('User', operation, args, 'tenant-a')).toEqual(
        {
          where: {
            tenantId_email: { tenantId: 'tenant-a', email: 'shared@test' },
          },
        },
      );
      expect(args).toEqual({ where: { email: 'shared@test' } });
    },
  );

  it('scopes dining areas and tables by tenantId', () => {
    expect(
      scopeTenantQueryArgs(
        'DiningArea',
        'findMany',
        { where: { isActive: true } },
        'tenant-a',
      ),
    ).toEqual({ where: { isActive: true, tenantId: 'tenant-a' } });

    expect(
      scopeTenantQueryArgs(
        'Table',
        'create',
        { data: { tableNumber: 1, tenantId: 'other' } },
        'tenant-a',
      ),
    ).toEqual({ data: { tableNumber: 1, tenantId: 'tenant-a' } });
  });

  it('scopes orders and payments by tenantId', () => {
    expect(
      scopeTenantQueryArgs(
        'Order',
        'findMany',
        { where: { status: 'NEW' } },
        'tenant-a',
      ),
    ).toEqual({ where: { status: 'NEW', tenantId: 'tenant-a' } });

    expect(
      scopeTenantQueryArgs(
        'Payment',
        'create',
        { data: { orderId: 'order-a' } },
        'tenant-a',
      ),
    ).toEqual({ data: { orderId: 'order-a', tenantId: 'tenant-a' } });
  });

  it('scopes order items through their owning order', () => {
    expect(
      scopeTenantQueryArgs(
        'OrderItem',
        'findMany',
        { where: { status: 'NEW' } },
        'tenant-a',
      ),
    ).toEqual({
      where: {
        AND: [{ status: 'NEW' }, { order: { is: { tenantId: 'tenant-a' } } }],
      },
    });

    expect(
      scopeTenantQueryArgs(
        'OrderItem',
        'deleteMany',
        { where: { id: 'item-b' } },
        'tenant-a',
      ),
    ).toEqual({
      where: {
        AND: [{ id: 'item-b' }, { order: { is: { tenantId: 'tenant-a' } } }],
      },
    });
  });

  it('scopes menu records by tenant and modifier options through their group', () => {
    expect(
      scopeTenantQueryArgs(
        'MenuItem',
        'create',
        { data: { categoryId: 'category-a', tenantId: 'other' } },
        'tenant-a',
      ),
    ).toEqual({
      data: { categoryId: 'category-a', tenantId: 'tenant-a' },
    });

    expect(
      scopeTenantQueryArgs(
        'ModifierOption',
        'findMany',
        { where: { isDefault: true } },
        'tenant-a',
      ),
    ).toEqual({
      where: {
        AND: [{ isDefault: true }, { group: { is: { tenantId: 'tenant-a' } } }],
      },
    });
  });

  it('scopes Modifier, MenuItemModifierGroup, and StopListItem by tenantId', () => {
    expect(
      scopeTenantQueryArgs(
        'Modifier',
        'create',
        { data: { modifierGroupId: 'group-a', tenantId: 'other' } },
        'tenant-a',
      ),
    ).toEqual({ data: { modifierGroupId: 'group-a', tenantId: 'tenant-a' } });

    expect(
      scopeTenantQueryArgs(
        'MenuItemModifierGroup',
        'findMany',
        { where: { menuItemId: 'item-a' } },
        'tenant-a',
      ),
    ).toEqual({ where: { menuItemId: 'item-a', tenantId: 'tenant-a' } });

    expect(
      scopeTenantQueryArgs(
        'StopListItem',
        'create',
        { data: { menuItemId: 'item-a' } },
        'tenant-a',
      ),
    ).toEqual({ data: { menuItemId: 'item-a', tenantId: 'tenant-a' } });
  });

  it('uses a filter-capable delegate for uniquely addressed order items', () => {
    expect(scopedDelegateOperation('OrderItem', 'findUnique')).toBe(
      'findFirst',
    );
    expect(scopedDelegateOperation('OrderItem', 'findUniqueOrThrow')).toBe(
      'findFirstOrThrow',
    );
    expect(scopedDelegateOperation('ModifierOption', 'findUnique')).toBe(
      'findFirst',
    );
    expect(scopedDelegateOperation('User', 'findUnique')).toBe('findUnique');
  });

  it('rejects order item upserts because Prisma cannot scope its unique lookup', () => {
    expect(() =>
      scopeTenantQueryArgs(
        'OrderItem',
        'upsert',
        { where: { id: 'item-b' }, create: {}, update: {} },
        'tenant-a',
      ),
    ).toThrow('OrderItem upsert is not supported');
  });

  it('rejects modifier option upserts because Prisma cannot scope its unique lookup', () => {
    expect(() =>
      scopeTenantQueryArgs(
        'ModifierOption',
        'upsert',
        { where: { id: 'option-b' }, create: {}, update: {} },
        'tenant-a',
      ),
    ).toThrow('ModifierOption upsert is not supported');
  });
});
