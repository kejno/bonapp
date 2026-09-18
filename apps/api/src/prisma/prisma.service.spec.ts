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
    it('does not call forTenant when no tenant context is set', () => {
      const spy = jest.spyOn(prismaService, 'forTenant');
      void prismaService.db;
      expect(spy).not.toHaveBeenCalled();
    });

    it('calls forTenant with the current tenantId when context is active', () => {
      const spy = jest.spyOn(prismaService, 'forTenant').mockReturnValue({} as any);
      tenantContextService.run('tenant-a', () => {
        void prismaService.db;
      });
      expect(spy).toHaveBeenCalledWith('tenant-a');
    });

    it('passes the correct tenantId for each distinct context', () => {
      const calls: string[] = [];
      jest.spyOn(prismaService, 'forTenant').mockImplementation((id: string) => {
        calls.push(id);
        return {} as any;
      });

      tenantContextService.run('tenant-a', () => void prismaService.db);
      tenantContextService.run('tenant-b', () => void prismaService.db);

      expect(calls).toEqual(['tenant-a', 'tenant-b']);
    });
  });
});
