import { findMissingPosItemIds } from './pos-menu';

describe('findMissingPosItemIds', () => {
  it('returns only linked items absent from the full POS menu', () => {
    expect(findMissingPosItemIds(['dish-1', 'dish-2'], ['dish-2', 'dish-3']))
      .toEqual(['dish-1']);
  });

  it('does not mark any item missing when the import contains all linked items', () => {
    expect(findMissingPosItemIds(['dish-1', 'dish-2'], ['dish-1', 'dish-2', 'dish-3']))
      .toEqual([]);
  });
});
