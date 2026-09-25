import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createTable, generateQrPdf, getAreas, getTables, updateTable } from '../tables/tables.api';
import type { DiningTable, TableInput } from '../tables/tables.api';

const STATUS: Record<string, { label: string; color: string }> = {
  AVAILABLE: { label: 'Свободен', color: 'FREE' },
  FREE: { label: 'Свободен', color: 'FREE' },
  OCCUPIED: { label: 'Занят', color: 'OCCUPIED' },
  BILL_REQUESTED: { label: 'Запрошен счёт', color: 'BILL_REQUESTED' },
};

type FormMode = 'create' | 'edit';

export default function TablesPage() {
  const queryClient = useQueryClient();
  const areasQuery = useQuery({ queryKey: ['dining-areas'], queryFn: getAreas });
  const tablesQuery = useQuery({ queryKey: ['dining-tables'], queryFn: getTables, refetchInterval: 5000 });
  const [areaId, setAreaId] = useState('');
  const [selectedTable, setSelectedTable] = useState<DiningTable | null>(null);
  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [formTable, setFormTable] = useState<DiningTable | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [printOpen, setPrintOpen] = useState(false);
  const [error, setError] = useState('');
  const areas = areasQuery.data ?? [];
  const activeAreaId = areas.some((area) => area.id === areaId) ? areaId : areas[0]?.id ?? '';
  const tables = tablesQuery.data ?? [];
  const visibleTables = useMemo(() => tables.filter((table) => table.areaId === activeAreaId), [tables, activeAreaId]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['dining-tables'] });
  const saveMutation = useMutation({
    mutationFn: ({ mode, id, input }: { mode: FormMode; id?: string; input: TableInput }) =>
      mode === 'create' ? createTable(input) : updateTable(id!, input),
    onSuccess: () => { void refresh(); setFormMode(null); setFormTable(null); setSelectedTable(null); setError(''); },
    onError: (cause) => setError(cause instanceof Error ? cause.message : 'Не удалось сохранить стол'),
  });
  const printMutation = useMutation({
    mutationFn: generateQrPdf,
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'table-qr-codes.pdf';
      link.click();
      URL.revokeObjectURL(url);
      setPrintOpen(false);
      setSelectedIds([]);
      setError('');
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : 'Не удалось подготовить PDF'),
  });

  function openCreate() {
    setError('');
    setFormTable(null);
    setFormMode('create');
  }

  function submitTable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const label = String(data.get('label') ?? '').trim();
    const input: TableInput = {
      tableNumber: Number(data.get('tableNumber')),
      label: label || (formMode === 'edit' ? null : undefined),
      seatsCount: Number(data.get('seatsCount')),
      areaId: String(data.get('areaId')),
    };
    saveMutation.mutate({ mode: formMode!, id: formTable?.id, input });
  }

  function toggleTable(id: string) {
    setSelectedIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
  }

  function startEdit(table: DiningTable) {
    setFormTable(table);
    setFormMode('edit');
    setSelectedTable(null);
    setError('');
  }

  return (
    <main className="min-h-svh bg-background p-6 text-on-background md:p-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Схема зала</h1>
            <p className="mt-1 text-sm text-on-background/60">Столы и их текущие статусы</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => { setPrintOpen(true); setError(''); }} className="rounded-lg border border-outline-variant px-4 py-2.5 text-sm font-semibold hover:bg-surface-card">Распечатать QR</button>
            <button onClick={openCreate} className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary">+ Добавить стол</button>
          </div>
        </header>

        {error && <p role="alert" className="mt-5 rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">{error}</p>}
        {(areasQuery.isError || tablesQuery.isError) && <p role="alert" className="mt-5 text-sm text-error">Не удалось загрузить столы и зоны. {String(areasQuery.error ?? tablesQuery.error)}</p>}
        {areas.length > 0 && <nav aria-label="Зоны зала" className="mt-8 flex gap-2 border-b border-outline-variant/50">
          {areas.map((area) => <button key={area.id} onClick={() => setAreaId(area.id)} aria-pressed={activeAreaId === area.id} className={`border-b-2 px-4 py-3 text-sm font-medium ${activeAreaId === area.id ? 'border-primary text-primary' : 'border-transparent text-on-background/60'}`}>{area.name}</button>)}
        </nav>}
        <div className="mt-6 flex flex-wrap gap-4 text-xs text-on-background/70">
          <span><i className="mr-2 inline-block size-3 rounded-full bg-emerald-500" />Свободен</span>
          <span><i className="mr-2 inline-block size-3 rounded-full bg-amber-400" />Занят</span>
          <span><i className="mr-2 inline-block size-3 rounded-full bg-red-500" />Запрошен счёт</span>
          <span className="ml-auto">Обновление каждые 5 секунд</span>
        </div>
        {tablesQuery.isPending ? <p className="mt-8 text-sm text-on-background/60">Загружаем столы…</p> :
          visibleTables.length === 0 ? <p className="mt-8 rounded-xl border border-dashed border-outline-variant p-10 text-center text-sm text-on-background/60">В этой зоне пока нет столов</p> :
            <section aria-label="Столы" className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {visibleTables.map((table) => {
                const status = STATUS[table.status] ?? { label: table.status, color: 'UNKNOWN' };
                const statusStyles = status.color === 'FREE'
                  ? 'border-emerald-200 bg-emerald-50'
                  : status.color === 'OCCUPIED'
                    ? 'border-amber-200 bg-amber-50'
                    : status.color === 'BILL_REQUESTED'
                      ? 'border-red-200 bg-red-50'
                      : 'border-slate-300 bg-slate-100';
                const indicatorStyle = status.color === 'FREE'
                  ? 'bg-emerald-500'
                  : status.color === 'OCCUPIED'
                    ? 'bg-amber-400'
                    : status.color === 'BILL_REQUESTED'
                      ? 'bg-red-500'
                      : 'bg-slate-500';
                return <button key={table.id} type="button" data-status={status.color} aria-label={`Стол ${table.tableNumber}, ${status.label}`} onClick={() => setSelectedTable(table)} className={`min-h-36 rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 ${statusStyles}`}>
                  <span className="flex items-center justify-between"><strong className="text-2xl">Стол {table.tableNumber}</strong><i className={`size-3 rounded-full ${indicatorStyle}`} /></span>
                  <span className="mt-2 block text-sm text-on-background/70">{table.label || `${table.seatsCount} места`}</span>
                  <span className="mt-4 block text-xs font-medium">{status.label}</span>
                </button>;
              })}
            </section>}
      </div>

      {selectedTable && <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4" role="presentation" onClick={() => setSelectedTable(null)}>
        <section role="dialog" aria-modal="true" aria-labelledby="table-details-title" onClick={(event) => event.stopPropagation()} className="w-full max-w-md rounded-2xl bg-surface-card p-6 shadow-xl">
          <h2 id="table-details-title" className="text-xl font-semibold">Стол {selectedTable.tableNumber}</h2>
          <dl className="mt-4 space-y-3 text-sm"><div><dt className="text-on-background/60">Метка</dt><dd>{selectedTable.label || '—'}</dd></div><div><dt className="text-on-background/60">Мест</dt><dd>{selectedTable.seatsCount}</dd></div><div><dt className="text-on-background/60">Статус</dt><dd>{STATUS[selectedTable.status]?.label ?? selectedTable.status}</dd></div><div><dt className="text-on-background/60">Текущий заказ</dt><dd>{selectedTable.orders?.[0] ? `Заказ ${selectedTable.orders[0].id} · ${selectedTable.orders[0].status} · ${selectedTable.orders[0].totalAmountByn} BYN` : 'Нет активного заказа'}</dd></div></dl>
          <div className="mt-6 flex flex-wrap justify-end gap-3"><button onClick={() => setSelectedTable(null)} className="rounded-lg border border-outline-variant px-4 py-2 text-sm">Закрыть</button>{selectedTable.orders?.[0] && <Link to={`/orders/${encodeURIComponent(selectedTable.orders[0].id)}`} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary">Открыть заказ</Link>}<button onClick={() => startEdit(selectedTable)} className="rounded-lg border border-outline-variant px-4 py-2 text-sm">Изменить стол</button></div>
        </section>
      </div>}

      {formMode && <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4" role="presentation" onClick={() => setFormMode(null)}>
        <section role="dialog" aria-modal="true" aria-labelledby="table-form-title" onClick={(event) => event.stopPropagation()} className="w-full max-w-md rounded-2xl bg-surface-card p-6 shadow-xl">
          <h2 id="table-form-title" className="text-xl font-semibold">{formMode === 'create' ? 'Добавить стол' : 'Изменить стол'}</h2>
          <form onSubmit={submitTable} className="mt-5 space-y-4">
            <label className="block text-sm">Номер стола<input name="tableNumber" type="number" min="1" required defaultValue={formTable?.tableNumber} className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2" /></label>
            <label className="block text-sm">Метка<input name="label" defaultValue={formTable?.label ?? ''} className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2" /></label>
            <label className="block text-sm">Количество мест<input name="seatsCount" type="number" min="1" required defaultValue={formTable?.seatsCount ?? 2} className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2" /></label>
            <label className="block text-sm">Зона<select name="areaId" required defaultValue={formTable?.areaId ?? activeAreaId} className="mt-1 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2">{areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
            <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={() => setFormMode(null)} className="rounded-lg border border-outline-variant px-4 py-2 text-sm">Отмена</button><button disabled={saveMutation.isPending} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-50">Сохранить</button></div>
          </form>
        </section>
      </div>}

      {printOpen && <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4" role="presentation" onClick={() => setPrintOpen(false)}>
        <section role="dialog" aria-modal="true" aria-labelledby="qr-title" onClick={(event) => event.stopPropagation()} className="w-full max-w-lg rounded-2xl bg-surface-card p-6 shadow-xl">
          <h2 id="qr-title" className="text-xl font-semibold">Печать QR-кодов</h2>
          <p className="mt-1 text-sm text-on-background/60">Выберите столы для PDF. QR ведёт на постоянный адрес стола.</p>
          <div className="mt-4 max-h-64 space-y-2 overflow-auto">{tables.map((table) => <label key={table.id} className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-surface"><input type="checkbox" checked={selectedIds.includes(table.id)} onChange={() => toggleTable(table.id)} />Стол {table.tableNumber} · {areas.find((area) => area.id === table.areaId)?.name ?? 'Зона'}</label>)}</div>
          <div className="mt-6 flex justify-end gap-3"><button onClick={() => setPrintOpen(false)} className="rounded-lg border border-outline-variant px-4 py-2 text-sm">Отмена</button><button disabled={selectedIds.length === 0 || printMutation.isPending} onClick={() => printMutation.mutate(selectedIds)} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-50">{printMutation.isPending ? 'Готовим PDF…' : 'Скачать PDF'}</button></div>
        </section>
      </div>}
    </main>
  );
}
