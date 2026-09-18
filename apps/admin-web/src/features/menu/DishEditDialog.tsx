import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import { ALLERGENS, dishSchema, type DishFormValues } from './dishSchema'

type DishEditDialogProps = {
  dishId?: string
  initialValues?: Partial<DishFormValues>
  onClose: () => void
  onSaved: (dish: DishFormValues) => void
}

const defaults: DishFormValues = {
  name: '', description: '', category: '', price: 0, cost: 0, imageUrl: '', weight: 0,
  kitchen: 'HOT', preparationTime: 0, isActive: true, isHit: false,
  calories: undefined, protein: undefined, fat: undefined, carbohydrates: undefined,
  allergens: [], posItemId: '', modifierGroups: [],
}

const tabs = ['Основное', 'Модификаторы', 'Питание & Аллергены', 'POS'] as const
type Tab = (typeof tabs)[number]

export function DishEditDialog({ dishId, initialValues, onClose, onSaved }: DishEditDialogProps) {
  const queryClient = useQueryClient()
  const form = useForm<DishFormValues>({ resolver: zodResolver(dishSchema), defaultValues: { ...defaults, ...initialValues } })
  const groups = useFieldArray({ control: form.control, name: 'modifierGroups' })
  const [activeTab, setActiveTab] = useState<Tab>('Основное')
  const [preview, setPreview] = useState(initialValues?.imageUrl ?? '')
  const [saving, setSaving] = useState(false)

  async function submit(values: DishFormValues) {
    setSaving(true)
    try {
      const response = await fetch(`/api/v1/admin/menu/items/${dishId ?? ''}`, {
        method: dishId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      if (!response.ok) throw new Error('Не удалось сохранить блюдо')
      await queryClient.invalidateQueries({ queryKey: ['menu-items'] })
      onSaved(values)
      onClose()
    } catch (error) {
      form.setError('root', { message: error instanceof Error ? error.message : 'Не удалось сохранить блюдо' })
    } finally {
      setSaving(false)
    }
  }

  function addGroup() {
    groups.append({ name: '', isRequired: false, minSelection: 0, maxSelection: 1, options: [{ name: '', extraPrice: 0 }] })
  }

  function addOption(index: number) {
    const options = form.getValues(`modifierGroups.${index}.options`)
    form.setValue(`modifierGroups.${index}.options`, [...options, { name: '', extraPrice: 0 }], { shouldValidate: true })
  }

  function selectPhoto(file?: File) {
    if (!file || !file.type.startsWith('image/')) return
    const imageUrl = URL.createObjectURL(file)
    setPreview(imageUrl)
    form.setValue('imageUrl', imageUrl)
  }

  return (
    <div className="fixed inset-0 z-10 grid place-items-center bg-black/50 p-4" role="presentation">
      <section aria-modal="true" aria-labelledby="dish-dialog-title" className="max-h-[90svh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl" role="dialog">
        <div className="mb-5 flex items-center justify-between">
          <h2 id="dish-dialog-title" className="text-xl font-semibold">{dishId ? 'Редактировать блюдо' : 'Создать блюдо'}</h2>
          <button type="button" aria-label="Закрыть" onClick={onClose}>×</button>
        </div>
        <div role="tablist" aria-label="Разделы блюда" className="mb-6 flex flex-wrap gap-2 border-b">
          {tabs.map((tab) => <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} onClick={() => setActiveTab(tab)} className="px-3 py-2">{tab}</button>)}
        </div>
        <form onSubmit={form.handleSubmit(submit)}>
          {activeTab === 'Основное' && <MainTab form={form} preview={preview} onPhoto={selectPhoto} />}
          {activeTab === 'Модификаторы' && <ModifiersTab form={form} groups={groups} onAddGroup={addGroup} onAddOption={addOption} />}
          {activeTab === 'Питание & Аллергены' && <NutritionTab form={form} />}
          {activeTab === 'POS' && <label className="grid gap-1">POS ID <input {...form.register('posItemId')} className="rounded border p-2" /></label>}
          {form.formState.errors.root && <p role="alert" className="mt-4 text-red-600">{form.formState.errors.root.message}</p>}
          <div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onClose}>Отмена</button><button type="submit" disabled={saving} className="rounded bg-bonapp-accent px-4 py-2 text-white">{saving ? 'Сохранение…' : 'Сохранить'}</button></div>
        </form>
      </section>
    </div>
  )
}

