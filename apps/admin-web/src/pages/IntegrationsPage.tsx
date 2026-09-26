import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuthStore } from '../auth/auth.store';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';
const providers = [
  { id: 'iiko', name: 'iiko Cloud', fields: [['apiUrl', 'Адрес API'], ['apiKey', 'API-ключ', true], ['organizationId', 'ID организации'], ['terminalGroupId', 'ID группы терминалов']], sync: true },
  { id: 'r_keeper', name: 'r_keeper', fields: [['apiUrl', 'Адрес API'], ['apiKey', 'API-ключ', true], ['restaurantId', 'ID ресторана']], sync: true },
  { id: 'oplati', name: 'Оплати™', fields: [['merchantId', 'Merchant ID'], ['apiKey', 'API-ключ', true]] },
  { id: 'erip', name: 'ЕРИП E-POS', fields: [['serviceId', 'Service ID']] },
  { id: 'bePaid', name: 'bePaid', fields: [['shopId', 'Shop ID'], ['mode', 'Режим (Test/Prod)'], ['secretKey', 'Секретный ключ', true]] },
  { id: 'skno', name: 'СКНО «Титан-Плюс»', fields: [['serialNumber', 'Серийный номер'], ['host', 'Адрес кассы'], ['port', 'Порт']] },
] as const;
type ProviderId = (typeof providers)[number]['id'];
type Card = { status: string; pingMs: number | null; settings: Record<string, string | boolean | null> };
type StatusResponse = { integrations: Record<ProviderId, Card> };

async function request<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.message === 'string' ? body.message : 'Не удалось выполнить запрос');
  return body as T;
}

const statusLabels: Record<string, string> = {
  Online: 'В сети', Offline: 'Не в сети', ConnectionFailed: 'Ошибка соединения',
  Active: 'Активна', NotConfigured: 'Не настроена',
};

export default function IntegrationsPage() {
  const token = useAuthStore((state) => state.accessToken);
  const client = useQueryClient();
  const [editing, setEditing] = useState<ProviderId | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [dialogError, setDialogError] = useState('');
  const [notice, setNotice] = useState('');
  const status = useQuery({ queryKey: ['integrations-status'], queryFn: () => request<StatusResponse>(token!, '/admin/integrations/status'), enabled: Boolean(token), refetchOnWindowFocus: true });
  const save = useMutation({
    mutationFn: () => request(token!, '/admin/tenant/settings', { method: 'PUT', body: JSON.stringify({ provider: editing, settings: values }) }),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ['integrations-status'] }); setEditing(null); setNotice('Настройки сохранены'); },
    onError: (error: Error) => setDialogError(error.message),
  });
  const sync = useMutation({
    mutationFn: (provider: ProviderId) => request(token!, `/admin/integrations/${provider}/sync`, { method: 'POST' }),
    onSuccess: () => setNotice('Синхронизация запущена'),
    onError: (error: Error) => setNotice(`Ошибка синхронизации: ${error.message}`),
  });
  const openEditor = (provider: ProviderId) => {
    const card = status.data?.integrations[provider];
    const config = providers.find((item) => item.id === provider)!;
    setEditing(provider);
    setDialogError('');
    setValues(Object.fromEntries(config.fields.map(([key]) => [key, typeof card?.settings[key] === 'string' ? card.settings[key] as string : ''])));
  };
  const selectedProvider = providers.find((provider) => provider.id === editing);
  const editingConfigured = editing ? status.data?.integrations[editing].status !== 'NotConfigured' : false;

  return <main className="min-h-svh bg-background text-on-background">
    <header className="flex h-16 items-center justify-between border-b border-outline-variant/40 bg-surface-card px-8"><div className="font-semibold">Bonapp <span className="ml-2 text-on-background/50">/ Интеграции</span></div><button className="rounded-lg border px-4 py-2 text-sm" onClick={() => void status.refetch()}>Обновить статусы</button></header>
    <section className="mx-auto max-w-7xl px-8 py-8"><div className="mb-6"><h1 className="text-2xl font-semibold">Интеграции и шлюзы</h1><p className="mt-1 text-sm text-on-background/60">Подключения POS, платежей и кассового оборудования</p></div>
      {status.isLoading ? <p>Загрузка статусов…</p> : status.isError ? <p role="alert" className="text-red-600">Не удалось загрузить статусы интеграций</p> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{providers.map((provider) => {
        const card = status.data!.integrations[provider.id];
        const configured = card.status !== 'NotConfigured';
        return <article key={provider.id} className="rounded-xl border border-outline-variant/50 bg-surface-card p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><h2 className="text-lg font-semibold">{provider.name}</h2><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${card.status === 'Online' || card.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>{statusLabels[card.status] ?? card.status}</span></div>
          <dl className="mt-4 space-y-2 text-sm">{provider.fields.filter(([key]) => !['apiKey', 'apiSecret', 'password', 'token', 'secret', 'secretKey'].includes(key)).map(([key, label]) => <div key={key} className="flex justify-between gap-3"><dt className="text-on-background/60">{label}</dt><dd className="max-w-[60%] truncate">{card.settings[key] || '—'}</dd></div>)}{'sync' in provider && <div className="flex justify-between"><dt className="text-on-background/60">Ping</dt><dd>{card.pingMs === null ? '—' : `${card.pingMs} мс`}</dd></div>}</dl>
          <div className="mt-5 flex flex-wrap gap-2"><button className="rounded-lg border px-3 py-2 text-sm" onClick={() => openEditor(provider.id)}>{configured ? 'Редактировать' : 'Настроить'}</button>{'sync' in provider && configured && <button disabled={card.status !== 'Online' || sync.isPending} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-on-primary disabled:opacity-50" onClick={() => sync.mutate(provider.id)}>{sync.isPending ? 'Синхронизация…' : 'Синхронизировать меню'}</button>}</div>
        </article>;
      })}</div>}
    </section>
    {notice && <div role="status" className="fixed bottom-5 right-5 rounded-lg bg-surface-card px-4 py-3 shadow-lg">{notice}<button className="ml-3" aria-label="Закрыть уведомление" onClick={() => setNotice('')}>×</button></div>}
    <Dialog open={editing !== null} onOpenChange={(open) => { if (!open && !save.isPending) { setEditing(null); setDialogError(''); } }}><DialogContent className="max-w-xl"><header className="mb-5 flex items-center justify-between"><DialogTitle className="text-xl font-semibold">Настройка: {selectedProvider?.name}</DialogTitle><button aria-label="Закрыть" onClick={() => setEditing(null)}>✕</button></header>
      <form onSubmit={(event) => { event.preventDefault(); setDialogError(''); save.mutate(); }} className="space-y-4">{selectedProvider?.fields.map(([key, label, secret]) => <label key={key} className="block space-y-1 text-sm"><span>{label}</span><input type={secret ? 'password' : 'text'} autoComplete="off" value={values[key] ?? ''} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} required={!secret || !editingConfigured} className="w-full rounded-lg border bg-background px-3 py-2" /></label>)}{dialogError && <p role="alert" className="text-sm text-red-600">{dialogError}</p>}<footer className="flex justify-end gap-3 border-t pt-4"><button type="button" className="rounded-lg border px-4 py-2" onClick={() => setEditing(null)}>Отмена</button><button type="submit" disabled={save.isPending} className="rounded-lg bg-primary px-4 py-2 font-semibold text-on-primary disabled:opacity-50">{save.isPending ? 'Сохранение…' : 'Сохранить'}</button></footer></form>
    </DialogContent></Dialog>
  </main>;
}
