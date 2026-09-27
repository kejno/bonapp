import { useEffect, useState } from 'react';
import { useAuthStore } from '../auth/auth.store';

type TenantSettings = {
  name: string; slug: string; address: string | null; unp: string | null;
  legalName: string | null; logoUrl: string | null; brandColor: string;
  serviceMode: 'ORDER_AND_PAY' | 'VIEW_ONLY' | 'TAKEAWAY';
};
const API = '/api/v1/admin/tenant';
const initial: TenantSettings = { name: '', slug: '', address: '', unp: '', legalName: '', logoUrl: null, brandColor: '#e0533c', serviceMode: 'ORDER_AND_PAY' };

export default function SettingsPage() {
  const token = useAuthStore((state) => state.accessToken);
  const [settings, setSettings] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [logoError, setLogoError] = useState('');
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  useEffect(() => {
    fetch(`${API}/settings`, { headers })
      .then(async (response) => { if (!response.ok) throw new Error('Не удалось загрузить настройки'); return response.json() as Promise<TenantSettings>; })
      .then(setSettings).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Не удалось загрузить настройки'))
      .finally(() => setLoading(false));
  }, [token]);

  const update = <K extends keyof TenantSettings>(key: K, value: TenantSettings[K]) => setSettings((current) => ({ ...current, [key]: value }));
  const uploadLogo = async (file?: File) => {
    setLogoError('');
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setLogoError('Выберите JPEG, PNG, WebP или SVG размером до 2 МБ'); return;
    }
    const body = new FormData(); body.append('logo', file);
    try {
      const response = await fetch(`${API}/logo`, { method: 'POST', headers, body });
      if (!response.ok) throw new Error('Не удалось загрузить логотип');
      const result = await response.json() as { logoUrl: string };
      update('logoUrl', result.logoUrl);
    } catch (cause) { setLogoError(cause instanceof Error ? cause.message : 'Не удалось загрузить логотип'); }
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true); setError(''); setToast('');
    try {
      const response = await fetch(`${API}/settings`, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: settings.name, address: settings.address || null, unp: settings.unp || null, legalName: settings.legalName || null, logoUrl: settings.logoUrl, brandColor: settings.brandColor, serviceMode: settings.serviceMode }) });
      if (!response.ok) throw new Error('Не удалось сохранить настройки');
      setSettings(await response.json() as TenantSettings); setToast('Настройки сохранены');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось сохранить настройки'); }
    finally { setSaving(false); }
  };

  if (loading) return <main className="mx-auto max-w-5xl p-8">Загружаем настройки…</main>;
  return <main className="mx-auto max-w-5xl space-y-6 p-6 text-on-background">
    <header><h1 className="text-2xl font-semibold">Настройки заведения</h1><p className="text-sm opacity-70">Профиль, брендинг и обслуживание гостей</p></header>
    <form onSubmit={save} className="space-y-5">
      <section className="rounded-xl bg-white p-5 shadow-sm"><h2 className="mb-4 text-lg font-semibold">Профиль</h2><div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm">Название<input required value={settings.name} onChange={(e) => update('name', e.target.value)} className="w-full rounded-lg border p-2" /></label>
        <label className="space-y-1 text-sm">Субдомен<input value={settings.slug} readOnly className="w-full rounded-lg border bg-gray-100 p-2" /><small className="block opacity-60">Изменение субдомена доступно суперадминистратору</small></label>
        <label className="space-y-1 text-sm">Адрес<input value={settings.address ?? ''} onChange={(e) => update('address', e.target.value)} className="w-full rounded-lg border p-2" /></label>
        <label className="space-y-1 text-sm">УНП<input value={settings.unp ?? ''} onChange={(e) => update('unp', e.target.value)} className="w-full rounded-lg border p-2" /></label>
      </div></section>
      <section className="rounded-xl bg-white p-5 shadow-sm"><h2 className="mb-4 text-lg font-semibold">Брендинг</h2><div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4"><label className="block space-y-2 text-sm">Логотип<input type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml" onChange={(e) => void uploadLogo(e.target.files?.[0])} className="block w-full" />{logoError && <span role="alert" className="text-red-700">{logoError}</span>}</label>
          <label className="flex items-center gap-3 text-sm">Цвет бренда<input aria-label="Цвет бренда" type="color" value={settings.brandColor} onChange={(e) => update('brandColor', e.target.value)} /></label></div>
        <div aria-label="Предпросмотр меню" className="max-w-xs rounded-2xl border-2 bg-[#faf8f5] p-4" style={{ borderColor: settings.brandColor }}><div className="flex items-center gap-3">{settings.logoUrl && <img src={settings.logoUrl} alt="Логотип" className="h-10 w-10 rounded-full object-contain" />}<strong>{settings.name || 'Ваше заведение'}</strong></div><p className="my-4 text-sm">Меню · Популярное</p><div className="rounded-xl bg-white p-3"><b>Авторское блюдо</b><p className="text-sm opacity-60">Описание блюда</p><button type="button" className="mt-2 rounded-lg px-3 py-1 text-sm text-white" style={{ backgroundColor: settings.brandColor }}>Добавить</button></div></div>
      </div></section>
      <section className="rounded-xl bg-white p-5 shadow-sm"><h2 className="mb-4 text-lg font-semibold">Режим</h2><label className="block max-w-md space-y-1 text-sm">Режим обслуживания<select value={settings.serviceMode} onChange={(e) => update('serviceMode', e.target.value as TenantSettings['serviceMode'])} className="w-full rounded-lg border bg-white p-2"><option value="ORDER_AND_PAY">Заказ и оплата</option><option value="VIEW_ONLY">Только просмотр</option><option value="TAKEAWAY">Самовывоз</option></select></label></section>
      <section className="rounded-xl bg-white p-5 shadow-sm"><h2 className="mb-4 text-lg font-semibold">Реквизиты</h2><label className="block max-w-md space-y-1 text-sm">Юридическое название для чека<input value={settings.legalName ?? ''} onChange={(e) => update('legalName', e.target.value)} className="w-full rounded-lg border p-2" /></label></section>
      {error && <p role="alert" className="text-red-700">{error}</p>}{toast && <p role="status" className="text-green-700">{toast}</p>}
      <button disabled={saving} className="rounded-lg bg-primary px-5 py-2.5 font-semibold text-on-primary disabled:opacity-50">{saving ? 'Сохраняем…' : 'Сохранить'}</button>
    </form>
  </main>;
}
