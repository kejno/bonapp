import { useEffect, useState } from 'react'
import { useCartStore } from '../cart/cart-store'
import type { MenuItem, ModifierGroup } from './menu-data'
import { calculateUnitPrice } from './price'

type DishBottomSheetProps = {
  item: MenuItem
  onClose: () => void
}

const formatPrice = (price: number) => `${price.toFixed(2)} BYN`

export function DishBottomSheet({ item, onClose }: DishBottomSheetProps) {
  const addItem = useCartStore((state) => state.addItem)
  const [selectedByGroup, setSelectedByGroup] = useState<Record<string, string[]>>({})
  const [quantity, setQuantity] = useState(1)
  const [showValidation, setShowValidation] = useState(false)
  const [touchStart, setTouchStart] = useState<number | null>(null)

  useEffect(() => {
    const closeOnBack = () => onClose()
    window.addEventListener('popstate', closeOnBack)
    return () => window.removeEventListener('popstate', closeOnBack)
  }, [onClose])

  const selectedModifiers = Object.values(selectedByGroup).flat()
  const modifiersById = new Map(
    item.modifierGroups.flatMap((group) => group.modifiers).map((modifier) => [modifier.id, modifier]),
  )
  const unitPrice = calculateUnitPrice(
    item.basePrice,
    selectedModifiers.map((id) => modifiersById.get(id)?.priceDelta ?? 0),
  )
  const unselectedRequiredGroups = item.modifierGroups.filter(
    (group) => group.required && !selectedByGroup[group.id]?.length,
  )

  const closeSheet = () => {
    if (window.history.state?.dishSheet) {
      window.history.back()
      return
    }
    onClose()
  }

  const selectModifier = (group: ModifierGroup, modifierId: string) => {
    setSelectedByGroup((current) => {
      const selected = current[group.id] ?? []
      if (group.required) {
        return { ...current, [group.id]: [modifierId] }
      }
      if (selected.includes(modifierId)) {
        return { ...current, [group.id]: selected.filter((id) => id !== modifierId) }
      }
      if (group.maxSelections && selected.length >= group.maxSelections) {
        return current
      }
      return { ...current, [group.id]: [...selected, modifierId] }
    })
    setShowValidation(false)
  }

  const addToOrder = () => {
    if (unselectedRequiredGroups.length) {
      setShowValidation(true)
      return
    }
    addItem({ itemId: item.id, quantity, selectedModifiers, unitPrice })
    closeSheet()
  }

  return (
    <div className="fixed inset-0 z-10 bg-black/40" onMouseDown={closeSheet}>
      <section
        aria-label={`Карточка блюда: ${item.name}`}
        aria-modal="true"
        className="absolute inset-x-0 bottom-0 max-h-[92svh] overflow-y-auto rounded-t-3xl bg-bonapp-bg shadow-2xl"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
        onTouchEnd={(event) => {
          if (touchStart !== null && event.changedTouches[0].clientY - touchStart > 90) closeSheet()
          setTouchStart(null)
        }}
        onTouchStart={(event) => setTouchStart(event.touches[0].clientY)}
      >
        <div className="mx-auto my-3 h-1 w-10 rounded-full bg-stone-300" />
        <img alt={item.name} className="h-56 w-full object-cover" src={item.imageUrl} />
        <div className="space-y-6 p-5 pb-32">
          <div>
            <h2 className="text-2xl font-bold text-stone-900">{item.name}</h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">{item.description}</p>
            <p className="mt-3 text-sm font-medium text-stone-700">{item.weightGrams} г</p>
          </div>

          <div className="grid grid-cols-4 gap-2 rounded-2xl bg-white p-3 text-center text-xs text-stone-600">
            <span>{item.nutrition.calories} ккал</span><span>Б {item.nutrition.proteins} г</span><span>Ж {item.nutrition.fats} г</span><span>У {item.nutrition.carbs} г</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {item.allergens.map((allergen) => <span className="rounded-full bg-orange-100 px-3 py-1 text-xs text-orange-800" key={allergen}>{allergen}</span>)}
          </div>

          {item.modifierGroups.map((group) => {
            const selected = selectedByGroup[group.id] ?? []
            return (
              <fieldset className="space-y-3" key={group.id}>
                <legend className="font-semibold text-stone-900">
                  {group.name} <span className="font-normal text-stone-500">{group.required ? 'Выберите 1' : `До ${group.maxSelections}`}</span>
                </legend>
                {showValidation && group.required && !selected.length && <p className="text-sm text-red-600">Выберите {group.name.toLowerCase()}</p>}
                {group.modifiers.map((modifier) => {
                  const isSelected = selected.includes(modifier.id)
                  const maxReached = !isSelected && !group.required && Boolean(group.maxSelections && selected.length >= group.maxSelections)
                  return (
                    <label className="flex cursor-pointer items-center justify-between rounded-xl bg-white p-4 text-sm shadow-sm" key={modifier.id}>
                      <span className="flex items-center gap-3">
                        <input
                          checked={isSelected}
                          disabled={maxReached}
                          name={group.id}
                          onChange={() => selectModifier(group, modifier.id)}
                          type={group.required ? 'radio' : 'checkbox'}
                        />
                        {modifier.name}
                      </span>
                      {modifier.priceDelta > 0 && <span className="font-medium text-stone-700">+{formatPrice(modifier.priceDelta)}</span>}
                    </label>
                  )
                })}
              </fieldset>
            )
          })}
        </div>

        <div className="fixed inset-x-0 bottom-0 flex items-center gap-3 border-t border-stone-200 bg-bonapp-bg p-4">
          <div className="flex items-center rounded-xl bg-white">
            <button aria-label="Уменьшить количество" className="px-3 py-2 text-lg" disabled={quantity === 1} onClick={() => setQuantity((value) => value - 1)} type="button">−</button>
            <span className="min-w-8 text-center font-semibold">{quantity}</span>
            <button aria-label="Увеличить количество" className="px-3 py-2 text-lg" onClick={() => setQuantity((value) => value + 1)} type="button">+</button>
          </div>
          <button className="flex-1 rounded-xl bg-bonapp-accent px-4 py-3 font-semibold text-white" onClick={addToOrder} type="button">
            Добавить в заказ · {formatPrice(unitPrice * quantity)}
          </button>
        </div>
      </section>
    </div>
  )
}
