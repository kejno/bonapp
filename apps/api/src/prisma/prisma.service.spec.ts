import { TenantContextService } from '../tenant/tenant-context.service';
import { TENANT_SCOPED_MODELS, PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let tenantContextService: TenantContextService;
  let prismaService: PrismaService;

  beforeEach(() => {
    tenantContextService = new TenantContextService();
    prismaService = new PrismaService(tenantContextService);
  });

  describe('TENANT_SCOPED_MODELS', () => {
    it('includes User', () => {
      expect(TENANT_SCOPED_MODELS.has('User')).toBe(true);
    });

    it('includes Tenant', () => {
      expect(TENANT_SCOPED_MODELS.has('Tenant')).toBe(true);
    });

    it('does not include arbitrary model names', () => {
      expect(TENANT_SCOPED_MODELS.has('SomeGlobalTable')).toBe(false);
    });
  });

  describe('db getter', () => {
    it('throws when no tenant context is set', () => {
      expect(() => prismaService.db).toThrow('outside tenant context');
    });

    it('calls forTenant with the current tenantId when context is active', () => {
      const spy = jest
        .spyOn(prismaService, 'forTenant')
        .mockReturnValue({} as any);
      tenantContextService.run('tenant-a', () => {
        void prismaService.db;
      });
      expect(spy).toHaveBeenCalledWith('tenant-a');
    });

    it('passes the correct tenantId for each distinct context', () => {
      const calls: string[] = [];
      jest
        .spyOn(prismaService, 'forTenant')
        .mockImplementation((id: string) => {
          calls.push(id);
          return {} as any;
        });

      tenantContextService.run('tenant-a', () => void prismaService.db);
      tenantContextService.run('tenant-b', () => void prismaService.db);

      expect(calls).toEqual(['tenant-a', 'tenant-b']);
    });
  });

  describe('tenant write operations', () => {
    it('adds the current tenant to create, createMany and upsert payloads', async () => {
      let extension: any;
      jest.spyOn(prismaService, '$executeRawUnsafe').mockResolvedValue(1);
      jest.spyOn(prismaService, '$extends').mockImplementation((value: any) => {
        extension = value;
        return {} as any;
      });

      prismaService.forTenant('tenant-a');
      const operation = extension.query.$allModels.$allOperations;

      const createQuery = jest.fn();
      await operation({
        model: 'User',
        operation: 'create',
        args: { data: { email: 'a@test' } },
        query: createQuery,
      });
      expect(prismaService.$executeRawUnsafe).toHaveBeenCalledWith(
        "SELECT set_config('app.current_tenant_id', $1, true)",
        'tenant-a',
      );
      expect(createQuery).toHaveBeenCalledWith({
        data: { email: 'a@test', tenantId: 'tenant-a' },
      });

      const manyQuery = jest.fn();
      await operation({
        model: 'User',
        operation: 'createMany',
        args: {
          data: [{ email: 'a@test' }, { email: 'b@test', tenantId: 'other' }],
        },
        query: manyQuery,
      });
      expect(manyQuery).toHaveBeenCalledWith({
        data: [
          { email: 'a@test', tenantId: 'tenant-a' },
          { email: 'b@test', tenantId: 'tenant-a' },
        ],
      });

      const upsertQuery = jest.fn();
      await operation({
        model: 'User',
        operation: 'upsert',
        args: {
          where: { email: 'a@test' },
          create: { email: 'a@test' },
          update: { role: 'STAFF' },
        },
        query: upsertQuery,
      });
      expect(upsertQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          create: { email: 'a@test', tenantId: 'tenant-a' },
          update: { role: 'STAFF', tenantId: 'tenant-a' },
        }),
      );
    });
  });
});
