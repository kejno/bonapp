import { IntegrationsService } from './integrations.service';
import { PrismaService } from '../prisma/prisma.service';
import { decryptCredentials, isEncryptedCredentials } from '../tenant/payment-credentials';

describe('BNP-456: payment gateway settings', () => {
  it('stores a secret encrypted and returns status without exposing it', async () => {
    const previousSecret = process.env.PAYMENT_CREDENTIALS_SECRET;
    process.env.PAYMENT_CREDENTIALS_SECRET = 'bnp-456-secret';
    let persistedSettings: unknown;
    const update = jest.fn((args: { data: { integrationSettings: unknown } }) => { persistedSettings = args.data.integrationSettings; return Promise.resolve({ id: 'tenant-1' }); });
    const findUnique = jest.fn().mockResolvedValueOnce({ integrationSettings: null }).mockImplementation(() => Promise.resolve({ integrationSettings: persistedSettings }));
    const prisma = { forTenant: () => ({ tenant: { findUnique, update } }) } as unknown as PrismaService;
    const service = new IntegrationsService(prisma, { startImport: jest.fn() } as never);
    try {
      await service.updateSettings('tenant-1', 'iiko', { apiUrl: 'https://iiko.test', apiKey: 'api-key', appId: 'app-1', clientSecret: 'private-secret-456', organizationId: 'org-1', terminalGroupId: 'terminal-1' });
      const storedSettings = persistedSettings as { iiko: { clientSecret: unknown } };
      expect(isEncryptedCredentials(storedSettings.iiko.clientSecret)).toBe(true);
      if (!isEncryptedCredentials(storedSettings.iiko.clientSecret)) throw new Error('Ожидалось шифрование секрета');
      expect(decryptCredentials<{ value: string }>(storedSettings.iiko.clientSecret, process.env.PAYMENT_CREDENTIALS_SECRET).value).toBe('private-secret-456');
      const response = await service.getStatus('tenant-1');
      expect(response.integrations.iiko.settings).toMatchObject({ apiUrl: 'https://iiko.test', appId: 'app-1', apiKey: '', clientSecret: '' });
      expect(JSON.stringify(response)).not.toContain('private-secret-456');
      expect(JSON.stringify(response)).not.toContain('api-key');
    } finally {
      if (previousSecret === undefined) delete process.env.PAYMENT_CREDENTIALS_SECRET;
      else process.env.PAYMENT_CREDENTIALS_SECRET = previousSecret;
    }
  });
});
