import { useState } from 'react'
import type { StaffMemberDto } from '@bonapp/shared-types'

interface Props {
  staff: StaffMemberDto[]
  onOpen: (cashierId: string) => Promise<void>
  onClose: () => void
}

export function OpenShiftModal({ staff, onOpen, onClose }: Props) {
  const active = staff.filter((m) => m.isActive)
  const [cashierId, setCashierId] = useState(active[0]?.id ?? '')
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    if (!cashierId) return
    setLoading(true)
    try {
      await onOpen(cashierId)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-semibold">Открыть смену</h2>

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium">Кассир</label>
          <select
            value={cashierId}
            onChange={(e) => setCashierId(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          >
            {active.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} — {m.role}
              </option>
            ))}
          </select>
          {active.length === 0 && (
            <p className="mt-1 text-xs text-red-600">Нет активных сотрудников</p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border px-4 py-2 text-sm"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!cashierId || loading}
            className="rounded-lg bg-bonapp-accent px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            {loading ? 'Открытие…' : 'Открыть'}
          </button>
        </div>
      </div>
    </div>
  )
}
