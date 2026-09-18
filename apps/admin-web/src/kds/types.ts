export const kdsStatuses = ['new', 'preparing', 'served', 'paid'] as const

export type KdsStatus = (typeof kdsStatuses)[number]
export type Kitchen = 'hot' | 'cold' | 'bar'
export type KitchenFilter = Kitchen | 'all'

export interface KdsItem {
  id: string
  name: string
  quantity: number
  kitchen: Kitchen
}

export interface KdsOrder {
  id: string
  number: string
  table: string
  waiter: string
  status: KdsStatus
  createdAt: string
  items: KdsItem[]
}

export const nextKdsStatus = (status: KdsStatus): KdsStatus | undefined => {
  const nextIndex = kdsStatuses.indexOf(status) + 1
  return kdsStatuses[nextIndex]
}
