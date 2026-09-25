import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { TenantContextService } from '../tenant/tenant-context.service';

export const TENANT_SCOPED_MODELS = new Set([
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
]);

const RELATION_SCOPED_MODELS: Record<string, string> = {
  OrderItem: 'order',
  ModifierOption: 'group',
};

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
type ModelDelegate = Record<string, (args: QueryArgs) => Promise<unknown>>;

/**
 * Prisma's findUnique accepts only a WhereUniqueInput, which cannot express
 * the owning-record tenant predicate required for relation-scoped models. Use its
 * filter-capable equivalent after adding that predicate.
 */
export function scopedDelegateOperation(model: string, operation: string) {
  if (!RELATION_SCOPED_MODELS[model]) return operation;
  if (operation === 'findUnique') return 'findFirst';
  if (operation === 'findUniqueOrThrow') return 'findFirstOrThrow';
  return operation;
}

function asRecord(value: unknown): QueryArgs {
  return value !== null && typeof value === 'object' ? { ...value } : {};
}

/** Builds scoped arguments without mutating the arguments supplied by a caller. */
export function scopeTenantQueryArgs(
  model: string,
  operation: string,
  input: QueryArgs,
  tenantId: string,
): QueryArgs {
  if (!TENANT_SCOPED_MODELS.has(model)) return input;

  const args = { ...input };
  const owningRelation = RELATION_SCOPED_MODELS[model];
  if (owningRelation) {
    if (operation === 'upsert') {
      throw new Error(
        `${model} upsert is not supported because its unique lookup cannot be tenant-scoped`,
      );
    }

    if (TENANT_FILTERED_OPS.has(operation)) {
      args['where'] = {
        AND: [
          asRecord(args['where']),
          { [owningRelation]: { is: { tenantId } } },
        ],
      };
    }
    return args;
  }

  const tenantField = model === 'Tenant' ? 'id' : 'tenantId';

  if (TENANT_FILTERED_OPS.has(operation)) {
    const where = asRecord(args['where']);
    if (
      model === 'User' &&
      (operation === 'findUnique' || operation === 'findUniqueOrThrow') &&
      typeof where['email'] === 'string'
    ) {
      args['where'] = {
        tenantId_email: { tenantId, email: where['email'] },
      };
    } else {
      args['where'] = { ...where, [tenantField]: tenantId };
    }
  }

  if (!TENANT_WRITE_OPS.has(operation)) return args;

  if (operation === 'createMany') {
    const data = Array.isArray(args['data']) ? args['data'] : [args['data']];
    args['data'] = data.map((item) => ({
      ...asRecord(item),
      [tenantField]: tenantId,
    }));
    return args;
  }

  if (operation === 'upsert') {
    const where = asRecord(args['where']);
    if (model === 'User' && typeof where['email'] === 'string') {
      args['where'] = {
        tenantId_email: { tenantId, email: where['email'] },
      };
    } else {
      args['where'] = { ...where, [tenantField]: tenantId };
    }
    args['create'] = { ...asRecord(args['create']), [tenantField]: tenantId };
    args['update'] = { ...asRecord(args['update']), [tenantField]: tenantId };
    return args;
  }

  args['data'] = { ...asRecord(args['data']), [tenantField]: tenantId };
  return args;
}

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly client = new PrismaClient();

  constructor(private readonly tenantContextService: TenantContextService) {}

  async onModuleInit() {
    await this.client.$connect();
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }

  /**
   * Returns an extended Prisma client that automatically injects
   * WHERE tenantId = <tenantId> into all operations on tenant-scoped models.
   * The GUC and the query run inside one interactive transaction so RLS sees
   * the transaction-local value on the same database connection.
   *
   * Relation-scoped models are protected by their owning records' RLS policies;
   * their upserts are rejected because Prisma's unique lookup cannot include the
   * owner tenant predicate.
   */
  forTenant(tenantId: string) {
    return this.client.$extends({
      query: {
        $allModels: {
          $allOperations: (params: unknown): Promise<unknown> => {
            const { model, operation, args } = params as {
              model: string;
              operation: string;
              args: QueryArgs;
            };
            if (!TENANT_SCOPED_MODELS.has(model)) {
              throw new Error(`Unscoped model ${model} is not supported`);
            }

            const scopedArgs = scopeTenantQueryArgs(
              model,
              operation,
              args,
              tenantId,
            );
            return this.client.$transaction(async (tx) => {
              await tx.$executeRawUnsafe(
                "SELECT set_config('app.current_tenant_id', $1, true)",
                tenantId,
              );
              const delegate = tx[
                `${model.charAt(0).toLowerCase()}${model.slice(1)}` as keyof typeof tx
              ] as unknown as ModelDelegate;
              const delegateOperation = scopedDelegateOperation(
                model,
                operation,
              );
              const execute = delegate[delegateOperation];
              if (!execute) {
                throw new Error(
                  `Unsupported Prisma operation: ${delegateOperation}`,
                );
              }
              return execute.call(delegate, scopedArgs);
            });
          },
        },
      },
    });
  }

  async transactionForTenant<T>(
    tenantId: string,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.client.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config('app.current_tenant_id', ${tenantId}, true)
      `;
      return operation(tx);
    });
  }

  /**
   * Looks up a table by its globally-unique QR token without tenant scoping.
   * Used only for guest session initialization where the tenant must first be
   * resolved from the token before scoped queries can proceed.
   */
  findTableByQrToken(qrToken: string) {
    return this.client.table.findUnique({
      where: { qrToken },
      include: {
        area: { select: { name: true } },
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
            brandColor: true,
            currency: true,
          },
        },
      },
    });
  }

  /**
   * Raw Prisma client for cross-tenant queries that run before tenant context
   * is established (e.g. login). Use only where explicit tenant scoping is applied
   * in the query itself.
   */
  get unscopedClient(): PrismaClient {
    return this.client;
  }

  /**
   * Looks up a tenant by slug without tenant context (used by auth endpoints
   * that receive a tenant slug before a JWT is available).
   */
  findTenantBySlug(slug: string) {
    return this.client.tenant.findUnique({ where: { slug } });
  }

  findTenantById(id: string) {
    return this.client.tenant.findUnique({ where: { id } });
  }

  /**
   * Returns a tenant-scoped Prisma client based on the current
   * AsyncLocalStorage context set by TenantContextMiddleware.
   * Throws when no tenant context is active so request handlers cannot
   * accidentally read or write across tenants.
   *
   * This client supports only models in TENANT_SCOPED_MODELS. Relation-scoped
   * models are constrained through their tenant-scoped owner relation.
   */
  get db(): ReturnType<typeof this.forTenant> {
    const tenantId = this.tenantContextService.getTenantId();
    if (!tenantId) {
      throw new Error('PrismaService.db called outside tenant context');
    }
    return this.forTenant(tenantId);
  }
}
