import { Test } from '@nestjs/testing';
import { IntegrationStatus } from '@bonapp/shared-types';
import { PrismaService } from '../../prisma/prisma.service';
import { IntegrationsService } from './integrations.service';

const makePrisma = (settings: Record<string, unknown> | null) => ({
  tenantSettings: {
    findUnique: jest.fn().mockResolvedValue(settings),
  },
});

describe('IntegrationsService', () => {
  let service: IntegrationsService;

  async function build(settings: Record<string, unknown> | null) {
    const prisma = makePrisma(settings);
    const module = await Test.createTestingModule({
      providers: [
        IntegrationsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(IntegrationsService);
    return service;
  }

  describe('getStatus — no settings', () => {
    beforeEach(() => build(null));

    it('returns NotConfigured for all integrations', async () => {
      jest.spyOn(service as any, 'pingHttp').mockResolvedValue(null);
      jest.spyOn(service as any, 'pingTcp').mockResolvedValue(null);

      const result = await service.getStatus('t1');

      expect(result.iiko.status).toBe(IntegrationStatus.NotConfigured);
      expect(result.rKeeper.status).toBe(IntegrationStatus.NotConfigured);
      expect(result.oplaty.status).toBe(IntegrationStatus.NotConfigured);
      expect(result.erip.status).toBe(IntegrationStatus.NotConfigured);
      expect(result.bePaid.status).toBe(IntegrationStatus.NotConfigured);
      expect(result.skno.status).toBe(IntegrationStatus.NotConfigured);
    });

    it('returns null pingMs for all integrations', async () => {
      jest.spyOn(service as any, 'pingHttp').mockResolvedValue(null);
      jest.spyOn(service as any, 'pingTcp').mockResolvedValue(null);

      const result = await service.getStatus('t1');

      expect(result.iiko.pingMs).toBeNull();
      expect(result.rKeeper.pingMs).toBeNull();
      expect(result.skno.pingMs).toBeNull();
    });
  });

  describe('getStatus — iiko configured', () => {
    const iikoSettings = { iikoApiUrl: 'http://iiko.local', iikoLogin: 'admin', iikoPassword: 'pass' };

    it('returns Online and pingMs when ping succeeds', async () => {
      await build(iikoSettings);
      jest.spyOn(service as any, 'pingHttp').mockResolvedValue(42);
      jest.spyOn(service as any, 'pingTcp').mockResolvedValue(null);

      const result = await service.getStatus('t1');

      expect(result.iiko.status).toBe(IntegrationStatus.Online);
      expect(result.iiko.pingMs).toBe(42);
    });

    it('returns ConnectionFailed when ping fails', async () => {
      await build(iikoSettings);
      jest.spyOn(service as any, 'pingHttp').mockResolvedValue(null);
      jest.spyOn(service as any, 'pingTcp').mockResolvedValue(null);

      const result = await service.getStatus('t1');

      expect(result.iiko.status).toBe(IntegrationStatus.ConnectionFailed);
      expect(result.iiko.pingMs).toBeNull();
    });
  });

  describe('getStatus — r_keeper configured', () => {
    const rkSettings = { rKeeperApiUrl: 'http://rk.local', rKeeperLogin: 'user', rKeeperPassword: 'pw' };

    it('returns Online when ping succeeds', async () => {
      await build(rkSettings);
      jest.spyOn(service as any, 'pingHttp').mockResolvedValue(15);
      jest.spyOn(service as any, 'pingTcp').mockResolvedValue(null);

      const result = await service.getStatus('t1');

      expect(result.rKeeper.status).toBe(IntegrationStatus.Online);
      expect(result.rKeeper.pingMs).toBe(15);
    });
  });

  describe('getStatus — oplaty / erip / bePaid (credential-only check)', () => {
    it('returns Active for oplaty when merchantId exists', async () => {
      await build({ oplatyMerchantId: 'M-123', oplatyApiKey: 'key' });
      jest.spyOn(service as any, 'pingHttp').mockResolvedValue(null);
      jest.spyOn(service as any, 'pingTcp').mockResolvedValue(null);

      const result = await service.getStatus('t1');

      expect(result.oplaty.status).toBe(IntegrationStatus.Active);
      expect(result.oplaty.merchantId).toBe('M-123');
    });

    it('returns Active for erip when serviceId exists', async () => {
      await build({ eripServiceId: 'SVC-001' });
      jest.spyOn(service as any, 'pingHttp').mockResolvedValue(null);
      jest.spyOn(service as any, 'pingTcp').mockResolvedValue(null);

      const result = await service.getStatus('t1');

      expect(result.erip.status).toBe(IntegrationStatus.Active);
      expect(result.erip.serviceId).toBe('SVC-001');
    });

    it('returns Active for bePaid with shopId and mode', async () => {
      await build({ bePaidShopId: 'S-999', bePaidSecretKey: 'sk', bePaidMode: 'test' });
      jest.spyOn(service as any, 'pingHttp').mockResolvedValue(null);
      jest.spyOn(service as any, 'pingTcp').mockResolvedValue(null);

      const result = await service.getStatus('t1');

      expect(result.bePaid.status).toBe(IntegrationStatus.Active);
      expect(result.bePaid.shopId).toBe('S-999');
      expect(result.bePaid.mode).toBe('test');
    });
  });

  describe('getStatus — СКНО live check', () => {
    const sknoSettings = { sknoHost: '192.168.1.10', sknoPort: 8080, sknoSerialNumber: 'SN-001' };

    it('returns Online and pingMs when TCP succeeds', async () => {
      await build(sknoSettings);
      jest.spyOn(service as any, 'pingHttp').mockResolvedValue(null);
      jest.spyOn(service as any, 'pingTcp').mockResolvedValue(12);

      const result = await service.getStatus('t1');

      expect(result.skno.status).toBe(IntegrationStatus.Online);
      expect(result.skno.pingMs).toBe(12);
      expect(result.skno.serialNumber).toBe('SN-001');
    });

    it('returns Offline when TCP fails', async () => {
      await build(sknoSettings);
      jest.spyOn(service as any, 'pingHttp').mockResolvedValue(null);
      jest.spyOn(service as any, 'pingTcp').mockResolvedValue(null);

      const result = await service.getStatus('t1');

      expect(result.skno.status).toBe(IntegrationStatus.Offline);
      expect(result.skno.pingMs).toBeNull();
    });
  });

  describe('syncMenu', () => {
    it('resolves for iiko when configured and Online', async () => {
      await build({ iikoApiUrl: 'http://iiko.local', iikoLogin: 'admin', iikoPassword: 'pass' });
      jest.spyOn(service as any, 'pingHttp').mockResolvedValue(50);

      await expect(service.syncMenu('t1', 'iiko')).resolves.toBeUndefined();
    });

    it('throws NotConfigured for iiko when no credentials', async () => {
      await build(null);
      await expect(service.syncMenu('t1', 'iiko')).rejects.toThrow('NotConfigured');
    });

    it('throws ConnectionFailed for iiko when ping fails', async () => {
      await build({ iikoApiUrl: 'http://iiko.local', iikoLogin: 'admin', iikoPassword: 'bad' });
      jest.spyOn(service as any, 'pingHttp').mockResolvedValue(null);

      await expect(service.syncMenu('t1', 'iiko')).rejects.toThrow('ConnectionFailed');
    });

    it('resolves for r_keeper when configured and Online', async () => {
      await build({ rKeeperApiUrl: 'http://rk.local', rKeeperLogin: 'u', rKeeperPassword: 'p' });
      jest.spyOn(service as any, 'pingHttp').mockResolvedValue(30);

      await expect(service.syncMenu('t1', 'r_keeper')).resolves.toBeUndefined();
    });

    it('throws NotConfigured for r_keeper when no credentials', async () => {
      await build(null);
      await expect(service.syncMenu('t1', 'r_keeper')).rejects.toThrow('NotConfigured');
    });
  });
});
