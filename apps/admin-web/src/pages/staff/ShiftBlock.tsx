import type { ShiftDto, StaffMemberDto } from '@bonapp/shared-types'

interface Props {
  shift: ShiftDto | null | undefined
  staff: StaffMemberDto[]
  onOpenShift: () => void
  onCloseShift: () => void
}

export function ShiftBlock({ shift, onOpenShift, onCloseShift }: Props) {
  if (!shift) {
    return (
      <section className="mb-6 rounded-xl border bg-white p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">Смена не открыта</p>
          <button
            type="button"
            onClick={onOpenShift}
            className="rounded-lg bg-bonapp-accent px-3 py-1.5 text-sm text-white"
          >
            Открыть смену
          </button>
        </div>
      </section>
    )
  }

  const opened = new Date(shift.openedAt).toLocaleString('ru-BY', {
    dateStyle: 'short',
    timeStyle: 'short',
  })

  return (
    <section className="mb-6 rounded-xl border bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1 text-sm">
          <p>
            <span className="text-gray-500">Открыта:</span>{' '}
            <strong>{opened}</strong>
          </p>
          <p>
            <span className="text-gray-500">Кассир:</span>{' '}
            <strong>{shift.cashier.name}</strong>
          </p>
          <p>
            <span className="text-gray-500">Заказов:</span>{' '}
            <strong>{shift.ordersCount}</strong>
          </p>
        </div>
        <button
          type="button"
          onClick={onCloseShift}
          className="shrink-0 rounded-lg border border-bonapp-accent px-3 py-1.5 text-sm text-bonapp-accent"
        >
          Закрыть смену
        </button>
      </div>
    </section>
  )
}
