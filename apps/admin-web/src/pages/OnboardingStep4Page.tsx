import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { createArea, createTablesBulk, generateQrPdf, getAreas, getTableQrPreview, type DiningTable } from '../tables/tables.api';

export default function OnboardingStep4Page() {
  const client = useQueryClient();
  const areas = useQuery({ queryKey: ['dining-areas'], queryFn: getAreas });
  const [activeAreaId, setActiveAreaId] = useState('');
  const [sessionTables, setSessionTables] = useState<DiningTable[]>([]);
  const [error, setError] = useState('');
  const preview = useQuery({
    queryKey: ['onboarding-table-qr', sessionTables[0]?.id],
    queryFn: () => getTableQrPreview(sessionTables[0]!.id),
    enabled: sessionTables.length > 0,
  });
  const areaMutation = useMutation({
    mutationFn: createArea,
    onSuccess: async (area) => { await client.invalidateQueries({ queryKey: ['dining-areas'] }); setActiveAreaId(area.id); },
    onError: (cause) => setError(cause instanceof Error ? cause.message : 'Не удалось создать зону'),
  });
  const tablesMutation = useMutation({
    mutationFn: createTablesBulk,
    onSuccess: (tables) => { setSessionTables((current) => [...current, ...tables]); void client.invalidateQueries({ queryKey: ['dining-tables'] }); setError(''); },
    onError: (cause) => setError(cause instanceof Error ? cause.message : 'Не удалось создать столы'),
  });

  function addArea(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get('areaName') ?? '').trim();
    if (name) areaMutation.mutate(name);
    event.currentTarget.reset();
  }

  function addTables(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    tablesMutation.mutate({ areaId: String(data.get('areaId')), seatsCount: Number(data.get('seatsCount')), startNumber: Number(data.get('startNumber')), count: Number(data.get('count')) });
  }

  async function downloadPdf() {
    try {
      const blob = await generateQrPdf(sessionTables.map((table) => table.id));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = 'tables-qr.pdf'; link.click(); URL.revokeObjectURL(url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось подготовить PDF'); }
  }

  return <main className="mx-auto min-h-svh max-w-4xl space-y-8 bg-background px-6 py-10 text-on-background">
    <header><p className="text-sm text-primary">Онбординг · Шаг 4 из 4</p><h1 className="mt-2 text-3xl font-semibold">Схема зала и QR-коды</h1><p className="mt-2 text-on-background/60">Создайте зоны и добавьте первые столы для гостей.</p></header>
    <section className="rounded-2xl border border-outline-variant bg-surface p-6"><h2 className="text-xl font-semibold">1. Зоны зала</h2>
      {areas.isLoading ? <p className="mt-3">Загрузка зон…</p> : <ul className="mt-3 flex flex-wrap gap-2">{(areas.data ?? []).map((area) => <li key={area.id}><button type="button" onClick={() => setActiveAreaId(area.id)} aria-pressed={activeAreaId === area.id} className="rounded-lg border border-outline-variant px-3 py-2 aria-pressed:bg-primary aria-pressed:text-on-primary">{area.name}</button></li>)}</ul>}
      <form onSubmit={addArea} className="mt-4 flex gap-2"><input name="areaName" required maxLength={100} placeholder="Например, Основной зал" aria-label="Название зоны" className="min-w-0 flex-1 rounded-lg border border-outline-variant bg-background px-3 py-2" /><button className="rounded-lg border border-outline-variant px-4 py-2" disabled={areaMutation.isPending}>Добавить зону</button></form>
    </section>
    <section className="rounded-2xl border border-outline-variant bg-surface p-6"><h2 className="text-xl font-semibold">2. Первые столы</h2>
      <form onSubmit={addTables} className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-sm">Зона<select name="areaId" required value={activeAreaId} onChange={(event) => setActiveAreaId(event.target.value)} className="mt-1 w-full rounded-lg border border-outline-variant bg-background px-3 py-2"><option value="">Выберите зону</option>{(areas.data ?? []).map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
        <label className="text-sm">Количество мест<input name="seatsCount" type="number" min="1" max="100" defaultValue="2" required className="mt-1 w-full rounded-lg border border-outline-variant bg-background px-3 py-2" /></label>
        <label className="text-sm">Первый номер стола<input name="startNumber" type="number" min="1" required defaultValue="1" className="mt-1 w-full rounded-lg border border-outline-variant bg-background px-3 py-2" /></label>
        <label className="text-sm">Количество столов<input name="count" type="number" min="1" max="100" required defaultValue="5" className="mt-1 w-full rounded-lg border border-outline-variant bg-background px-3 py-2" /></label>
        <button className="rounded-lg bg-primary px-4 py-2 font-semibold text-on-primary sm:col-span-2" disabled={tablesMutation.isPending || !activeAreaId}>Добавить столы</button>
      </form>
      {sessionTables.length > 0 && <p className="mt-4 text-sm">В этом сеансе создано столов: {sessionTables.length} ({sessionTables.map((table) => table.tableNumber).join(', ')})</p>}
    </section>
    {sessionTables.length > 0 && <section className="rounded-2xl border border-outline-variant bg-surface p-6"><h2 className="text-xl font-semibold">Предпросмотр тейбл-тента</h2>{preview.data ? <div className="mt-4 flex max-w-sm items-center gap-4 rounded-xl border border-outline-variant p-4"><img src={preview.data.qrDataUrl} alt={`QR-код стола ${preview.data.tableNumber}`} className="h-32 w-32" /><div><p className="font-semibold">{preview.data.restaurantName}</p><p>Стол {preview.data.tableNumber}</p></div></div> : <p className="mt-3">Загрузка QR-кода…</p>}<p className="mt-3 text-sm text-on-background/60">В PDF попадут только столы, добавленные в текущем сеансе.</p><button type="button" onClick={() => void downloadPdf()} className="mt-4 rounded-lg border border-outline-variant px-4 py-2">Скачать PDF</button></section>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <footer className="flex justify-end"><Link to="/dashboard" className="rounded-lg bg-primary px-5 py-3 font-semibold text-on-primary">Завершить онбординг</Link></footer>
  </main>;
}
