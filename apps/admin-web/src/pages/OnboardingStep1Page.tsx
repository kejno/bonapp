import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../auth/auth.store';
import { isValidSlug, isValidUnp } from './onboarding-validation';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';
const transliteration: Record<string, string> = {
  а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'i',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya',
};
const makeSlug = (value: string) => value.toLowerCase().split('').map((char) => transliteration[char] ?? char).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
type Upload = { uploadUrl: string; uploadFields: Record<string, string>; publicUrl: string };

export default function OnboardingStep1Page() {
  const token = useAuthStore((state) => state.accessToken);
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [legalName, setLegalName] = useState('');
  const [unp, setUnp] = useState('');
  const [address, setAddress] = useState('');
  const [brandColor, setBrandColor] = useState('#e0533c');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoError, setLogoError] = useState('');
  const [slugError, setSlugError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const headers = useMemo(() => ({ Authorization: `Bearer ${token ?? ''}`, 'Content-Type': 'application/json' }), [token]);

  useEffect(() => { if (!slugEdited) setSlug(makeSlug(name)); }, [name, slugEdited]);

  const chooseLogo = (file?: File) => {
    setLogoError(''); setLogoFile(null); setLogoUrl('');
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setLogoError('Загрузите файл PNG, JPG или WEBP.'); return; }
    if (file.size > 5 * 1024 * 1024) { setLogoError('Размер файла не должен превышать 5 МБ.'); return; }
    setLogoFile(file);
  };

  const checkSlug = async () => {
    if (!isValidSlug(slug)) { setSlugError('Используйте 3–50 строчных латинских букв, цифр или дефисов.'); return false; }
    try {
      const response = await fetch(`${API}/admin/tenant/onboarding/slug-availability?slug=${encodeURIComponent(slug)}`, { headers: { Authorization: `Bearer ${token ?? ''}` } });
      const result = await response.json() as { available?: boolean };
      setSlugError(result.available ? '' : 'Этот адрес уже занят. Выберите другой.');
      return Boolean(result.available);
    } catch { setSlugError('Не удалось проверить адрес. Повторите попытку.'); return false; }
  };

  const canContinue = Boolean(name.trim() && legalName.trim() && address.trim() && isValidUnp(unp) && isValidSlug(slug) && !busy && !logoError);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    if (!name.trim() || !legalName.trim() || !address.trim() || !isValidUnp(unp)) { setError('Заполните обязательные поля. УНП должен содержать 9 цифр.'); return; }
    setBusy(true);
    try {
      if (!(await checkSlug())) { setBusy(false); return; }
      let uploadedLogo = logoUrl;
      if (logoFile) {
        const signedResponse = await fetch(`${API}/admin/tenant/onboarding/logo-upload`, { method: 'POST', headers, body: JSON.stringify({ contentType: logoFile.type }) });
        if (!signedResponse.ok) throw new Error('Не удалось подготовить загрузку логотипа.');
        const upload = await signedResponse.json() as Upload;
        const form = new FormData(); Object.entries(upload.uploadFields).forEach(([key, value]) => form.append(key, value)); form.append('file', logoFile);
        const uploadResponse = await fetch(upload.uploadUrl, { method: 'POST', body: form });
        if (!uploadResponse.ok) { setLogoError('Не удалось загрузить логотип. Повторите попытку или удалите файл.'); setBusy(false); return; }
        uploadedLogo = upload.publicUrl;
      }
      const response = await fetch(`${API}/admin/tenant/onboarding/step1`, { method: 'PUT', headers, body: JSON.stringify({ name, slug, legalName, unp, address, brandColor, ...(uploadedLogo ? { logoUrl: uploadedLogo } : {}) }) });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { message?: string; code?: string };
        if (body.code === 'SLUG_TAKEN') setSlugError('Этот адрес уже занят. Выберите другой.');
        else setError(body.message ?? 'Не удалось сохранить профиль.');
        return;
      }
      navigate('/onboarding/step-2');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Не удалось сохранить профиль.'); }
    finally { setBusy(false); }
  };

  const inputClass = 'mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm';
  return <main className="min-h-screen bg-stone-50 px-4 py-10 text-stone-900">
    <div className="mx-auto max-w-5xl">
      <header className="mb-8"><p className="text-sm font-semibold text-orange-700">Настройка заведения · Шаг 1 из 4</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-200"><div className="h-full w-1/4 rounded-full bg-orange-600" /></div><h1 className="mt-6 text-3xl font-bold">Профиль заведения</h1><p className="mt-2 text-stone-600">Укажите основные данные и настройте внешний вид меню.</p></header>
      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
        <section className="space-y-5 rounded-2xl bg-white p-6 shadow-sm">
          <label className="block text-sm font-medium">Название заведения *<input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} required /></label>
          <label className="block text-sm font-medium">Адрес меню *<div className="mt-1 flex items-center rounded-xl border border-stone-300 bg-white pl-3"><input aria-label="Субдомен" className="min-w-0 flex-1 py-2.5 text-sm outline-none" value={slug} onChange={(event) => { setSlug(event.target.value); setSlugEdited(true); }} onBlur={() => void checkSlug()} required /><span className="pr-3 text-sm text-stone-500">.bonapp.by</span></div>{slugError && <span className="mt-1 block text-xs text-red-600">{slugError}</span>}</label>
          <label className="block text-sm font-medium">Юридическое название *<input className={inputClass} value={legalName} onChange={(event) => setLegalName(event.target.value)} required /></label>
          <label className="block text-sm font-medium">УНП *<input className={inputClass} inputMode="numeric" maxLength={9} value={unp} onChange={(event) => setUnp(event.target.value.replace(/\D/g, '').slice(0, 9))} required /><span className="mt-1 block text-xs text-stone-500">9 цифр</span></label>
          <label className="block text-sm font-medium">Адрес заведения *<textarea className={inputClass} value={address} onChange={(event) => setAddress(event.target.value)} required rows={2} /></label>
          <div><label className="block text-sm font-medium" htmlFor="brand-color">Фирменный цвет</label><div className="mt-2 flex items-center gap-3"><input id="brand-color" type="color" value={brandColor} onChange={(event) => setBrandColor(event.target.value)} className="h-10 w-14 cursor-pointer rounded border-0"/><span className="text-sm text-stone-600">{brandColor}</span></div></div>
          <div><label className="block text-sm font-medium" htmlFor="logo">Логотип <span className="font-normal text-stone-500">(необязательно)</span></label><input id="logo" className="mt-2 block w-full text-sm" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => chooseLogo(event.target.files?.[0])}/><p className="mt-1 text-xs text-stone-500">PNG, JPG или WEBP, до 5 МБ. Рекомендуемый размер — 400 × 400 px.</p>{logoFile && <button type="button" className="mt-2 text-sm text-red-700" onClick={() => chooseLogo()}>Удалить выбранный файл</button>}{logoError && <p className="mt-1 text-sm text-red-600">{logoError}</p>}</div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end border-t border-stone-100 pt-4"><button type="submit" disabled={!canContinue} className="rounded-xl bg-orange-700 px-6 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Сохраняем…' : 'Далее'}</button></div>
        </section>
        <aside className="h-fit rounded-2xl bg-white p-6 shadow-sm"><h2 className="text-sm font-semibold">Предпросмотр меню</h2><div className="mt-4 overflow-hidden rounded-xl border border-stone-200"><div className="flex items-center gap-3 p-4" style={{ borderBottom: `3px solid ${brandColor}` }}>{logoFile ? <img src={URL.createObjectURL(logoFile)} alt="Логотип" className="h-12 w-12 rounded-lg object-cover"/> : logoUrl ? <img src={logoUrl} alt="Логотип" className="h-12 w-12 rounded-lg object-cover"/> : <div className="grid h-12 w-12 place-items-center rounded-lg text-white" style={{ backgroundColor: brandColor }}>Б</div>}<div><p className="font-semibold">{name || 'Название заведения'}</p><p className="text-xs text-stone-500">Меню заведения</p></div></div><div className="space-y-3 p-4"><div className="h-24 rounded-lg bg-stone-100"/><p className="text-sm font-semibold">Популярное</p><div className="flex justify-between rounded-lg bg-stone-50 p-3 text-sm"><span>Блюдо дня</span><span style={{ color: brandColor }}>18,00 BYN</span></div></div></div></aside>
      </form>
    </div>
  </main>;
}
