import { Injectable } from '@nestjs/common';
import type { ReadinessStatus } from '@bonapp/shared-types';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  getReadiness(): ReadinessStatus {
    // Menu, table and payment modules are not available yet, so none can be ready.
    return { menuReady: false, tablesReady: false, paymentsReady: false };
  }
}
