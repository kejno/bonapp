export type Modifier = {
  id: string
  name: string
  priceDelta: number
}

export type ModifierGroup = {
  id: string
  name: string
  required: boolean
  maxSelections?: number
  modifiers: Modifier[]
}

export type MenuItem = {
  id: string
  name: string
  description: string
  imageUrl: string
  weightGrams: number
  nutrition: {
    calories: number
    proteins: number
    fats: number
    carbs: number
  }
  allergens: string[]
  basePrice: number
  modifierGroups: ModifierGroup[]
}

export const menuItems: MenuItem[] = [
  {
    id: 'pasta-carbonara',
    name: 'Паста Карбонара',
    description: 'Тальятелле в сливочном соусе с беконом, пармезаном и желтком.',
    imageUrl:
      'https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=1200&q=80',
    weightGrams: 320,
    nutrition: { calories: 680, proteins: 28, fats: 38, carbs: 58 },
    allergens: ['Глютен', 'Молоко', 'Яйцо'],
    basePrice: 16,
    modifierGroups: [
      {
        id: 'pasta',
        name: 'Вариант пасты',
        required: true,
        modifiers: [
          { id: 'tagliatelle', name: 'Тальятелле', priceDelta: 0 },
          { id: 'spaghetti', name: 'Спагетти', priceDelta: 0 },
        ],
      },
      {
        id: 'extras',
        name: 'Добавить по желанию',
        required: false,
        maxSelections: 2,
        modifiers: [
          { id: 'extra-bacon', name: 'Дополнительный бекон', priceDelta: 2.5 },
          { id: 'extra-cheese', name: 'Дополнительный пармезан', priceDelta: 1.5 },
          { id: 'chili', name: 'Хлопья чили', priceDelta: 0 },
        ],
      },
    ],
  },
]
