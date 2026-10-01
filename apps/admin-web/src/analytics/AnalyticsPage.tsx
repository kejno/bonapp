import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { exportTransactions, getPaymentsSplit, getRevenue, getShiftReport, getTips } from './analytics.api';

type RangePreset = 'today' | 'week' | 'month' | 'custom';
const names = { OPLATI_QR: 'Оплати™', ERIP_EPOS: 'ЕРИП', BANK_CARD: 'Карты', CASH_TO_WAITER: 'Наличные' } as const;
const colors = ['#e0533c', '#f2a65a', '#5875d8', '#54a88b'];
const money = (value: number) => `${value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} BYN`;
const day = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
export const rangeFor = (preset: RangePreset, customFrom: string, customTo: string, now = new Date()) => {
  const toDay = preset === 'custom' ? customTo : day(now);
  const start = new Date(`${toDay}T00:00:00Z`);
  if (preset === 'week') start.setUTCDate(start.getUTCDate() - 6);
  if (preset === 'month') start.setUTCDate(start.getUTCDate() - 29);
  const fromDay = preset === 'custom' ? customFrom : start.toISOString().slice(0, 10);
  const days = Math.max(1, Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / 86_400_000) + 1);
  return { from: fromDay, to: toDay, days };
};

export default function AnalyticsPage() {
  const today = day(new Date());
  const [preset, setPreset] = useState<RangePreset>('today');
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const range = useMemo(() => rangeFor(preset, customFrom, customTo), [preset, customFrom, customTo]);
  const granularity = range.days <= 1 ? 'hour' : range.days <= 31 ? 'day' : 'week';
  const queryKey = [range.from, range.to];
  const revenue = useQuery({ queryKey: ['analytics', 'revenue', ...queryKey, granularity], queryFn: () => getRevenue(range.from, range.to, granularity) });
  const split = useQuery({ queryKey: ['analytics', 'payments', ...queryKey], queryFn: () => getPaymentsSplit(range.from, range.to) });
  const tips = useQuery({ queryKey: ['analytics', 'tips', ...queryKey], queryFn: () => getTips(range.from, range.to) });
  const shift = useQuery({ queryKey: ['analytics', 'shift-report'], queryFn: getShiftReport });
  const chartData = revenue.data?.map((point) => ({ ...point, label: granularity === 'hour' ? `${point.period.slice(11, 13)}:00` : point.period.slice(5) })) ?? [];
  const visibleSplit = (split.data ?? []).filter((item) => item.amountByn > 0);
  const splitTotal = visibleSplit.reduce((total, item) => total + item.amountByn, 0);

  return <main className="min-h-svh bg-background p-6 text-on-background md:p-10"><div className="mx-auto max-w-6xl">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-3xl font-semibold">Аналитика и выручка</h1><p className="mt-1 text-sm text-on-background/60">Показатели ресторана за выбранный период</p></div><button onClick={() => void exportTransactions(range.from, range.to)} className="rounded-xl bg-primary px-4 py-2 font-medium text-on-primary">Скачать CSV</button></header>
    <section className="mt-6 flex flex-wrap items-center gap-2" aria-label="Период аналитики">{([['today', 'Сегодня'], ['week', 'Неделя'], ['month', 'Месяц'], ['custom', 'Произвольный']] as const).map(([value, label]) => <button key={value} aria-pressed={preset === value} onClick={() => setPreset(value)} className={`rounded-lg px-4 py-2 text-sm ${preset === value ? 'bg-primary text-on-primary' : 'border border-outline-variant bg-surface-card'}`}>{label}</button>)}{preset === 'custom' && <><label className="sr-only" htmlFor="analytics-from">С даты</label><input id="analytics-from" type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} className="rounded-lg border p-2"/><label className="sr-only" htmlFor="analytics-to">По дату</label><input id="analytics-to" type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} className="rounded-lg border p-2"/></>}</section>
    <section className="mt-6 rounded-2xl border border-outline-variant bg-surface-card p-5"><h2 className="font-semibold">Выручка по {granularity === 'hour' ? 'часам' : granularity === 'day' ? 'дням' : 'неделям'}</h2>{revenue.isPending ? <p className="p-8 text-center">Загружаем данные…</p> : revenue.isError ? <p role="alert" className="p-8 text-center">Не удалось загрузить выручку</p> : chartData.length ? <div className="mt-4 h-72"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="label"/><YAxis/><Tooltip formatter={(value) => money(Number(value))}/><Area type="monotone" dataKey="revenueByn" name="Выручка" stroke="#e0533c" fill="#e0533c" fillOpacity={0.2}/></AreaChart></ResponsiveContainer></div> : <p className="p-8 text-center text-on-background/60">За этот период продаж нет</p>}</section>
    <div className="mt-6 grid gap-6 lg:grid-cols-2"><section className="rounded-2xl border border-outline-variant bg-surface-card p-5"><h2 className="font-semibold">Оплаты по каналам</h2>{split.isPending ? <p className="mt-5">Загружаем данные…</p> : split.isError ? <p role="alert" className="mt-5 text-error">Не удалось загрузить оплаты</p> : visibleSplit.length ? <div className="flex flex-wrap items-center gap-5"> <div className="h-56 min-w-56 flex-1"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={visibleSplit} dataKey="amountByn" nameKey="method" outerRadius={85}>{visibleSplit.map((item) => <Cell key={item.method} fill={colors[(split.data ?? []).indexOf(item)]}/>)}</Pie><Tooltip formatter={(value) => money(Number(value))} /></PieChart></ResponsiveContainer></div><ul className="space-y-3">{visibleSplit.map((item) => <li key={item.method} className="flex min-w-44 justify-between gap-3"><span>{names[item.method]} · {splitTotal ? Math.round(item.amountByn / splitTotal * 100) : 0}%</span><strong>{money(item.amountByn)}</strong></li>)}</ul></div> : <p className="mt-5 text-sm text-on-background/60">Нет данных по оплатам</p>}</section>
    <section className="rounded-2xl border border-outline-variant bg-surface-card p-5"><h2 className="font-semibold">Чаевые официантам</h2><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="py-2">Официант</th><th className="py-2">Столов</th><th className="py-2 text-right">Чаевые</th></tr></thead><tbody>{(tips.data ?? []).map((row) => <tr key={row.waiterName} className="border-b last:border-0"><td className="py-3">{row.waiterName}</td><td className="py-3">{row.transactionsCount}</td><td className="py-3 text-right">{money(row.tipsByn)}</td></tr>)}</tbody></table>{tips.isPending ? <p className="mt-4">Загружаем данные…</p> : tips.isError ? <p role="alert" className="mt-4 text-error">Не удалось загрузить чаевые</p> : !tips.data?.length && <p className="mt-4 text-sm text-on-background/60">Чаевых за период нет</p>}</div></section></div>
    <section className="mt-6 rounded-2xl border border-outline-variant bg-surface-card p-5"><h2 className="font-semibold">Z-отчёт: {shift.data?.closedAt ? 'последняя завершённая смена' : shift.data ? 'текущая смена' : 'смены не найдены'}</h2>{shift.data && <><p className="mt-2 text-sm text-on-background/60">Начало: {new Date(shift.data.openedAt).toLocaleString('ru-RU')}{shift.data.closedAt ? ` · Закрыта: ${new Date(shift.data.closedAt).toLocaleString('ru-RU')}` : ' · Открыта'}</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><p>Чеков: <strong>{shift.data.ordersCount}</strong></p><p>Выручка: <strong>{money(shift.data.revenueByn)}</strong></p><p>Возвраты: <strong>{money(shift.data.refundsByn)}</strong></p><p>Номер Z-отчёта: <strong>{shift.data.zReportNumber ?? '—'}</strong></p></div><ul className="mt-3 flex flex-wrap gap-4 text-sm">{shift.data.payments.map((item) => <li key={item.method}>{names[item.method]}: {money(item.amountByn)}</li>)}</ul></>}{shift.isError && <p role="alert" className="mt-3 text-error">Не удалось загрузить отчёт смены</p>}{!shift.data && !shift.isPending && <p className="mt-3 text-sm text-on-background/60">Смены не найдены</p>}</section>
  </div></main>;
}
