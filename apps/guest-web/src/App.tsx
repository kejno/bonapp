import { useState } from 'react'
import { WaiterCallReason } from '@bonapp/shared-types'

function App() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')

  async function callWaiter(reason: WaiterCallReason) {
    setIsModalOpen(false)
    const response = await fetch('/api/v1/guest/call-waiter', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    setConfirmation(response.ok ? 'Официант уже идёт' : 'Не удалось вызвать официанта')
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-bonapp-bg">
      <div className="space-y-4 text-center">
        <h1 className="text-2xl font-semibold text-bonapp-accent">Bonapp — Guest</h1>
        <button
          className="rounded-xl bg-bonapp-accent px-5 py-3 font-semibold text-white"
          onClick={() => setIsModalOpen(true)}
        >
          Вызвать официанта
        </button>
        {confirmation && <p role="status">{confirmation}</p>}
      </div>
      {isModalOpen && (
        <div aria-modal="true" className="fixed inset-0 flex items-center justify-center bg-black/30" role="dialog">
          <div className="space-y-3 rounded-xl bg-bonapp-bg p-6 shadow-xl">
            <h2 className="text-lg font-semibold">Вызвать официанта</h2>
            <button className="block w-full rounded-xl border px-4 py-3" onClick={() => void callWaiter(WaiterCallReason.NEED_BILL)}>
              Попросить счёт
            </button>
            <button className="block w-full rounded-xl border px-4 py-3" onClick={() => void callWaiter(WaiterCallReason.CALL_STAFF)}>
              Позвать официанта
            </button>
          </div>
        </div>
      )}
    </main>
  )
}

export default App
