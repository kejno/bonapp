import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';

@Injectable()
export class OrdersEvents {
  readonly created = new EventEmitter();
}
