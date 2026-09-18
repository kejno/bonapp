import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

type PosType = 'iiko_cloud' | 'r_keeper' | 'none'
type ImportProgress = {
  id: string
  status: 'queued' | 'running' | 'completed' | 'completed_with_errors' | 'failed'
  importedItems: number
  totalItems: number
  failedItems?: number
  errors?: Array<{ name: string; reason: string }>
}

const tenantHeaders = { 'x-tenant-id': 'current-tenant', 'content-type': 'application/json' }

export function OnboardingStep2({ onSkip }: { onSkip?: () => void }) {
  const [posType, setPosType] = useState<PosType>('iiko_cloud')
  const [apiKey, setApiKey] = useState('')
  const [url, setUrl] = useState('')
  const [checkResult, setCheckResult] = useState<{ pingMs: number; itemsCount: number }>()
  const [progress, setProgress] = useState<ImportProgress>()
  const [error, setError] = useState('')

  useEffect(() => {
    if (!progress || !['queued', 'running'].includes(progress.status)) return
    const timer = window.setInterval(async () => {
      const response = await fetch('/api/v1/admin/tenant/onboarding/step2/menu-import', { headers: tenantHeaders })
      if (response.ok) setProgress(await response.json())
    }, 2_000)
    return () => window.clearInterval(timer)
  }, [progress])

  async function checkConnection(event: FormEvent) {
    event.preventDefault()
    setError('')
    const response = await fetch('/api/v1/admin/tenant/onboarding/step2/pos-check', {
      method: 'POST',
      headers: tenantHeaders,
      body: JSON.stringify({ posType, apiKey, ...(url && { url }) }),
    })
    if (!response.ok) return setError('Не удалось проверить подключение')
    setCheckResult(await response.json())
  }

  async function startImport() {
    setError('')
    const response = await fetch('/api/v1/admin/tenant/onboarding/step2/menu-import', {
      method: 'POST',
      headers: tenantHeaders,
    })
    if (!response.ok) return setError('Не удалось запустить импорт')
    const createdImport = await response.json()
    const progressResponse = await fetch('/api/v1/admin/tenant/onboarding/step2/menu-import', { headers: tenantHeaders })
    setProgress(progressResponse.ok ? await progressResponse.json() : { ...createdImport, status: 'queued', importedItems: 0, totalItems: 0 })
  }

  const importing = progress && ['queued', 'running'].includes(progress.status)
  const importCompleted = progress?.status === 'completed'

  return (
    <main className="min-h-svh bg-bonapp-bg px-6 py-12 text-slate-900">
      <section className="mx-auto max-w-xl rounded-2xl bg-white p-8 shadow-sm">
        <p className="text-sm font-medium text-bonapp-accent">Онбординг · Шаг 2 из 3</p>
        <h1 className="mt-2 text-2xl font-semibold">Подключите POS-систему</h1>
        <p className="mt-2 text-slate-600">Импортируйте меню из кассы или продолжите без подключения.</p>

        <form className="mt-6 space-y-4" onSubmit={checkConnection}>
          <fieldset>
            <legend className="font-medium">POS-система</legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {([['iiko_cloud', 'iiko Cloud'], ['r_keeper', 'r_keeper'], ['none', 'Без POS']] as const).map(([value, label]) => (
                <label className="cursor-pointer rounded-lg border p-3" key={value}>
                  <input checked={posType === value} name="posType" onChange={() => { setPosType(value); setCheckResult(undefined) }} type="radio" value={value} /> {label}
                </label>
              ))}
            </div>
          </fieldset>

          {posType !== 'none' && <>
            <label className="block font-medium">API-ключ
              <input aria-label="API-ключ" className="mt-1 w-full rounded-lg border p-2" onChange={(event) => setApiKey(event.target.value)} required type="password" value={apiKey} />
            </label>
            {posType === 'r_keeper' && <label className="block font-medium">URL API
              <input className="mt-1 w-full rounded-lg border p-2" onChange={(event) => setUrl(event.target.value)} required type="url" value={url} />
            </label>}
            <button className="rounded-lg border border-bonapp-accent px-4 py-2 text-bonapp-accent" type="submit">Проверить подключение</button>
          </>}
        </form>

        {checkResult && <p className="mt-4 text-green-700">Соединение проверено: {checkResult.pingMs} мс, {checkResult.itemsCount} позиций</p>}
        {error && <p className="mt-4 text-red-700" role="alert">{error}</p>}

        {posType === 'none' ? <button className="mt-6 rounded-lg bg-bonapp-accent px-4 py-2 text-white" onClick={onSkip} type="button">Пропустить</button> :
          <div className="mt-6">
            <button className="rounded-lg bg-bonapp-accent px-4 py-2 text-white disabled:opacity-50" disabled={!checkResult || Boolean(importing) || importCompleted} onClick={startImport} type="button">Импортировать меню</button>
            {progress && <p className="mt-3">{importCompleted ? `Импортировано ${progress.importedItems} позиций` : `Импортировано ${progress.importedItems}/${progress.totalItems} позиций`}</p>}
            {progress?.status === 'completed_with_errors' && <div className="mt-3 text-amber-700">
              <p>Завершено с ошибками: {progress.failedItems} позиций.</p>
              <button className="mt-2 rounded-lg border border-amber-700 px-3 py-1" onClick={startImport} type="button">Повторить импорт неуспешных позиций</button>
            </div>}
          </div>}
      </section>
    </main>
  )
}
