import { describe, expect, it } from 'vitest'
import { dishSchema } from './dishSchema'

describe('dishSchema', () => {
  it('accepts a dish with multiple fixed allergens and modifiers', () => {
    const result = dishSchema.safeParse({
      name: 'Стейк',
      description: 'Говядина на гриле',
      category: 'Горячие блюда',
      price: 25.5,
      cost: 12,
      weight: 320,
      kitchen: 'HOT',
      preparationTime: 20,
      isActive: true,
      isHit: false,
      allergens: ['gluten', 'milk'],
      posItemId: 'pos-steak-1',
      modifierGroups: [{
        name: 'Степень прожарки',
        isRequired: true,
        minSelection: 1,
        maxSelection: 1,
        options: [
          { name: 'Medium', extraPrice: 0 },
          { name: 'Well done', extraPrice: 1 },
        ],
      }],
    })

    expect(result.success).toBe(true)
  })

  it('rejects an unknown allergen and a modifier range above its options', () => {
    const result = dishSchema.safeParse({
      name: 'Суп',
      category: 'Супы',
      price: 10,
      cost: 4,
      weight: 250,
      kitchen: 'HOT',
      preparationTime: 10,
      isActive: true,
      isHit: false,
      allergens: ['unknown'],
      posItemId: '',
      modifierGroups: [{
        name: 'Добавки',
        isRequired: false,
        minSelection: 0,
        maxSelection: 2,
        options: [{ name: 'Сыр', extraPrice: 1 }],
      }],
    })

    expect(result.success).toBe(false)
  })
})
