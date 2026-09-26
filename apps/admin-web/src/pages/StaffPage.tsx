import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { STAFF_ROLES } from './staff-role';
import { useAuthStore } from '../auth/auth.store';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';
type Employee = { id: string; fullName: string; email: string; phone: string | null; role: string; isActive: boolean; lastLoginAt: string | null };
type Shift = { id: string; openedAt: string; cashier: { fullName: string }; ordersCount: number; revenue: string } | null;
const employeeSchema = z.object({ fullName: z.string().trim().min(1, 'Укажите имя'), email: z.email('Укажите корректный email'), phone: z.string(), role: z.enum(['WAITER', 'CASHIER', 'MANAGER', 'ADMIN']), temporaryPassword: z.string().optional() });
type EmployeeForm = z.infer<typeof employeeSchema>;

async function api<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } });
  if (!response.ok) throw new Error('Не удалось выполнить запрос');
  return response.json() as Promise<T>;
}

export default function StaffPage() {
  const token = useAuthStore((state) => state.accessToken);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shift, setShift] = useState<Shift>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Employee | null>(null);
  const [closing, setClosing] = useState(false);
  const form = useForm<EmployeeForm>({ resolver: zodResolver(employeeSchema), defaultValues: { fullName: '', email: '', phone: '', role: 'WAITER', temporaryPassword: '' } });
  const load = async () => {
    if (!token) return;
    try { const [staff, currentShift] = await Promise.all([api<Employee[]>('/admin/staff', token), api<Shift>('/admin/shifts/current', token)]); setEmployees(staff); setShift(currentShift); setError(''); }
    catch { setError('Не удалось загрузить сотрудников и смену'); }
  };
  useEffect(() => { void load(); }, [token]);
  useEffect(() => { if (editing) form.reset({ fullName: editing.fullName, email: editing.email, phone: editing.phone ?? '', role: editing.role as EmployeeForm['role'], temporaryPassword: '' }); }, [editing, form]);
  const save = async (values: EmployeeForm) => {
    if (!token) return;
    if (!editing?.id && (!values.temporaryPassword || values.temporaryPassword.length < 8)) { form.setError('temporaryPassword', { message: 'Введите пароль длиной не менее 8 символов' }); return; }
    try { await api(editing?.id ? `/admin/staff/${editing.id}` : '/admin/staff', token, { method: editing?.id ? 'PATCH' : 'POST', body: JSON.stringify(values) }); setEditing(null); await load(); }
    catch { setError('Не удалось сохранить сотрудника'); }
  };
  const runAction = async (action: () => Promise<unknown>, message: string) => {
    try { await action(); setError(''); await load(); }
    catch { setError(message); }
  };
  const deactivate = async (id: string) => { if (token) await runAction(() => api(`/admin/staff/${id}/deactivate`, token, { method: 'PATCH' }), 'Не удалось деактивировать сотрудника'); };
  const openShift = async () => { if (token) await runAction(() => api('/admin/shifts/open', token, { method: 'POST' }), 'Не удалось открыть смену'); };
  const closeShift = async () => {
    if (!token) return;
    try { await api('/admin/shifts/close', token, { method: 'POST' }); setClosing(false); setError(''); await load(); }
    catch { setError('Не удалось закрыть смену'); }
  };
  return <main className="mx-auto max-w-6xl space-y-8 p-8 text-stone-900"><header className="flex items-center justify-between"><div><h1 className="text-3xl font-bold">Сотрудники и смены</h1><p className="mt-1 text-stone-500">Управление доступом команды ресторана</p></div><button className="rounded-xl bg-orange-600 px-4 py-2 text-white" onClick={() => setEditing({ id: '', fullName: '', email: '', phone: '', role: 'WAITER', isActive: true, lastLoginAt: null })}>Добавить сотрудника</button></header>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <section className="rounded-2xl border bg-white p-6"><h2 className="mb-4 text-xl font-semibold">Текущая смена</h2>{shift ? <div className="flex items-center justify-between"><div><p>Открыта: {new Date(shift.openedAt).toLocaleString('ru-RU')}</p><p>Кассир: {shift.cashier.fullName}</p><p>Заказов: {shift.ordersCount}</p></div><button className="rounded-xl bg-stone-900 px-4 py-2 text-white" onClick={() => setClosing(true)}>Закрыть смену</button></div> : <button onClick={() => void openShift()} className="rounded-xl bg-orange-600 px-4 py-2 text-white">Открыть смену</button>}</section>
    <section className="overflow-hidden rounded-2xl border bg-white"><table className="w-full text-left"><thead className="bg-stone-50"><tr>{['Сотрудник', 'Роль', 'Телефон', 'Статус', 'Последний вход', 'Действия'].map((title) => <th key={title} className="p-4">{title}</th>)}</tr></thead><tbody>{employees.map((employee) => <tr key={employee.id} className="border-t"><td className="p-4">{employee.fullName}<div className="text-sm text-stone-500">{employee.email}</div></td><td className="p-4">{STAFF_ROLES.find(({ role }) => role === employee.role)?.label ?? employee.role}</td><td className="p-4">{employee.phone ?? '—'}</td><td className="p-4">{employee.isActive ? 'Активен' : 'Неактивен'}</td><td className="p-4">{employee.lastLoginAt ? new Date(employee.lastLoginAt).toLocaleString('ru-RU') : 'Ещё не входил'}</td><td className="space-x-3 p-4"><button onClick={() => setEditing(employee)}>Редактировать</button>{employee.isActive && <button className="text-red-700" onClick={() => void deactivate(employee.id)}>Деактивировать</button>}</td></tr>)}</tbody></table></section>
    {editing && <dialog open className="fixed inset-0 m-auto w-full max-w-lg rounded-2xl p-6 shadow-xl"><form onSubmit={form.handleSubmit(save)} className="space-y-3"><h2 className="text-xl font-semibold">{editing.id ? 'Редактировать сотрудника' : 'Новый сотрудник'}</h2><input {...form.register('fullName')} placeholder="Имя" className="w-full rounded-lg border p-3"/><input {...form.register('email')} type="email" placeholder="Электронная почта для входа" className="w-full rounded-lg border p-3"/><input {...form.register('phone')} placeholder="Телефон" className="w-full rounded-lg border p-3"/><select {...form.register('role')} className="w-full rounded-lg border p-3">{STAFF_ROLES.map(({ role, label, description }) => <option key={role} value={role}>{label} — {description}</option>)}</select>{!editing.id && <><input {...form.register('temporaryPassword')} type="password" placeholder="Временный пароль (от 8 символов)" className="w-full rounded-lg border p-3"/>{form.formState.errors.temporaryPassword && <p role="alert" className="text-sm text-red-700">{form.formState.errors.temporaryPassword.message}</p>}</>}<div className="flex justify-end gap-3"><button type="button" onClick={() => setEditing(null)}>Отмена</button><button className="rounded-xl bg-orange-600 px-4 py-2 text-white">Сохранить</button></div></form></dialog>}
    {closing && shift && <dialog open className="fixed inset-0 m-auto w-full max-w-md rounded-2xl p-6 shadow-xl"><h2 className="text-xl font-semibold">Закрыть смену?</h2><p className="mt-4">Выручка: {shift.revenue} BYN</p><p>Количество чеков: {shift.ordersCount}</p><div className="mt-6 flex justify-end gap-3"><button onClick={() => setClosing(false)}>Отмена</button><button onClick={() => void closeShift()} className="rounded-xl bg-orange-600 px-4 py-2 text-white">Закрыть смену</button></div></dialog>}</main>;
}
