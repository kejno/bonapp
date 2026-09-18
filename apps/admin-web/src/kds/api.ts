import type { KdsOrder, KdsStatus, Kitchen } from './types'

const apiUrl = import.meta.env.VITE_API_URL ?? '/api'

export async function getKdsOrders(): Promise<KdsOrder[]> {
  const response = await fetch(`${apiUrl}/kds/orders`)
  if (!response.ok) {
    throw new Error('Не удалось загрузить заказы KDS')
  }
  return response.json() as Promise<KdsOrder[]>
}

export async function updateKdsOrderStatus(
  orderId: string,
  status: KdsStatus,
  kitchen?: Kitchen,
): Promise<void> {
  const response = await fetch(`${apiUrl}/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, kitchen }),
  })
  if (!response.ok) {
    throw new Error('Не удалось обновить статус заказа')
  }
}
