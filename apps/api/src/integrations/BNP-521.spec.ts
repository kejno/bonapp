import { EventEmitter } from 'node:events';
import * as dns from 'node:dns/promises';
import * as https from 'node:https';
import { IntegrationsService } from './integrations.service';

jest.mock('node:dns/promises', () => ({ lookup: jest.fn() }));
jest.mock('node:https', () => {
  const actual = jest.requireActual<typeof import('node:https')>('node:https');
  return { ...actual, request: jest.fn() };
});

describe('BNP-521: health-check r_keeper', () => {
  const findUnique = jest.fn();
  const request = https.request as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.INTEGRATION_HEALTHCHECK_HOSTS = 'keeper.example';
    (dns.lookup as jest.Mock).mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
  });

  afterEach(() => {
    delete process.env.INTEGRATION_HEALTHCHECK_HOSTS;
  });

  it('pings the configured API and reports its measured response time', async () => {
    let requestOptions: https.RequestOptions | undefined;
    request.mockImplementation((options: https.RequestOptions, callback: unknown) => {
      requestOptions = options;
      const outgoing = new EventEmitter() as EventEmitter & { end: () => void; destroy: jest.Mock };
      outgoing.destroy = jest.fn();
      outgoing.end = () => setTimeout(() => {
        const response = new EventEmitter() as EventEmitter & { statusCode: number; resume: jest.Mock };
        response.statusCode = 204;
        response.resume = jest.fn();
        (callback as (res: EventEmitter & { statusCode: number; resume: jest.Mock }) => void)(response);
      }, 30);
      return outgoing;
    });
    findUnique.mockResolvedValue({ integrationSettings: {
      r_keeper: { apiUrl: 'https://keeper.example/health', apiKey: 'test-key' },
    } });
    const prisma = { forTenant: () => ({ tenant: { findUnique } }) } as never;
    const service = new IntegrationsService(prisma, { startImport: jest.fn() } as never);

    const result = await service.getStatus('tenant-521');

    expect(dns.lookup).toHaveBeenCalledWith('keeper.example', { all: true, verbatim: true });
    expect(request).toHaveBeenCalledTimes(1);
    expect(requestOptions).toMatchObject({ hostname: '8.8.8.8', path: '/health', method: 'GET' });
    expect(requestOptions?.headers).toMatchObject({ Host: 'keeper.example', Authorization: 'Bearer test-key' });
    expect(result.integrations.r_keeper.status).toBe('Online');
    expect(result.integrations.r_keeper.pingMs).toBeGreaterThanOrEqual(20);
  });
});
