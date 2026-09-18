import { z } from 'zod'

export const ALLERGENS = [
  { value: 'gluten', label: 'Злаки, содержащие глютен' },
  { value: 'crustaceans', label: 'Ракообразные' },
  { value: 'eggs', label: 'Яйца' },
  { value: 'fish', label: 'Рыба' },
  { value: 'peanuts', label: 'Арахис' },
  { value: 'soy', label: 'Соя' },
  { value: 'milk', label: 'Молоко (включая лактозу)' },
  { value: 'nuts', label: 'Орехи' },
  { value: 'celery', label: 'Сельдерей' },
  { value: 'mustard', label: 'Горчица' },
  { value: 'sesame', label: 'Кунжут' },
  { value: 'sulphites', label: 'Диоксид серы и сульфиты' },
  { value: 'lupin', label: 'Люпин' },
  { value: 'molluscs', label: 'Моллюски' },
] as const

export type Allergen = (typeof ALLERGENS)[number]['value']

const modifierOptionSchema = z.object({
  name: z.string().trim().min(1, 'Укажите название опции'),
  extraPrice: z.number().min(0, 'Цена не может быть отрицательной'),
})

const modifierGroupSchema = z
  .object({
    name: z.string().trim().min(1, 'Укажите название группы'),
    isRequired: z.boolean(),
    minSelection: z.number().int().min(0),
    maxSelection: z.number().int().min(0),
    options: z.array(modifierOptionSchema).min(1, 'Добавьте хотя бы одну опцию'),
  })
  .superRefine((group, context) => {
    if (group.minSelection > group.maxSelection) {
      context.addIssue({ code: 'custom', path: ['minSelection'], message: 'Минимум не может быть больше максимума' })
    }
    if (group.maxSelection > group.options.length) {
      context.addIssue({ code: 'custom', path: ['maxSelection'], message: 'Максимум не может быть больше числа опций' })
    }
  })

export const dishSchema = z.object({
  name: z.string().trim().min(1, 'Укажите название блюда'),
  description: z.string().trim(),
  category: z.string().trim().min(1, 'Укажите категорию'),
  price: z.number().min(0, 'Цена не может быть отрицательной'),
  cost: z.number().min(0, 'Себестоимость не может быть отрицательной'),
  imageUrl: z.string().optional(),
  weight: z.number().positive('Граммовка должна быть больше нуля'),
  kitchen: z.enum(['HOT', 'COLD', 'BAR']),
  preparationTime: z.number().int().min(0),
  isActive: z.boolean(),
  isHit: z.boolean(),
  calories: z.number().min(0).optional(),
  protein: z.number().min(0).optional(),
  fat: z.number().min(0).optional(),
  carbohydrates: z.number().min(0).optional(),
  allergens: z.array(z.enum(ALLERGENS.map(({ value }) => value) as [Allergen, ...Allergen[]])),
  posItemId: z.string().trim(),
  modifierGroups: z.array(modifierGroupSchema),
})

export type DishFormValues = z.infer<typeof dishSchema>
