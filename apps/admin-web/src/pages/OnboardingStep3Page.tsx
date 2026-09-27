import { useEffect, useState, type FormEvent } from 'react';
import { useAuthStore } from '../auth/auth.store';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';
type Gateway = 'oplati' | 'erip' | 'bepaid' | 'skno';
type Statuses = Record<Gateway, boolean>;

export default function OnboardingStep3Page() {
  const token = useAuthStore((state) => state.accessToken);
  const [statuses, setStatuses] = useState<Statuses>({
    oplati: false,
    erip: false,
    bepaid: false,
    skno: false,
  });
  const [values, setValues] = useState<Record<string, string>>({
    gateway: 'oplati',
    provider: 'bepaid',
    environment: 'TEST',
  });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const update = (name: string, value: string) =>
    setValues((current) => ({ ...current, [name]: value }));

  useEffect(() => {
    fetch(`${API}/admin/tenant/onboarding/step3/payments`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) =>
        response.ok ? (response.json() as Promise<Statuses>) : Promise.reject(),
      )
      .then(setStatuses)
      .catch(() => setMessage('Не удалось загрузить статусы шлюзов'));
  }, [token]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(
        `${API}/admin/tenant/onboarding/step3/payments`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ...values, gateway: values.gateway }),
        },
      );
      const body = (await response.json()) as Statuses | { message?: string };
      if (!response.ok)
        throw new Error(
          'message' in body && body.message
            ? body.message
            : 'Не удалось сохранить реквизиты',
        );
      setStatuses(body as Statuses);
      setMessage('Реквизиты сохранены');
      setValues((current) =>
        Object.fromEntries(
          Object.entries(current).map(([key, value]) =>
            [
              'secret',
              'merchantId',
              'serviceId',
              'shopId',
              'cashRegisterSerial',
              'unp',
            ].includes(key)
              ? [key, '']
              : [key, value],
          ),
        ),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Ошибка сохранения');
    } finally {
      setBusy(false);
    }
  };

  const gateway = values.gateway as Gateway;
  const field = (name: string, label: string, type = 'text') => (
    <label className="block space-y-1 text-sm">
      {label}
      <input
        required
        type={type}
        value={values[name] ?? ''}
        onChange={(event) => update(name, event.target.value)}
        className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2"
        autoComplete={type === 'password' ? 'new-password' : 'off'}
      />
    </label>
  );
  const card = (id: Gateway, name: string) => (
    <li
      key={id}
      className="flex justify-between rounded-xl border border-stone-200 bg-white p-4"
    >
      <span>{name}</span>
      <span>{statuses[id] ? 'Подключено' : 'Не подключено'}</span>
    </li>
  );

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6 text-stone-900">
      <header>
        <p className="text-sm text-stone-500">Онбординг · Шаг 3 из 3</p>
        <h1 className="mt-1 text-2xl font-semibold">
          Подключение платёжных шлюзов
        </h1>
        <p className="mt-2 text-stone-600">
          Без подключённых шлюзов доступна оплата официанту.
        </p>
      </header>
      <ul className="grid gap-3 sm:grid-cols-2">
        {card('oplati', 'Оплати™ QR · комиссия 0,8%')}
        {card('erip', 'ЕРИП E-POS')}
        {card('bepaid', 'bePaid / Webpay')}
        {card('skno', 'СКНО «Титан-Плюс»')}
      </ul>
      <form
        onSubmit={submit}
        className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5"
      >
        <label className="block space-y-1 text-sm">
          Платёжный шлюз
          <select
            value={gateway}
            onChange={(event) => update('gateway', event.target.value)}
            className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2"
          >
            <option value="oplati">Оплати™ QR</option>
            <option value="erip">ЕРИП E-POS</option>
            <option value="bepaid">bePaid / Webpay</option>
            <option value="skno">СКНО «Титан-Плюс»</option>
          </select>
        </label>
        {gateway === 'oplati' && field('merchantId', 'Merchant ID')}
        {gateway === 'erip' && (
          <>
            {field('serviceId', 'Service ID')}
            {field('secret', 'Секрет', 'password')}
          </>
        )}
        {gateway === 'bepaid' && (
          <>
            <label className="block space-y-1 text-sm">
              Провайдер
              <select
                value={values.provider}
                onChange={(event) => update('provider', event.target.value)}
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2"
              >
                <option value="bepaid">bePaid</option>
                <option value="webpay">Webpay</option>
              </select>
            </label>
            {field('shopId', 'Shop ID')}
            {field('secret', 'Секрет', 'password')}
            <label className="block space-y-1 text-sm">
              Среда
              <select
                value={values.environment}
                onChange={(event) => update('environment', event.target.value)}
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2"
              >
                <option value="TEST">TEST</option>
                <option value="PROD">PROD</option>
              </select>
            </label>
          </>
        )}
        {gateway === 'skno' && (
          <>
            {field('cashRegisterSerial', 'Серийный номер кассы')}
            {field('unp', 'УНП')}
          </>
        )}
        <div className="flex items-center gap-3">
          <button
            disabled={busy}
            className="rounded-xl bg-primary px-4 py-2 font-medium text-white disabled:opacity-50"
          >
            {busy ? 'Сохранение…' : 'Сохранить шлюз'}
          </button>
          <a href="/dashboard" className="rounded-xl px-4 py-2 text-stone-600">
            Пропустить
          </a>
        </div>
        {message && (
          <p role="status" className="text-sm text-stone-600">
            {message}
          </p>
        )}
      </form>
    </main>
  );
}
