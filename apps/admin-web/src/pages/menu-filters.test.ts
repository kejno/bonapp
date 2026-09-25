import { describe, expect, it } from 'vitest';
import { filterMenuItems, type MenuItem } from './menu-filters';

const items: MenuItem[] = [
  { id: '1', name: 'Кофе', categoryId: 'hot', price: 450, imageUrl: null, kitchenDepartment: 'Бар', isActive: true, isInStopList: false },
  { id: '2', name: 'Чай', categoryId: 'hot', price: 350, imageUrl: null, kitchenDepartment: 'Бар', isActive: false, isInStopList: true },
  { id: '3', name: 'Суп', categoryId: 'food', price: 900, imageUrl: null, kitchenDepartment: 'Кухня', isActive: true, isInStopList: true },
];

describe('filterMenuItems', () => {
  it('filters by category, search and independent status flags', () => {
    expect(filterMenuItems(items, { categoryId: 'hot', query: 'ко', tab: 'all' }).map(({ id }) => id)).toEqual(['1']);
    expect(filterMenuItems(items, { categoryId: 'all', query: '', tab: 'stop-list' }).map(({ id }) => id)).toEqual(['2', '3']);
    expect(filterMenuItems(items, { categoryId: 'all', query: '', tab: 'inactive' }).map(({ id }) => id)).toEqual(['2']);
  });

  it('matches names regardless of case and surrounding whitespace', () => {
    expect(filterMenuItems(items, { categoryId: 'all', query: '  ЧАЙ ', tab: 'all' })).toEqual([items[1]]);
  });
});
