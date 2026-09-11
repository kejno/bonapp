import type { CSSProperties, FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { api } from '../api/axios';

interface Table {
  id: string;
  name: string;
}

export function downloadQr(blob: Blob, tableName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `table-${tableName}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const formStyle: CSSProperties = { marginBottom: 24 };
const fieldStyle: CSSProperties = { marginBottom: 12 };
const listStyle: CSSProperties = { listStyle: 'none', padding: 0 };
const itemStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '8px 0',
  borderBottom: '1px solid #e5e4e7',
};
const actionsStyle: CSSProperties = { display: 'flex', gap: 8 };

export function Tables() {
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    api
      .get<Table[]>('/tables')
      .then(({ data }) => setTables(data))
      .catch(() => setError('Ошибка загрузки столов'))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreateError('');
    setCreating(true);
    try {
      const { data } = await api.post<Table>('/tables', { name });
      setTables((prev) => [...prev, data]);
      setName('');
    } catch {
      setCreateError('Ошибка создания стола');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(table: Table) {
    if (!window.confirm(`Удалить стол "${table.name}"?`)) return;
    try {
      await api.delete(`/tables/${table.id}`);
      setTables((prev) => prev.filter((t) => t.id !== table.id));
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      window.alert(msg ?? 'Ошибка удаления стола');
    }
  }

  async function handleDownloadQr(table: Table) {
    try {
      const { data } = await api.get<Blob>(`/tables/${table.id}/qr`, { responseType: 'blob' });
      downloadQr(data, table.name);
    } catch {
      window.alert('Ошибка получения QR-кода');
    }
  }

  if (loading) return <p>Загрузка...</p>;
  if (error) return <p style={{ color: 'red' }}>{error}</p>;

  return (
    <div>
      <h2>Столы</h2>
      <form onSubmit={handleCreate} style={formStyle}>
        <div style={fieldStyle}>
          <label>
            Название стола
            <br />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
        </div>
        <button type="submit" disabled={creating}>
          {creating ? 'Добавление...' : 'Добавить стол'}
        </button>
        {createError && <p style={{ color: 'red' }}>{createError}</p>}
      </form>
      <ul style={listStyle}>
        {tables.map((table) => (
          <li key={table.id} style={itemStyle}>
            <span>{table.name}</span>
            <div style={actionsStyle}>
              <button type="button" onClick={() => handleDownloadQr(table)}>
                Скачать QR
              </button>
              <button type="button" onClick={() => handleDelete(table)}>
                Удалить
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
