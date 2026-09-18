import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<string>();

  run<T>(tenantId: string, fn: () => T): T {
    return this.storage.run(tenantId, fn);
  }

  getTenantId(): string | undefined {
    return this.storage.getStore();
  }
}
