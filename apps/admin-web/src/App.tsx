import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'

const queryClient = new QueryClient()
type TableStatus = 'FREE' | 'OCCUPIED' | 'BILL_REQUESTED'
type Zone = 'Основной зал' | 'Терраса' | 'VIP'
type RestaurantTable = { id: number; number: number; label: string; seats: number; zone: Zone; status: TableStatus; guest?: string; order?: string }

const zones: Zone[] = ['Основной зал', 'Терраса', 'VIP']
const initialTables: RestaurantTable[] = [
  { id: 1, number: 1, label: 'У окна', seats: 2, zone: 'Основной зал', status: 'FREE' },
  { id: 2, number: 2, label: 'Центральный', seats: 4, zone: 'Основной зал', status: 'OCCUPIED', guest: 'Анна Петрова', order: 'Заказ №1042' },
  { id: 3, number: 3, label: 'У бара', seats: 2, zone: 'Основной зал', status: 'BILL_REQUESTED', guest: 'Иван Смирнов', order: 'Заказ №1045' },
  { id: 4, number: 4, label: 'У входа', seats: 4, zone: 'Основной зал', status: 'FREE' },
  { id: 5, number: 5, label: 'Под навесом', seats: 4, zone: 'Терраса', status: 'FREE' },
  { id: 6, number: 6, label: 'Летний', seats: 6, zone: 'Терраса', status: 'OCCUPIED', guest: 'Мария Орлова', order: 'Заказ №1048' },
  { id: 7, number: 7, label: 'Приватный', seats: 8, zone: 'VIP', status: 'FREE' },
]
const statusStyles: Record<TableStatus, { label: string; className: string }> = {
  FREE: { label: 'Свободен', className: 'border-emerald-300 bg-emerald-50 text-emerald-950' },
  OCCUPIED: { label: 'Занят', className: 'border-amber-300 bg-amber-50 text-amber-950' },
  BILL_REQUESTED: { label: 'Запрошен счёт', className: 'border-red-300 bg-red-50 text-red-950' },
}

