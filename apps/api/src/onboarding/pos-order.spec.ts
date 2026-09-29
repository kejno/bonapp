import { buildIikoOrderPayload, buildRKeeperOrderPayload } from './pos-order';

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

describe('buildIikoOrderPayload', () => {
  it('maps every Bonapp order line and tenant routing identifiers to the iiko Cloud contract', () => {
    expect(buildIikoOrderPayload({
      id: 'order-42', dailyOrderNumber: 17, comment: 'Без перца', totalAmountByn: 15.5,
      items: [
        { posItemId: 'iiko-soup', quantity: 2, unitPriceByn: 6.25 },
        { posItemId: 'iiko-tea', quantity: 1, unitPriceByn: 3 },
      ],
    }, 'org-1', 'terminal-1')).toEqual({
      organizationId: 'org-1',
      terminalGroupId: 'terminal-1',
      order: {
        externalNumber: 'order-42',
        comment: 'Без перца',
        items: [
          { type: 'Product', productId: 'iiko-soup', amount: 2, price: 6.25 },
          { type: 'Product', productId: 'iiko-tea', amount: 1, price: 3 },
        ],
      },
    });
  });
});
