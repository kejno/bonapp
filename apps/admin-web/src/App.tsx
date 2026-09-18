import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'
import { WaiterCallReason, type WaiterCalledEvent } from '@bonapp/shared-types'

const queryClient = new QueryClient()

interface Notification extends WaiterCalledEvent {
  id: number
}

function waiterCallText({ tableNumber, reason }: WaiterCalledEvent): string {
  const request = reason === WaiterCallReason.NEED_BILL ? 'просит счёт' : 'просит официанта'
  return `Стол №${tableNumber} ${request}`
}

function WaiterCallNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([])

  useEffect(() => {
    const addNotification = (event: Event) => {
      const detail = (event as CustomEvent<WaiterCalledEvent>).detail
      setNotifications((current) => [...current, { ...detail, id: Date.now() + current.length }])
    }
    window.addEventListener('waiter:called', addNotification)

    const tenantId = import.meta.env.VITE_TENANT_ID
    const socket = tenantId ? io({ path: '/socket.io' }) : undefined
    if (socket && tenantId) {
      socket.emit('hall:join', tenantId)
      socket.on('waiter:called', (event: WaiterCalledEvent) => {
        window.dispatchEvent(new CustomEvent('waiter:called', { detail: event }))
      })
    }

    return () => {
      window.removeEventListener('waiter:called', addNotification)
      socket?.disconnect()
    }
  }, [])

  return (
    <aside aria-live="polite" className="fixed right-4 top-4 space-y-2">
      {notifications.map((notification) => (
        <div className="flex items-center gap-3 rounded-xl bg-bonapp-accent p-4 text-white shadow-lg" key={notification.id}>
          <span>{waiterCallText(notification)}</span>
          <button
            aria-label="Закрыть уведомление"
            className="rounded p-1"
            onClick={() => setNotifications((current) => current.filter(({ id }) => id !== notification.id))}
          >
            ×
          </button>
        </div>
      ))}
    </aside>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <main className="flex min-h-svh items-center justify-center bg-bonapp-bg">
        <h1 className="text-2xl font-semibold text-bonapp-accent">
          Bonapp — Admin
        </h1>
      </main>
      <WaiterCallNotifications />
    </QueryClientProvider>
  )
}

export default App
