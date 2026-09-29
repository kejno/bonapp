import { buildRKeeperOrderPayload } from './pos-order';

describe('buildRKeeperOrderPayload', () => {
  it('preserves the Bonapp order identity and maps every item to its POS product id', () => {
    expect(buildRKeeperOrderPayload({
      id: 'order-42',
      dailyOrderNumber: 17,
      comment: 'Без перца',
      totalAmountByn: 15.5,
      items: [
        { posItemId: 'rk-soup', quantity: 2, unitPriceByn: 6.25 },
        { posItemId: 'rk-tea', quantity: 1, unitPriceByn: 3 },
      ],
    })).toEqual({
      externalId: 'order-42',
      number: 17,
      comment: 'Без перца',
      totalAmount: 15.5,
      items: [
        { productId: 'rk-soup', quantity: 2, price: 6.25 },
        { productId: 'rk-tea', quantity: 1, price: 3 },
      ],
    });
  });
});
