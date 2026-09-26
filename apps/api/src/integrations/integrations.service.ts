import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { connect } from 'node:net';
import { PrismaService } from '../prisma/prisma.service';

const PROVIDERS = ['iiko', 'r_keeper', 'oplati', 'erip', 'bePaid', 'skno'] as const;
type Provider = (typeof PROVIDERS)[number];
type Settings = Record<string, unknown>;
type IntegrationSettings = Record<Provider, Settings>;

const EMPTY_SETTINGS = Object.fromEntries(PROVIDERS.map((key) => [key, {}])) as IntegrationSettings;
const SECRET_FIELDS = new Set(['apiKey', 'apiSecret', 'password', 'token', 'secret', 'secretKey']);
const REQUIRED_FIELDS: Record<Provider, string[]> = {
  iiko: ['apiUrl', 'apiKey'],
  r_keeper: ['apiUrl', 'apiKey'],
  oplati: ['merchantId', 'apiKey'],
  erip: ['serviceId'],
  bePaid: ['shopId', 'mode', 'secretKey'],
  skno: ['serialNumber', 'host', 'port'],
};

function isConfigured(provider: Provider, settings: Settings): boolean {
  return REQUIRED_FIELDS[provider].every((key) => {
    const value = settings[key];
    return (typeof value === 'string' && value.trim().length > 0) || typeof value === 'boolean';
  });
}

@Injectable()
export class IntegrationsService {
  constructor(private readonly prisma: PrismaService) {}

  isValidSettingsUpdate(
    body: unknown,
  ): body is { provider: Provider; settings: Settings } {
    if (!body || typeof body !== 'object') return false;
    const value = body as Record<string, unknown>;
    return (
      typeof value.provider === 'string' &&
      PROVIDERS.includes(value.provider as Provider) &&
      !!value.settings &&
      typeof value.settings === 'object' &&
      !Array.isArray(value.settings)
    );
  }

  async getStatus(tenantId: string) {
    const settings = await this.loadSettings(tenantId);
    const [iiko, rKeeper, skno] = await Promise.all([
      this.checkHttp(settings.iiko),
      this.checkHttp(settings.r_keeper),
      this.checkSkno(settings.skno),
    ]);
    return {
      integrations: Object.fromEntries(
        PROVIDERS.map((provider) => {
          const config = settings[provider];
          const configured = isConfigured(provider, config);
          const isSkno = provider === 'skno';
          const status = !configured
            ? 'NotConfigured'
            : isSkno
              ? skno.status
              : provider === 'iiko'
                ? iiko.status
                : provider === 'r_keeper'
                  ? rKeeper.status
              : 'Active';
          const publicSettings = Object.fromEntries(
            Object.entries(config).map(([key, value]) => [
              key,
              SECRET_FIELDS.has(key) && value ? '' : value,
            ]),
          );
          const pingMs = provider === 'iiko' ? iiko.pingMs : provider === 'r_keeper' ? rKeeper.pingMs : isSkno ? skno.pingMs : null;
          return [provider, { status, pingMs, settings: publicSettings }];
        }),
      ),
    };
  }

  async updateSettings(tenantId: string, provider: Provider, update: Settings) {
    const invalid = Object.entries(update).some(
      ([key, value]) =>
        !/^[a-zA-Z][a-zA-Z0-9]*$/.test(key) ||
        (value !== null && typeof value !== 'string' && typeof value !== 'boolean'),
    );
    if (invalid) {
      throw new ConflictException('Integration settings must contain text values');
    }

    const current = await this.loadSettings(tenantId);
    const nonEmptyUpdate = Object.fromEntries(
      Object.entries(update).filter(([, value]) => value !== ''),
    );
    current[provider] = { ...current[provider], ...nonEmptyUpdate };
    const tenant = await this.prisma.forTenant(tenantId).tenant.update({
      where: { id: tenantId },
      data: { integrationSettings: current as Prisma.InputJsonValue },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return { saved: true };
  }

  async syncMenu(tenantId: string, provider: 'iiko' | 'r_keeper') {
    const settings = await this.loadSettings(tenantId);
    const configured = isConfigured(provider, settings[provider]);
    if (!configured) throw new ConflictException('Integration is not configured');
    throw new ServiceUnavailableException(
      `Menu synchronization for ${provider} is not available until its import adapter is implemented`,
    );
  }

  private async loadSettings(tenantId: string): Promise<IntegrationSettings> {
    const tenant = await this.prisma.forTenant(tenantId).tenant.findUnique({
      where: { id: tenantId },
      select: { integrationSettings: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    const value = tenant.integrationSettings;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return structuredClone(EMPTY_SETTINGS);
    return Object.fromEntries(
      PROVIDERS.map((provider) => {
        const entry = (value as Record<string, unknown>)[provider];
        return [provider, entry && typeof entry === 'object' && !Array.isArray(entry) ? entry : {}];
      }),
    ) as IntegrationSettings;
  }

  private checkSkno(settings: Settings): Promise<{ status: string; pingMs: number | null }> {
    const host = settings['host'];
    const port = Number(settings['port']);
    if (typeof host !== 'string' || !host.trim() || !Number.isInteger(port) || port < 1 || port > 65535) {
      return Promise.resolve({ status: 'ConnectionFailed', pingMs: null });
    }
    const startedAt = Date.now();
    return new Promise((resolve) => {
      const socket = connect({ host, port });
      const finish = (status: string) => {
        const pingMs = status === 'Online' ? Date.now() - startedAt : null;
        socket.destroy();
        resolve({ status, pingMs });
      };
      socket.setTimeout(2000, () => finish('Offline'));
      socket.once('connect', () => finish('Online'));
      socket.once('error', () => finish('Offline'));
    });
  }

  private async checkHttp(settings: Settings): Promise<{ status: string; pingMs: number | null }> {
    const apiUrl = settings['apiUrl'];
    const apiKey = settings['apiKey'];
    if (typeof apiUrl !== 'string' || typeof apiKey !== 'string') {
      return { status: 'ConnectionFailed', pingMs: null };
    }
    let url: URL;
    try {
      url = new URL(apiUrl);
      if (url.protocol !== 'https:' || url.username || url.password) {
        return { status: 'ConnectionFailed', pingMs: null };
      }
    } catch {
      return { status: 'ConnectionFailed', pingMs: null };
    }

    const startedAt = Date.now();
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(4000),
        redirect: 'error',
      });
      return {
        status: response.ok ? 'Online' : 'ConnectionFailed',
        pingMs: response.ok ? Date.now() - startedAt : null,
      };
    } catch {
      return { status: 'Offline', pingMs: null };
    }
  }
}
