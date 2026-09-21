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

const TENANT_WRITE_OPS = new Set(['create', 'createMany', 'upsert']);
type QueryArgs = Record<string, unknown>;

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
   * WHERE tenantId = <tenantId> into all operations on tenant-scoped models.
   */
  forTenant(tenantId: string) {
    return this.$extends({
      query: {
        $allModels: {
          $allOperations: async (params: unknown): Promise<unknown> => {
            const { model, operation, args, query } = params as {
              model: string;
              operation: string;
              args: QueryArgs;
              query: (a: unknown) => Promise<unknown>;
            };
            if (!TENANT_SCOPED_MODELS.has(model)) return query(args);

            // RLS policies read this transaction-local value before every scoped query.
            await this.$executeRawUnsafe(
              "SELECT set_config('app.current_tenant_id', $1, true)",
              tenantId,
            );

            const tenantField = model === 'Tenant' ? 'id' : 'tenantId';
            if (TENANT_FILTERED_OPS.has(operation)) {
              args['where'] = {
                ...(args['where'] as Record<string, unknown>),
                [tenantField]: tenantId,
              };
            }
            if (TENANT_WRITE_OPS.has(operation)) {
              if (operation === 'createMany') {
                const data = Array.isArray(args['data'])
                  ? args['data']
                  : [args['data']];
                args['data'] = data.map((item) => ({
                  ...(item as Record<string, unknown>),
                  [tenantField]: tenantId,
                }));
              } else if (operation === 'upsert') {
                args['create'] = {
                  ...(args['create'] as Record<string, unknown>),
                  [tenantField]: tenantId,
                };
                args['update'] = {
                  ...(args['update'] as Record<string, unknown>),
                  [tenantField]: tenantId,
                };
              } else {
                args['data'] = {
                  ...(args['data'] as Record<string, unknown>),
                  [tenantField]: tenantId,
                };
              }
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
   * Throws when no tenant context is active so request handlers cannot
   * accidentally read or write across tenants.
   */
  get db(): ReturnType<typeof this.forTenant> {
    const tenantId = this.tenantContextService.getTenantId();
    if (!tenantId) {
      throw new Error('PrismaService.db called outside tenant context');
    }
    return this.forTenant(tenantId);
  }

  /** Unscoped client for explicitly privileged setup and administration work. */
  get adminDb(): this {
    return this;
  }
}