function MainTab({ form, preview, onPhoto }: { form: ReturnType<typeof useForm<DishFormValues>>; preview: string; onPhoto: (file?: File) => void }) {
  const numeric = (name: 'price' | 'cost' | 'weight' | 'preparationTime') => form.register(name, { valueAsNumber: true })
  return <div className="grid gap-4 sm:grid-cols-2">
    <Field label="Название" error={form.formState.errors.name?.message}><input {...form.register('name')} /></Field>
    <Field label="Категория" error={form.formState.errors.category?.message}><input {...form.register('category')} /></Field>
    <Field label="Описание" className="sm:col-span-2"><textarea {...form.register('description')} /></Field>
    <Field label="Цена, BYN" error={form.formState.errors.price?.message}><input type="number" step="0.01" {...numeric('price')} /></Field>
    <Field label="Себестоимость, BYN" error={form.formState.errors.cost?.message}><input type="number" step="0.01" {...numeric('cost')} /></Field>
    <Field label="Граммовка" error={form.formState.errors.weight?.message}><input type="number" {...numeric('weight')} /></Field>
    <Field label="Время приготовления, мин"><input type="number" {...numeric('preparationTime')} /></Field>
    <Field label="Цех"><select {...form.register('kitchen')}><option value="HOT">Горячий</option><option value="COLD">Холодный</option><option value="BAR">Бар</option></select></Field>
    <label className="grid cursor-pointer gap-2 rounded border border-dashed p-3">Фото блюда<input type="file" accept="image/*" onChange={(event) => onPhoto(event.target.files?.[0])} onDrop={(event) => { event.preventDefault(); onPhoto(event.dataTransfer.files[0]) }} onDragOver={(event) => event.preventDefault()} />{preview && <img src={preview} alt="Предпросмотр блюда" className="h-20 w-20 rounded object-cover" />}</label>
    <label><input type="checkbox" {...form.register('isActive')} /> Активно</label><label><input type="checkbox" {...form.register('isHit')} /> Хит</label>
  </div>
}

function ModifiersTab({ form, groups, onAddGroup, onAddOption }: { form: ReturnType<typeof useForm<DishFormValues>>; groups: ReturnType<typeof useFieldArray<DishFormValues, 'modifierGroups'>>; onAddGroup: () => void; onAddOption: (index: number) => void }) {
  return <div className="grid gap-4"><button type="button" onClick={onAddGroup}>Добавить группу</button>{groups.fields.map((group, groupIndex) => <div key={group.id} className="rounded border p-4"><div className="flex gap-2"><input aria-label="Название группы" placeholder="Название группы" {...form.register(`modifierGroups.${groupIndex}.name`)} /><button type="button" onClick={() => groups.remove(groupIndex)}>Удалить</button></div><label><input type="checkbox" {...form.register(`modifierGroups.${groupIndex}.isRequired`)} /> Обязательно</label><div className="my-2 flex gap-2"><label>Мин. <input type="number" {...form.register(`modifierGroups.${groupIndex}.minSelection`, { valueAsNumber: true })} /></label><label>Макс. <input type="number" {...form.register(`modifierGroups.${groupIndex}.maxSelection`, { valueAsNumber: true })} /></label></div>{form.watch(`modifierGroups.${groupIndex}.options`).map((_, optionIndex) => <div key={optionIndex} className="flex gap-2"><input aria-label="Название опции" placeholder="Название опции" {...form.register(`modifierGroups.${groupIndex}.options.${optionIndex}.name`)} /><input aria-label="Доплата" type="number" step="0.01" {...form.register(`modifierGroups.${groupIndex}.options.${optionIndex}.extraPrice`, { valueAsNumber: true })} /></div>)}<button type="button" onClick={() => onAddOption(groupIndex)}>Добавить опцию</button></div>)}</div>
}

function NutritionTab({ form }: { form: ReturnType<typeof useForm<DishFormValues>> }) {
  const fields = [['calories', 'Ккал'], ['protein', 'Белки'], ['fat', 'Жиры'], ['carbohydrates', 'Углеводы']] as const
  const selected = form.watch('allergens')
  return <div className="grid gap-4"><div className="grid gap-3 sm:grid-cols-2">{fields.map(([name, label]) => <Field key={name} label={label}><input type="number" {...form.register(name, { setValueAs: (value) => value === '' ? undefined : Number(value) })} /></Field>)}</div><fieldset><legend>Аллергены</legend>{ALLERGENS.map(({ value, label }) => <label key={value} className="block"><input type="checkbox" checked={selected.includes(value)} onChange={(event) => form.setValue('allergens', event.target.checked ? [...selected, value] : selected.filter((item) => item !== value))} /> {label}</label>)}</fieldset></div>
}

function Field({ label, error, children, className = '' }: { label: string; error?: string; children: ReactNode; className?: string }) {
  return <label className={`grid gap-1 ${className}`}>{label}{children}{error && <span className="text-sm text-red-600">{error}</span>}</label>
}
