import { HttpAdapterHost } from '@nestjs/core';
import { EventsGateway } from './events.gateway';

describe('EventsGateway', () => {
  let gateway: EventsGateway;
  let mockIo: { to: jest.Mock; emit: jest.Mock };
  let mockEmitChain: { emit: jest.Mock };

  beforeEach(() => {
    mockEmitChain = { emit: jest.fn() };
    mockIo = { to: jest.fn().mockReturnValue(mockEmitChain), emit: jest.fn() };

    const mockHttpAdapterHost = {
      httpAdapter: { getHttpServer: jest.fn().mockReturnValue({}) },
    } as unknown as HttpAdapterHost;

    gateway = new EventsGateway(mockHttpAdapterHost);
    (gateway as any).io = mockIo;
  });

  it('emitPaymentUpdate sends event to the correct order room', () => {
    gateway.emitPaymentUpdate('order-abc', 'payment-xyz');

    expect(mockIo.to).toHaveBeenCalledWith('order:order-abc');
    expect(mockEmitChain.emit).toHaveBeenCalledWith('order.payment.updated.v1', {
      version: 1,
      orderId: 'order-abc',
      paymentId: 'payment-xyz',
      status: 'COMPLETED',
    });
  });

  it('emitPaymentUpdate uses correct room format for multiple orders', () => {
    gateway.emitPaymentUpdate('order-1', 'pay-1');
    gateway.emitPaymentUpdate('order-2', 'pay-2');

    expect(mockIo.to).toHaveBeenNthCalledWith(1, 'order:order-1');
    expect(mockIo.to).toHaveBeenNthCalledWith(2, 'order:order-2');
  });
});
