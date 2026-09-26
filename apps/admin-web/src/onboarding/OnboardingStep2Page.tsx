import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { checkPos, getImportStatus, retryImport, savePos, startImport } from './onboarding.api';
import { validatePosSettings, type PosType } from './pos-validation';

export default function OnboardingStep2Page() {
  const client = useQueryClient();
  const [posType, setPosType] = useState<PosType>('iiko');
  const [apiKey, setApiKey] = useState('');
  const [url, setUrl] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const status = useQuery({ queryKey: ['onboarding-import'], queryFn: getImportStatus, refetchInterval: (query) => ['queued', 'running'].includes(query.state.data?.status ?? '') ? 1500 : false });
  const settings = () => ({ posType, apiKey, url });
  const check = useMutation({ mutationFn: checkPos, onSuccess: (result) => setMessage(`Соединение установлено · ${result.pingMs} мс · товаров: ${result.productCount}`), onError: (error: Error) => setMessage(error.message) });
  const save = useMutation({ mutationFn: savePos, onSuccess: () => { setMessage(posType === 'none' ? 'Шаг пропущен' : 'Настройки POS сохранены'); void client.invalidateQueries({ queryKey: ['onboarding-import'] }); }, onError: (error: Error) => setMessage(error.message) });
  const runImport = useMutation({ mutationFn: startImport, onSuccess: () => void client.invalidateQueries({ queryKey: ['onboarding-import'] }), onError: (error: Error) => setMessage(error.message) });
  const retry = useMutation({ mutationFn: retryImport, onSuccess: () => void client.invalidateQueries({ queryKey: ['onboarding-import'] }), onError: (error: Error) => setMessage(error.message) });
  const importState = status.data;
  const complete = importState?.status === 'completed';
  const importing = ['queued', 'running'].includes(importState?.status ?? '');
  const submitSettings = () => {
    const validation = validatePosSettings(settings());
    setErrors(validation);
    if (Object.keys(validation).length === 0) save.mutate(settings());
  };

  return <main className="min-h-svh bg-background p-6 text-on-background md:p-10"><section className="mx-auto max-w-2xl rounded-2xl bg-surface-card p-6 shadow-sm md:p-10">
    <p className="text-sm font-semibold text-primary">Шаг 2 из 3</p><h1 className="mt-2 text-3xl font-semibold">Подключение POS-системы</h1><p className="mt-2 text-on-background/60">Подключите кассу, чтобы импортировать меню ресторана.</p>
    <label className="mt-8 block text-sm font-medium">POS-система<select value={posType} onChange={(event) => setPosType(event.target.value as PosType)} className="mt-2 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2"><option value="iiko">iiko Cloud</option><option value="r_keeper">r_keeper</option><option value="none">Без POS</option></select></label>
    {posType !== 'none' && <div className="mt-4 space-y-4"><label className="block text-sm font-medium">URL POS-системы<input value={url} onChange={(event) => setUrl(event.target.value)} type="url" placeholder="https://pos.example.com" className="mt-2 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2" />{errors.url && <span className="text-error">{errors.url}</span>}</label><label className="block text-sm font-medium">API-ключ<input value={apiKey} onChange={(event) => setApiKey(event.target.value)} type="password" autoComplete="new-password" className="mt-2 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2" />{errors.apiKey && <span className="text-error">{errors.apiKey}</span>}</label>
      <div className="flex flex-wrap gap-3"><button onClick={() => { const validation = validatePosSettings(settings()); setErrors(validation); if (!Object.keys(validation).length) check.mutate(settings()); }} disabled={check.isPending} className="rounded-lg border border-outline-variant px-4 py-2 font-semibold disabled:opacity-50">{check.isPending ? 'Проверяем…' : 'Проверить подключение'}</button><button onClick={submitSettings} disabled={save.isPending} className="rounded-lg bg-primary px-4 py-2 font-semibold text-on-primary disabled:opacity-50">Сохранить POS</button></div>
      <button onClick={() => runImport.mutate()} disabled={importing || complete || runImport.isPending || !importState || !['idle', 'failed'].includes(importState.status)} className="rounded-lg bg-primary px-4 py-2 font-semibold text-on-primary disabled:opacity-50">{runImport.isPending ? 'Запускаем…' : 'Импортировать меню'}</button>
      {importState?.status === 'failed' && <p role="alert">{importState.message ?? 'Импорт не выполнен. Повторите попытку.'}</p>}
      {importState && ['queued', 'running'].includes(importState.status) && <p role="status">Импортировано {importState.imported ?? 0}/{importState.total ?? 0} позиций</p>}
      {complete && <p role="status">Меню импортировано: {importState.imported ?? 0} позиций. Повторный импорт недоступен.</p>}
      {importState?.status === 'completed_with_errors' && <><p role="alert">Импортировано {importState.imported ?? 0}, не удалось импортировать {importState.failed?.length ?? 0} позиций.</p><ul>{importState.failed?.map((item, index) => <li key={`${item.name}-${index}`}>{item.name}: {item.reason}</li>)}</ul><button onClick={() => retry.mutate()} disabled={retry.isPending} className="rounded-lg border border-outline-variant px-4 py-2">Повторить импорт неуспешных позиций</button></>}
    </div>}
    {message && <p role="status" className="mt-4 text-sm">{message}</p>}
    <div className="mt-8 border-t border-outline-variant pt-5"><button onClick={() => { setPosType('none'); save.mutate({ posType: 'none', apiKey: '', url: '' }); }} className="text-sm text-on-background/60 underline">Пропустить</button></div>
  </section></main>;
}
