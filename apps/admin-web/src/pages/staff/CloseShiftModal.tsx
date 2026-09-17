import { useState } from 'react'
import type { ShiftDto, CloseShiftResultDto } from '@bonapp/shared-types'

interface Props {
  shift: ShiftDto
  onConfirm: (shiftId: string) => Promise<CloseShiftResultDto>
  onClose: () => void
}

export function CloseShiftModal({ shift, onConfirm, onClose }: Props) {
  const [result, setResult] = useState<CloseShiftResultDto | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleClose() {
    setLoading(true)
    try {
      const data = await onConfirm(shift.id)
      setResult(data)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
        {result ? (
          <>
            <h2 className="mb-4 text-lg font-semibold">Смена закрыта</h2>
            <dl className="mb-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Выручка</dt>
                <dd className="font-medium">{result.totalRevenue.toFixed(2)} BYN</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Количество чеков</dt>
                <dd className="font-medium">{result.ordersCount}</dd>
              </div>
            </dl>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-bonapp-accent px-4 py-2 text-sm text-white"
              >
                Готово
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="mb-2 text-lg font-semibold">Закрыть смену?</h2>
            <p className="mb-4 text-sm text-gray-600">
              Открыто заказов: <strong>{shift.ordersCount}</strong>. Данное действие необратимо.
            </p>
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
                onClick={handleClose}
                disabled={loading}
                className="rounded-lg bg-bonapp-accent px-4 py-2 text-sm text-white disabled:opacity-60"
              >
                {loading ? 'Закрытие…' : 'Закрыть смену'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
