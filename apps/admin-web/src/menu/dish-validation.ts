import { z } from 'zod';

export const ALLERGENS = {
  GLUTEN: 'Злаки, содержащие глютен', CRUSTACEANS: 'Ракообразные', EGGS: 'Яйца', FISH: 'Рыба',
  PEANUTS: 'Арахис', SOY: 'Соя', MILK: 'Молоко (включая лактозу)', NUTS: 'Орехи',
  CELERY: 'Сельдерей', MUSTARD: 'Горчица', SESAME: 'Кунжут', SULPHITES: 'Диоксид серы и сульфиты',
  LUPIN: 'Люпин', MOLLUSCS: 'Моллюски',
} as const;
const optionalNumber = (label: string, max?: number) => z.string().optional().default('').refine((v) => !v || (Number.isFinite(Number(v)) && Number(v) >= 0 && (max === undefined || Number(v) <= max)), `${label}: укажите допустимое число`);
export const dishSchema = z.object({
  name: z.string().trim().min(1, 'Укажите название'), description: z.string().max(1000).default(''),
  categoryId: z.string().min(1, 'Выберите категорию'), price: z.string().min(1, 'Укажите цену').refine((v) => Number.isFinite(Number(v)) && Number(v) >= 0, 'Цена должна быть неотрицательной'),
  costPrice: optionalNumber('Себестоимость'), imageUrl: z.string().default(''), weightGrams: optionalNumber('Граммовка'),
  kitchenDepartment: z.enum(['HOT', 'COLD', 'BAR']), cookingTimeMinutes: optionalNumber('Время приготовления'),
  isActive: z.boolean(), isHit: z.boolean(), calories: optionalNumber('Ккал'), proteins: optionalNumber('Белки'),
  fats: optionalNumber('Жиры'), carbs: optionalNumber('Углеводы'), allergens: z.array(z.enum(Object.keys(ALLERGENS) as [keyof typeof ALLERGENS, ...(keyof typeof ALLERGENS)[]])), posItemId: z.string().default(''),
});
export type DishFormValues = z.infer<typeof dishSchema>;
export type DishFormInput = z.input<typeof dishSchema>;
