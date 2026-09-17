import { Injectable } from '@nestjs/common';
import * as net from 'net';
import {
  IntegrationStatus,
  IntegrationsStatusResponseDto,
} from '@bonapp/shared-types';
import { PrismaService } from '../../prisma/prisma.service';

type Settings = {
  iikoApiUrl?: string | null;
  iikoLogin?: string | null;
  iikoPassword?: string | null;
  rKeeperApiUrl?: string | null;
  rKeeperLogin?: string | null;
  rKeeperPassword?: string | null;
  oplatyMerchantId?: string | null;
  eripServiceId?: string | null;
  bePaidShopId?: string | null;
  bePaidSecretKey?: string | null;
  bePaidMode?: string | null;
  sknoSerialNumber?: string | null;
  sknoHost?: string | null;
  sknoPort?: number | null;
} | null;

@Injectable()
export class IntegrationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(tenantId: string): Promise<IntegrationsStatusResponseDto> {
    const settings: Settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
    });

    const [iiko, rKeeper, skno] = await Promise.all([
      this.resolveIiko(settings),
      this.resolveRKeeper(settings),
      this.resolveSkno(settings),
    ]);

    return {
      iiko,
      rKeeper,
      oplaty: this.resolveOplaty(settings),
      erip: this.resolveErip(settings),
      bePaid: this.resolveBePaid(settings),
      skno,
    };
  }

  async syncMenu(tenantId: string, provider: 'iiko' | 'r_keeper'): Promise<void> {
    const settings: Settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
    });

    if (provider === 'iiko') {
      if (!settings?.iikoApiUrl || !settings?.iikoLogin) {
        throw new Error('NotConfigured');
      }
      const pingMs = await this.pingHttp(settings.iikoApiUrl);
      if (pingMs === null) throw new Error('ConnectionFailed');
    } else {
      if (!settings?.rKeeperApiUrl || !settings?.rKeeperLogin) {
        throw new Error('NotConfigured');
      }
      const pingMs = await this.pingHttp(settings.rKeeperApiUrl);
      if (pingMs === null) throw new Error('ConnectionFailed');
    }
    // BullMQ job would be enqueued here for actual menu import
  }

  private async resolveIiko(s: Settings) {
    if (!s?.iikoApiUrl || !s?.iikoLogin) {
      return { status: IntegrationStatus.NotConfigured, pingMs: null };
    }
    const pingMs = await this.pingHttp(s.iikoApiUrl);
    return {
      status: pingMs !== null ? IntegrationStatus.Online : IntegrationStatus.ConnectionFailed,
      pingMs,
    };
  }

  private async resolveRKeeper(s: Settings) {
    if (!s?.rKeeperApiUrl || !s?.rKeeperLogin) {
      return { status: IntegrationStatus.NotConfigured, pingMs: null };
    }
    const pingMs = await this.pingHttp(s.rKeeperApiUrl);
    return {
      status: pingMs !== null ? IntegrationStatus.Online : IntegrationStatus.ConnectionFailed,
      pingMs,
    };
  }

  private resolveOplaty(s: Settings) {
    return {
      status: s?.oplatyMerchantId ? IntegrationStatus.Active : IntegrationStatus.NotConfigured,
      merchantId: s?.oplatyMerchantId ?? null,
    };
  }

  private resolveErip(s: Settings) {
    return {
      status: s?.eripServiceId ? IntegrationStatus.Active : IntegrationStatus.NotConfigured,
      serviceId: s?.eripServiceId ?? null,
    };
  }

  private resolveBePaid(s: Settings) {
    return {
      status: s?.bePaidShopId ? IntegrationStatus.Active : IntegrationStatus.NotConfigured,
      shopId: s?.bePaidShopId ?? null,
      mode: (s?.bePaidMode as 'test' | 'prod') ?? null,
    };
  }

  private async resolveSkno(s: Settings) {
    if (!s?.sknoHost || !s?.sknoPort) {
      return {
        status: IntegrationStatus.NotConfigured,
        serialNumber: s?.sknoSerialNumber ?? null,
        pingMs: null,
      };
    }
    const pingMs = await this.pingTcp(s.sknoHost, s.sknoPort);
    return {
      status: pingMs !== null ? IntegrationStatus.Online : IntegrationStatus.Offline,
      serialNumber: s.sknoSerialNumber ?? null,
      pingMs,
    };
  }

  protected async pingHttp(url: string): Promise<number | null> {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
      clearTimeout(timer);
      return res.status < 500 ? Date.now() - start : null;
    } catch {
      return null;
    }
  }

  protected pingTcp(host: string, port: number): Promise<number | null> {
    return new Promise((resolve) => {
      const start = Date.now();
      const socket = net.createConnection({ host, port });
      socket.setTimeout(5000);
      socket.on('connect', () => {
        socket.destroy();
        resolve(Date.now() - start);
      });
      socket.on('error', () => resolve(null));
      socket.on('timeout', () => {
        socket.destroy();
        resolve(null);
      });
    });
  }
}
