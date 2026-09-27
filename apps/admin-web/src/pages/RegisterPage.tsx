import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../auth/auth.store'
import type { AuthUser } from '../auth/auth.types'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1'

export default function RegisterPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((state) => state.setAuth)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')
    const form = new FormData(event.currentTarget)
    try {
      const response = await fetch(`${API_BASE}/public/tenants/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.get('name'), email: form.get('email'), phone: form.get('phone'), venueType: form.get('venueType') }),
      })
      const body = await response.json() as { message?: string; accessToken?: string; user?: AuthUser }
      if (!response.ok || !body.accessToken || !body.user) throw new Error(body.message ?? 'Не удалось создать аккаунт')
      setAuth(body.accessToken, body.user)
      navigate('/onboarding')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Ошибка регистрации')
    } finally {
      setLoading(false)
    }
  }

  return <main className="min-h-svh bg-background px-4 py-10 text-on-background sm:py-16">
    <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
      <section className="space-y-5">
        <a href="/login" className="font-sans text-xl font-bold">Bonapp</a>
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">Управление заведением без лишних забот</p>
        <h1 className="max-w-xl font-sans text-4xl font-bold leading-tight sm:text-5xl">Ваше заведение — в Bonapp. Начните бесплатно.</h1>
        <p className="max-w-lg text-lg text-on-surface-variant">Меню, заказы и работа команды в одной платформе. Попробуйте все возможности в течение 14 дней.</p>
        <ul className="space-y-2 text-sm text-on-surface-variant"><li>✓ Быстрый запуск цифрового меню</li><li>✓ Удобная работа с заказами</li><li>✓ Никаких платежных данных при регистрации</li></ul>
      </section>
      <section className="rounded-xl border border-outline-variant/40 bg-surface-card p-6 shadow-sm sm:p-8">
        <h2 className="font-sans text-2xl font-semibold">Создайте аккаунт</h2>
        <p className="mb-6 mt-2 text-sm text-on-surface-variant">14 дней бесплатно. Настроить заведение можно сразу после регистрации.</p>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Название заведения" name="name" placeholder="Например, Пиноккио" required />
          <Field label="Email" name="email" type="email" placeholder="you@example.com" autoComplete="email" required />
          <Field label="Телефон" name="phone" type="tel" placeholder="+375291234567" pattern="\+375(25|29|33|44)\d{7}" autoComplete="tel" required />
          <label className="block text-sm font-medium">Тип заведения<select aria-label="Тип заведения" name="venueType" required defaultValue="" className="mt-1.5 w-full rounded-lg border border-outline-variant bg-surface px-3.5 py-2.5"><option value="" disabled>Выберите тип</option><option value="RESTAURANT">Ресторан</option><option value="CAFE">Кафе</option><option value="BAR">Бар</option></select></label>
          {error && <p role="alert" className="rounded-lg bg-error-container p-3 text-sm text-on-error-container">{error}</p>}
          <button disabled={loading} className="w-full rounded-lg bg-primary px-4 py-3 font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-50">{loading ? 'Создаём аккаунт…' : 'Начать 14-дневный триал'}</button>
          <p className="text-center text-xs text-on-surface-variant">Продолжая, вы соглашаетесь с условиями использования.</p>
        </form>
      </section>
    </div>
  </main>
}

function Field(props: { label: string; name: string; type?: string; placeholder: string; autoComplete?: string; pattern?: string; required?: boolean }) {
  return <label className="block text-sm font-medium">{props.label}<input name={props.name} type={props.type ?? 'text'} placeholder={props.placeholder} autoComplete={props.autoComplete} pattern={props.pattern} required={props.required} className="mt-1.5 w-full rounded-lg border border-outline-variant bg-surface px-3.5 py-2.5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/30" /></label>
}
