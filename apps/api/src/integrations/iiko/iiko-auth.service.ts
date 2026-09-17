import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IikoCryptoService } from './iiko-crypto.service';
import { IikoConfig, IikoTokenResponse } from './iiko.types';

interface TokenCacheEntry {
  token: string;
  expiresAt: number;
}

@Injectable()
export class IikoAuthService {
  private readonly tokenCache = new Map<string, TokenCacheEntry>();
  private readonly baseUrl: string;

  constructor(
    private readonly crypto: IikoCryptoService,
    config: ConfigService,
  ) {
    this.baseUrl = config.get<string>('IIKO_API_BASE_URL', 'https://api-ru.iiko.services');
  }

  async getToken(tenantId: string, iikoConfig: IikoConfig): Promise<string> {
    const cached = this.tokenCache.get(tenantId);
    const now = Date.now();

    if (cached && cached.expiresAt - now > 60_000) {
      return cached.token;
    }

    const password = this.crypto.decrypt(iikoConfig.password_encrypted);
    const token = await this.fetchToken(iikoConfig.login, password);

    this.tokenCache.set(tenantId, {
      token,
      expiresAt: now + 14 * 60 * 1000,
    });

    return token;
  }

  private async fetchToken(login: string, password: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/0/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, pass: password }),
    });

    if (!response.ok) {
      throw new Error(`iiko auth failed with status ${response.status}`);
    }

    const data = (await response.json()) as IikoTokenResponse;
    return data.token;
  }
}
