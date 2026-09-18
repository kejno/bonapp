import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { createSlug, isValidUnp, slugPattern } from './step1.validation'

type Props = { onComplete?: () => void }

const initialValues = { name: '', slug: '', legalName: '', unp: '', address: '', color: '#e0533c' }

export function OnboardingStep1({ onComplete }: Props) {
  const [values, setValues] = useState(initialValues)
  const [slugEdited, setSlugEdited] = useState(false)
  const [logoPreview, setLogoPreview] = useState<string>()
  const [logoError, setLogoError] = useState<string>()
  const [error, setError] = useState<string>()
  const [saving, setSaving] = useState(false)

  const valid = useMemo(() => (
    Boolean(values.name.trim() && values.legalName.trim() && values.address.trim()) &&
    isValidUnp(values.unp) && slugPattern.test(values.slug)
  ), [values])

  const update = (field: keyof typeof values, value: string) => {
    setValues((current) => {
      const next = { ...current, [field]: value }
      if (field === 'name' && !slugEdited) next.slug = createSlug(value)
      return next
    })
  }

  const selectLogo = (file?: File) => {
    setLogoError(undefined)
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setLogoError('Поддерживаются файлы PNG, JPG и WEBP.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setLogoError('Размер файла не должен превышать 5 МБ.')
      return
    }
    setLogoPreview(URL.createObjectURL(file))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!valid) return
    setSaving(true)
    setError(undefined)
    try {
      const response = await fetch('/api/v1/admin/tenant/onboarding/step1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, timezone: 'Europe/Minsk' }),
      })
      if (response.status === 409) throw new Error('Этот субдомен уже занят. Выберите другой.')
      if (!response.ok) throw new Error('Не удалось сохранить профиль. Повторите попытку.')
      onComplete?.()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось сохранить профиль.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="min-h-svh bg-bonapp-bg px-6 py-10 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <p className="mb-2 text-sm font-medium text-bonapp-accent">Шаг 1 из 4</p>
        <div className="mb-8 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full w-1/4 bg-bonapp-accent" /></div>
        <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
          <form onSubmit={submit} className="rounded-xl bg-white p-6 shadow-sm">
            <h1 className="mb-6 text-2xl font-semibold">Профиль заведения</h1>
            <div className="grid gap-5">
              <Field label="Название заведения" value={values.name} onChange={(value) => update('name', value)} required />
              <Field label="Субдомен" value={values.slug} onChange={(value) => { setSlugEdited(true); update('slug', value) }} suffix=".bonapp.by" error={values.slug && !slugPattern.test(values.slug) ? 'Используйте 3–50 строчных латинских букв, цифр или дефисов.' : undefined} required />
              <LogoPicker error={logoError} preview={logoPreview} onChange={selectLogo} />
              <Field label="Фирменный цвет" type="color" value={values.color} onChange={(value) => update('color', value)} />
              <Field label="Юридическое название" value={values.legalName} onChange={(value) => update('legalName', value)} required />
              <Field label="УНП" inputMode="numeric" value={values.unp} onChange={(value) => update('unp', value)} error={values.unp && !isValidUnp(values.unp) ? 'УНП должен состоять из 9 цифр.' : undefined} required />
              <Field label="Адрес" value={values.address} onChange={(value) => update('address', value)} required />
            </div>
            {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={!valid || saving} className="mt-7 rounded-xl bg-bonapp-accent px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Сохранение…' : 'Далее'}</button>
          </form>
          <aside className="rounded-xl bg-white p-6 shadow-sm"><p className="mb-4 text-sm font-medium text-slate-500">Превью гостевого меню</p><div className="overflow-hidden rounded-xl border"><div className="p-5 text-white" style={{ backgroundColor: values.color }}>{logoPreview ? <img src={logoPreview} alt="Логотип заведения" className="mb-3 h-12 w-12 rounded-lg object-cover" /> : <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-white/20 font-bold">B</div>}<p className="font-semibold">{values.name || 'Ваше заведение'}</p></div><p className="p-5 text-sm text-slate-500">Меню появится здесь</p></div></aside>
        </div>
      </div>
    </main>
  )
}

function Field({ label, value, onChange, error, suffix, type = 'text', required, inputMode }: { label: string; value: string; onChange: (value: string) => void; error?: string; suffix?: string; type?: string; required?: boolean; inputMode?: 'numeric' }) {
  const id = label.replaceAll(' ', '-')
  return <label htmlFor={id} className="grid gap-1 text-sm font-medium">{label}<span className="flex"><input aria-label={label} id={id} type={type} inputMode={inputMode} value={value} onChange={(event) => onChange(event.target.value)} required={required} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2" />{suffix && <span className="rounded-r-lg border border-l-0 border-slate-300 px-3 py-2 text-slate-500">{suffix}</span>}</span>{error && <span className="font-normal text-red-700">{error}</span>}</label>
}

function LogoPicker({ error, preview, onChange }: { error?: string; preview?: string; onChange: (file?: File) => void }) {
  return <label className="grid gap-1 text-sm font-medium">Логотип <span className="font-normal text-slate-500">(необязательно)</span><input aria-label="Логотип" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => onChange(event.target.files?.[0])} className="rounded-lg border border-slate-300 px-3 py-2" />{preview && <span className="font-normal text-green-700">Файл выбран и будет загружен при сохранении.</span>}{error && <span className="font-normal text-red-700">{error}</span>}</label>
}
