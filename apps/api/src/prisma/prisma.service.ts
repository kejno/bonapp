import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TenantContextService } from '../tenant/tenant-context.service';

export const TENANT_SCOPED_MODELS = new Set(['User', 'Tenant']);

// Operations that accept a WHERE clause and must be filtered by tenantId.
const TENANT_FILTERED_OPS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'delete',
  'deleteMany',
]);

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(private readonly tenantContextService: TenantContextService) {
    super();
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Returns an extended Prisma client that automatically injects
   * WHERE tenantId = <tenantId> into all read/update/delete operations
   * on tenant-scoped models.
   */
  forTenant(tenantId: string) {
    return this.$extends({
      query: {
        $allModels: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          async $allOperations(params: any): Promise<any> {
            const { model, operation, args, query } = params as {
              model: string;
              operation: string;
              args: { where?: Record<string, unknown> };
              query: (a: unknown) => Promise<unknown>;
            };
            if (TENANT_SCOPED_MODELS.has(model) && TENANT_FILTERED_OPS.has(operation)) {
              args.where = { ...args.where, tenantId };
            }
            return query(args);
          },
        },
      },
    });
  }

  /**
   * Returns a tenant-scoped Prisma client based on the current
   * AsyncLocalStorage context set by TenantContextMiddleware.
   * Falls back to the base client when no tenant context is active
   * (e.g., seed scripts, admin operations).
   */
  get db(): this | ReturnType<typeof this.forTenant> {
    const tenantId = this.tenantContextService.getTenantId();
    if (!tenantId) return this;
    return this.forTenant(tenantId);
  }
}
