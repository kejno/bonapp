import { Injectable } from '@nestjs/common';
import { StopListChangedEvent } from './menu.types';

@Injectable()
export class MenuNotifierService {
  notifyStopListChanged(_tenantId: string, _event: StopListChangedEvent): void {
    void _tenantId;
    void _event;
  }
}
