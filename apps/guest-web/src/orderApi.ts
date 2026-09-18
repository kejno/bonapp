import type { OrderSnapshot } from '@bonapp/shared-types'

export async function getOrder(orderId: string): Promise<OrderSnapshot> {
  const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`)

  if (!response.ok) {
    throw new Error('Не удалось загрузить заказ')
  }

  return response.json() as Promise<OrderSnapshot>
}
