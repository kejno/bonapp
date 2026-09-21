import {
  scopeTenantQueryArgs,
  TENANT_SCOPED_MODELS,
} from './prisma.service';

describe('PrismaService tenant query scope', () => {
  it('registers User and Tenant as tenant-scoped models', () => {
    expect(TENANT_SCOPED_MODELS).toEqual(new Set(['User', 'Tenant']));
  });

  it('adds tenantId to every create payload, including multiple rows', () => {
    expect(
      scopeTenantQueryArgs(
        'User',
        'createMany',
        {
          data: [
            { email: 'a@test' },
            { email: 'b@test', tenantId: 'other' },
          ],
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

  it('adds the tenant filter to reads and does not mutate caller arguments', () => {
    const args = { where: { email: 'a@test' } };

    expect(scopeTenantQueryArgs('User', 'findMany', args, 'tenant-a')).toEqual({
      where: { email: 'a@test', tenantId: 'tenant-a' },
    });
    expect(args).toEqual({ where: { email: 'a@test' } });
  });
});