function App() {
  const [tables, setTables] = useState(initialTables)
  const [activeZone, setActiveZone] = useState<Zone>('Основной зал')
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)
  const [qrTableIds, setQrTableIds] = useState<number[]>([])
  const displayedTables = useMemo(() => tables.filter((table) => table.zone === activeZone), [activeZone, tables])

  function addTable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const number = Number(form.get('number'))
    const label = String(form.get('label')).trim()
    const seats = Number(form.get('seats'))
    const zone = form.get('zone') as Zone
    if (!number || !label || !seats || !zone) return
    setTables((current) => [...current, { id: Date.now(), number, label, seats, zone, status: 'FREE' }])
    setActiveZone(zone)
    setIsAdding(false)
  }

  function toggleQrTable(tableId: number) {
    setQrTableIds((selected) => selected.includes(tableId) ? selected.filter((id) => id !== tableId) : [...selected, tableId])
  }

  async function requestQrPdf() {
    const response = await fetch('/api/tables/generate-qr-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableIds: qrTableIds }),
    })
    if (!response.ok) return

    const url = URL.createObjectURL(await response.blob())
    const link = document.createElement('a')
    link.href = url
    link.download = 'table-qr-codes.pdf'
    link.click()
    URL.revokeObjectURL(url)
  }

  return <QueryClientProvider client={queryClient}>
    <main className="min-h-svh bg-bonapp-bg px-6 py-8 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div><p className="text-sm font-medium text-bonapp-accent">Ресторан</p><h1 className="text-3xl font-semibold">Схема зала и QR-генератор</h1></div>
          <div className="flex gap-3"><button className="rounded-xl border border-slate-300 bg-white px-4 py-2 font-medium" onClick={() => setIsPrinting(true)} type="button">Распечатать QR</button><button className="rounded-xl bg-bonapp-accent px-4 py-2 font-medium text-white" onClick={() => setIsAdding(true)} type="button">+ Добавить стол</button></div>
        </header>
        <nav aria-label="Зоны зала" className="mb-6 flex gap-2 border-b border-slate-200">
          {zones.map((zone) => <button aria-pressed={activeZone === zone} className={`border-b-2 px-4 py-3 font-medium ${activeZone === zone ? 'border-bonapp-accent text-bonapp-accent' : 'border-transparent text-slate-500'}`} key={zone} onClick={() => setActiveZone(zone)} type="button">{zone}</button>)}
        </nav>
        <section aria-label={`Столы зоны ${activeZone}`} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {displayedTables.map((table) => { const status = statusStyles[table.status]; return <button className={`min-h-40 rounded-xl border-2 p-5 text-left transition hover:-translate-y-0.5 ${status.className}`} key={table.id} onClick={() => setSelectedTable(table)} type="button"><span className="block text-xl font-semibold">Стол {table.number}</span><span className="mt-1 block text-sm">{table.label}</span><span className="mt-6 block text-sm font-medium">{status.label}</span><span className="mt-1 block text-sm">{table.seats} мест(а)</span></button> })}
        </section>
      </div>
      {isAdding && <Modal title="Добавить стол" onClose={() => setIsAdding(false)}><form className="space-y-4" onSubmit={addTable}><Field label="Номер стола" name="number" type="number" /><Field label="Метка" name="label" /><Field label="Количество мест" name="seats" type="number" /><label className="block text-sm font-medium">Зона<select className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" defaultValue={activeZone} name="zone">{zones.map((zone) => <option key={zone}>{zone}</option>)}</select></label><button className="w-full rounded-xl bg-bonapp-accent px-4 py-2 font-medium text-white" type="submit">Создать стол</button></form></Modal>}
      {selectedTable && <Modal title={`Стол ${selectedTable.number}`} onClose={() => setSelectedTable(null)}><dl className="space-y-3 text-sm"><div className="flex justify-between gap-4"><dt className="text-slate-500">Метка</dt><dd>{selectedTable.label}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Гость</dt><dd>{selectedTable.guest ?? 'Нет гостей'}</dd></div><div className="flex justify-between gap-4"><dt className="text-slate-500">Текущий заказ</dt><dd>{selectedTable.order ?? 'Нет активного заказа'}</dd></div></dl><div className="mt-6 flex gap-3"><button className="rounded-xl bg-bonapp-accent px-4 py-2 font-medium text-white" type="button">Открыть заказ</button><button className="rounded-xl border border-slate-300 px-4 py-2 font-medium" type="button">Изменить стол</button></div></Modal>}
      {isPrinting && <Modal title="Распечатать QR" onClose={() => setIsPrinting(false)}><p className="mb-4 text-sm text-slate-600">Выберите столы для постоянных QR-кодов.</p><div className="max-h-72 space-y-2 overflow-auto">{tables.map((table) => <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50" key={table.id}><input aria-label={`Стол ${table.number}`} checked={qrTableIds.includes(table.id)} onChange={() => toggleQrTable(table.id)} type="checkbox" />Стол {table.number} — {table.zone}</label>)}</div><button className="mt-6 w-full rounded-xl bg-bonapp-accent px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={qrTableIds.length === 0} onClick={() => void requestQrPdf()} type="button">Скачать PDF ({qrTableIds.length})</button></Modal>}
    </main>
  </QueryClientProvider>
}

function Field({ label, name, type = 'text' }: { label: string; name: string; type?: 'number' | 'text' }) { return <label className="block text-sm font-medium">{label}<input className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" min={type === 'number' ? 1 : undefined} name={name} required type={type} /></label> }
function Modal({ children, onClose, title }: { children: ReactNode; onClose: () => void; title: string }) { return <div className="fixed inset-0 flex items-center justify-center bg-slate-950/30 p-4"><section aria-label={title} aria-modal="true" className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl" role="dialog"><div className="mb-5 flex items-center justify-between gap-4"><h2 className="text-xl font-semibold">{title}</h2><button aria-label="Закрыть" className="text-xl text-slate-500" onClick={onClose} type="button">×</button></div>{children}</section></div> }

export default App
