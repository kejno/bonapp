import { type FormEvent, useState } from 'react'
import { useAuthStore } from '../auth/auth.store'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1'

export default function OnboardingPage() {
  const token = useAuthStore((state) => state.accessToken)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const password = String(data.get('password') ?? '')
    const confirmation = String(data.get('confirmation') ?? '')
    if (password.length < 8) { setMessage('Пароль должен содержать не менее 8 символов'); return }
    if (password !== confirmation) { setMessage('Пароли не совпадают'); return }
    setSaving(true); setMessage('')
    try {
      const response = await fetch(`${API_BASE}/auth/initial-password`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` }, body: JSON.stringify({ password }) })
      const body = await response.json() as { message?: string }
      setMessage(response.ok ? 'Пароль сохранён. Продолжайте настройку заведения.' : body.message ?? 'Не удалось сохранить пароль')
    } catch { setMessage('Не удалось связаться с сервером') } finally { setSaving(false) }
  }
  return <main className="min-h-svh bg-background px-4 py-12 text-on-background"><section className="mx-auto max-w-xl rounded-xl border border-outline-variant/40 bg-surface-card p-8 shadow-sm"><p className="text-sm font-semibold text-primary">Шаг 1 из 1</p><h1 className="mt-2 font-sans text-3xl font-bold">Настройка заведения</h1><p className="mt-3 text-on-surface-variant">Создайте пароль, чтобы завершить настройку аккаунта и входить в Bonapp в дальнейшем.</p><form className="mt-8 space-y-4" onSubmit={savePassword}><label className="block text-sm font-medium">Создайте пароль<input name="password" type="password" autoComplete="new-password" minLength={8} required className="mt-1.5 w-full rounded-lg border border-outline-variant bg-surface px-3.5 py-2.5" /></label><label className="block text-sm font-medium">Повторите пароль<input name="confirmation" type="password" autoComplete="new-password" minLength={8} required className="mt-1.5 w-full rounded-lg border border-outline-variant bg-surface px-3.5 py-2.5" /></label>{message && <p role="status" className="text-sm">{message}</p>}<button disabled={saving || !token} className="w-full rounded-lg bg-primary px-4 py-3 font-semibold text-on-primary disabled:opacity-50">{saving ? 'Сохраняем…' : 'Сохранить пароль'}</button></form></section></main>
}
