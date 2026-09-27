import { TenantService } from './tenant.service';
import { encryptCredentials, decryptCredentials } from './payment-credentials';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { TenantContextService } from './tenant-context.service';

describe('BNP-456: payment gateway credentials', () => {
  const secret = 'bnp-456-test-encryption-key';
  const tenantId = 'tenant-bnp-456';
  let service: TenantService;
  let storedCredentials: Record<string, unknown>;
  let executeRaw: jest.Mock;
  let transactionForTenant: jest.Mock;
  let findUnique: jest.Mock;

  beforeEach(() => {
    storedCredentials = {};
    process.env.PAYMENT_CREDENTIALS_SECRET = secret;
    executeRaw = jest.fn((_parts: TemplateStringsArray, ...values: unknown[]) => {
      storedCredentials[String(values[0])] = JSON.parse(String(values[1]));
      return Promise.resolve(1);
    });
    transactionForTenant = jest.fn(
      (_id: string, operation: (tx: { $executeRaw: jest.Mock }) => unknown) =>
        operation({ $executeRaw: executeRaw }),
    );
    findUnique = jest.fn().mockImplementation(() =>
      Promise.resolve({ paymentCredentials: storedCredentials }),
    );
    service = new TenantService(
      {} as StorageService,
      {
        transactionForTenant,
        db: { tenant: { findUnique } },
      } as unknown as PrismaService,
      { getTenantId: () => tenantId } as TenantContextService,
    );
  });

  afterEach(() => {
    delete process.env.PAYMENT_CREDENTIALS_SECRET;
    jest.restoreAllMocks();
  });

  it('stores gateway credentials encrypted, reports connected status, and never logs secrets', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const credentials = { gateway: 'erip', serviceId: 'service-456', secret: 'private-secret-456' };

    const statuses = await service.savePaymentCredentials(credentials);

    expect(statuses).toEqual({ oplati: false, erip: true, bepaid: false, skno: false });
    expect(transactionForTenant).toHaveBeenCalledWith(tenantId, expect.any(Function));
    expect(executeRaw).toHaveBeenCalled();
    const encrypted = storedCredentials.erip as ReturnType<typeof encryptCredentials>;
    expect(encrypted).toMatchObject({ version: 1 });
    expect(JSON.stringify(encrypted)).not.toContain(credentials.secret);
    expect(decryptCredentials(encrypted, secret)).toEqual(credentials);
    expect(await service.getPaymentGatewayStatuses()).toEqual(statuses);
    expect(consoleSpy).not.toHaveBeenCalled();
  });
});
