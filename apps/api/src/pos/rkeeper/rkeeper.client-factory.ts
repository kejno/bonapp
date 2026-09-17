import { Injectable } from '@nestjs/common';
import { RKeeperClient, RKeeperConfig } from './rkeeper.client';

@Injectable()
export class RKeeperClientFactory {
  create(config: RKeeperConfig): RKeeperClient {
    return new RKeeperClient(config);
  }
}
