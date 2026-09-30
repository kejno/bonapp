import { PaymentsService } from './payments.service';

describe('BNP-534 repeated ERIP initiation', () => {
  it('returns the active E-POS request without creating another provider request', async () => {
    const db = {
      order: { findFirst: jest.fn().mockResolvedValue({ id: 'order-1', isPaid: false, totalAmountByn: 25, guestSessionId: null }) },
      payment: { findFirst: jest.fn().mockResolvedValue({ id: 'payment-1', provider: 'ERIP_EPOS', status: 'PENDING', providerTransactionId: 'uid-1', eripOrderNumber: '000000000042', payload: { serviceNo: 12345678, qrCode: 'encoded-qr' } }), create: jest.fn(), update: jest.fn() },
    };
    const gateway = { create: jest.fn() };
    const service = new PaymentsService({ forTenant: () => db } as never, gateway as never, { registerHandler: jest.fn() } as never, {} as never);

    const first = await service.initiate('order-1', 'tenant-1', 'table-1', 'ERIP');
    const second = await service.initiate('order-1', 'tenant-1', 'table-1', 'ERIP');

    expect(first).toEqual(second);
    expect(db.payment.create).not.toHaveBeenCalled();
    expect(gateway.create).not.toHaveBeenCalled();
  });
});
