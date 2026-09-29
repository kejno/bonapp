import { buildRKeeperOrderPayload } from './pos-order';

describe('BNP-519: submit a guest order to r_keeper', () => {
  it('maps order identity, totals, and POS item identifiers into the request payload', () => {
    expect(buildRKeeperOrderPayload({
      id: 'order-519',
      dailyOrderNumber: 19,
      comment: 'Без лука',
      totalAmountByn: 12.5,
      items: [{ posItemId: 'rk-item-1', quantity: 2, unitPriceByn: 6.25 }],
    })).toEqual({
      externalId: 'order-519',
      number: 19,
      comment: 'Без лука',
      totalAmount: 12.5,
      items: [{ productId: 'rk-item-1', quantity: 2, price: 6.25 }],
    });
  });
});
