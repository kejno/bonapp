import type {
  RKeeperCategory,
  RKeeperCreateOrderPayload,
  RKeeperOrderResponse,
  RKeeperProduct,
} from './rkeeper.types';

export interface RKeeperConfig {
  baseUrl: string;
  username: string;
  password: string;
}

export class RKeeperClient {
  private readonly authHeader: string;

  constructor(private readonly config: RKeeperConfig) {
    const token = Buffer.from(`${config.username}:${config.password}`).toString('base64');
    this.authHeader = `Basic ${token}`;
  }

  async getCategories(): Promise<RKeeperCategory[]> {
    const res = await fetch(
      `${this.config.baseUrl}/api/v1/entities/productCategories`,
      { headers: { Authorization: this.authHeader } },
    );
    if (!res.ok) throw new Error(`r_keeper API error: ${res.status}`);
    const data = (await res.json()) as { items: RKeeperCategory[] };
    return data.items;
  }

  async getProducts(): Promise<RKeeperProduct[]> {
    const res = await fetch(
      `${this.config.baseUrl}/api/v1/entities/products`,
      { headers: { Authorization: this.authHeader } },
    );
    if (!res.ok) throw new Error(`r_keeper API error: ${res.status}`);
    const data = (await res.json()) as { items: RKeeperProduct[] };
    return data.items;
  }

  async createOrder(payload: RKeeperCreateOrderPayload): Promise<RKeeperOrderResponse> {
    const res = await fetch(`${this.config.baseUrl}/api/v1/orders`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`r_keeper API error: ${res.status}`);
    return res.json() as Promise<RKeeperOrderResponse>;
  }

  async ping(): Promise<number> {
    const start = Date.now();
    const res = await fetch(`${this.config.baseUrl}/api/v1/status`, {
      headers: { Authorization: this.authHeader },
    });
    const latencyMs = Date.now() - start;
    if (!res.ok) throw new Error(`r_keeper ping failed: ${res.status}`);
    return latencyMs;
  }
}
