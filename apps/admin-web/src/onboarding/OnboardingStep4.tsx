import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

type Zone = { id: string; name: string }
type Table = { id: string; number: number; seats: number; qrToken: string; qrUrl: string; zoneId: string }

type OnboardingStep4Props = {
  tenantId: string
  onComplete?: () => void
}

const apiRequest = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, init)
  if (!response.ok) throw new Error(await response.text() || 'Не удалось выполнить запрос')
  return response.json() as Promise<T>
}

function QrPreview({ url }: { url: string }) {
  const [image, setImage] = useState('')

  useEffect(() => {
    void QRCode.toDataURL(url, { width: 180, margin: 1 }).then(setImage)
  }, [url])

  return image ? <img className="mx-auto h-44 w-44" src={image} alt={`QR-код ${url}`} /> : null
}

export function OnboardingStep4({ tenantId, onComplete }: OnboardingStep4Props) {
  const [zones, setZones] = useState<Zone[]>([])
  const [selectedZoneId, setSelectedZoneId] = useState('')
  const [zoneName, setZoneName] = useState('')
  const [seats, setSeats] = useState(4)
  const [fromNumber, setFromNumber] = useState(1)
  const [toNumber, setToNumber] = useState(1)
  const [tables, setTables] = useState<Table[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void apiRequest<Zone[]>(`/api/v1/admin/zones?tenantId=${encodeURIComponent(tenantId)}`)
      .then((items) => {
        setZones(items)
        setSelectedZoneId(items[0]?.id ?? '')
      })
      .catch(() => setError('Не удалось загрузить зоны'))
  }, [tenantId])

  const addZone = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const zone = await apiRequest<Zone>('/api/v1/admin/zones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenantId, name: zoneName }),
      })
      setZones((items) => [...items, zone])
      setSelectedZoneId(zone.id)
      setZoneName('')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось добавить зону')
    } finally {
      setBusy(false)
    }
  }

  const addTables = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const created = await apiRequest<Table[]>('/api/v1/admin/tables/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, zoneId: selectedZoneId, seats, fromNumber, toNumber }),
      })
      setTables((items) => [...items, ...created])
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось добавить столы')
    } finally {
      setBusy(false)
    }
  }

  const downloadPdf = async () => {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/v1/admin/tables/generate-qr-pdf', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenantId, tableIds: tables.map((table) => table.id) }),
      })
      if (!response.ok) throw new Error(await response.text())
      const link = document.createElement('a')
      link.href = URL.createObjectURL(await response.blob())
      link.download = 'table-qr-codes.pdf'
      link.click()
      URL.revokeObjectURL(link.href)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Не удалось скачать PDF')
    } finally {
      setBusy(false)
    }
  }

  return <main className="min-h-svh bg-bonapp-bg px-6 py-12 text-slate-900">
    <div className="mx-auto max-w-5xl">
      <p className="text-sm font-semibold text-bonapp-accent">Онбординг · Шаг 4 из 4</p>
      <h1 className="mt-2 text-3xl font-semibold">Добавьте столы и QR-коды</h1>
      <p className="mt-2 text-slate-600">Создайте зоны, добавьте первые столы и сразу подготовьте тейбл-тенты к печати.</p>
      {error && <p role="alert" className="mt-4 rounded bg-red-50 p-3 text-red-700">{error}</p>}
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <section className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Зоны зала</h2>
          <form className="mt-4 flex gap-2" onSubmit={addZone}>
            <label className="sr-only" htmlFor="zone-name">Название зоны</label>
            <input id="zone-name" aria-label="Название зоны" required value={zoneName} onChange={(event) => setZoneName(event.target.value)} className="min-w-0 flex-1 rounded border p-2" placeholder="Например, Терраса" />
            <button disabled={busy} className="rounded bg-bonapp-accent px-4 py-2 font-medium text-white">Добавить зону</button>
          </form>
          <ul className="mt-4 space-y-2">{zones.map((zone) => <li key={zone.id}><button onClick={() => setSelectedZoneId(zone.id)} className={`w-full rounded p-2 text-left ${selectedZoneId === zone.id ? 'bg-orange-50 text-bonapp-accent' : 'bg-slate-50'}`}>{zone.name}</button></li>)}</ul>
        </section>
        <section className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Быстрое добавление столов</h2>
          <form className="mt-4 grid gap-4" onSubmit={addTables}>
            <label>Зона<select required value={selectedZoneId} onChange={(event) => setSelectedZoneId(event.target.value)} className="mt-1 block w-full rounded border p-2"><option value="">Выберите зону</option>{zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></label>
            <div className="grid grid-cols-3 gap-3"><label>Мест<input aria-label="Мест" type="number" min="1" value={seats} onChange={(event) => setSeats(Number(event.target.value))} className="mt-1 w-full rounded border p-2" /></label><label>С<input aria-label="С" type="number" min="1" value={fromNumber} onChange={(event) => setFromNumber(Number(event.target.value))} className="mt-1 w-full rounded border p-2" /></label><label>По<input aria-label="По" type="number" min="1" value={toNumber} onChange={(event) => setToNumber(Number(event.target.value))} className="mt-1 w-full rounded border p-2" /></label></div>
            <button disabled={busy || !selectedZoneId} className="rounded bg-bonapp-accent px-4 py-2 font-medium text-white">Добавить столы</button>
          </form>
        </section>
      </div>
      {tables.length > 0 && <section className="mt-8 rounded-xl bg-white p-6 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-4"><h2 className="text-xl font-semibold">Предпросмотр тейбл-тентов</h2><button onClick={downloadPdf} disabled={busy} className="rounded border border-bonapp-accent px-4 py-2 font-medium text-bonapp-accent">Скачать PDF</button></div><div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{tables.map((table) => <article key={table.id} className="rounded border p-5 text-center"><QrPreview url={table.qrUrl} /><h3 className="mt-3 text-lg font-semibold">Стол {table.number}</h3><p className="text-sm text-slate-600">{table.seats} мест</p></article>)}</div></section>}
      <button onClick={() => onComplete ? onComplete() : window.location.assign('/welcome')} className="mt-8 rounded bg-slate-900 px-5 py-3 font-medium text-white">Завершить онбординг</button>
    </div>
  </main>
}
