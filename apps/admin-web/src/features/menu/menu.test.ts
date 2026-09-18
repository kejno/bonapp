import { describe, expect, it } from 'vitest'
import { filterMenuItems, type MenuItem } from './menu'

const items: MenuItem[] = [
  { id: '1', categoryId: 'hot', name: 'Борщ', price: 12, kitchen: 'Горячий цех', isActive: true, isStopListed: false, imageUrl: '' },
  { id: '2', categoryId: 'hot', name: 'Стейк', price: 32, kitchen: 'Гриль', isActive: true, isStopListed: true, imageUrl: '' },
  { id: '3', categoryId: 'hot', name: 'Суп дня', price: 9, kitchen: 'Горячий цех', isActive: false, isStopListed: true, imageUrl: '' },
]

describe('filterMenuItems', () => {
  it('filters items by a case-insensitive name search', () => {
    expect(filterMenuItems(items, 'сУп', 'all').map(({ id }) => id)).toEqual(['3'])
  })

  it('keeps inactive stop-listed items in the stop-list tab', () => {
    expect(filterMenuItems(items, '', 'stop-list').map(({ id }) => id)).toEqual(['2', '3'])
  })

  it('shows inactive items regardless of their stop-list value', () => {
    expect(filterMenuItems(items, '', 'inactive').map(({ id }) => id)).toEqual(['3'])
  })
})
