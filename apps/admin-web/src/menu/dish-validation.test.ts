import { describe, expect, it } from 'vitest';
import { dishSchema } from './dish-validation';

describe('dishSchema', () => {
  it('accepts valid dish values and multiple allergens', () => {
    const result = dishSchema.safeParse({
      name: 'Борщ', description: '', categoryId: 'cat-1', price: '12.50', costPrice: '',
      imageUrl: '', weightGrams: '350', kitchenDepartment: 'HOT', cookingTimeMinutes: '20',
      isActive: true, isHit: false, calories: '180', proteins: '8', fats: '6', carbs: '20',
      allergens: ['GLUTEN', 'MILK'], posItemId: '',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid price and unknown allergens', () => {
    expect(dishSchema.safeParse({ name: '', categoryId: '', price: '-1', allergens: ['made-up'] }).success).toBe(false);
  });

  it('rejects an empty price instead of coercing it to zero', () => {
    const result = dishSchema.safeParse({ name: 'Борщ', categoryId: 'cat-1', price: '', allergens: [] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((issue) => issue.path[0] === 'price')).toBe(true);
  });

  it('rejects fractional calories because the API stores whole kilocalories', () => {
    const result = dishSchema.safeParse({ name: 'Борщ', categoryId: 'cat-1', price: '12', calories: '180.5', allergens: [] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((issue) => issue.path[0] === 'calories')).toBe(true);
  });
});
