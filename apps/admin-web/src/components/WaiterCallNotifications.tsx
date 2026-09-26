import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuthStore } from '../auth/auth.store';

type WaiterCall = { tableId: string; tableNumber: number; reason: 'NEED_BILL' | 'CALL_STAFF' };
type Notice = WaiterCall & { id: number };
const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1';
const SOCKET_URL = API_BASE.replace(/\/api\/v1\/?$/, '');

export default function WaiterCallNotifications() {
  const token = useAuthStore((state) => state.accessToken);
  const [notices, setNotices] = useState<Notice[]>([]);

  useEffect(() => {
    if (!token) return;
    const socket = io(SOCKET_URL, { auth: { accessToken: token } });
    socket.on('waiter:called', (call: WaiterCall) => {
      setNotices((current) => [...current, { ...call, id: Date.now() + Math.random() }]);
    });
    return () => { socket.disconnect(); };
  }, [token]);

  if (notices.length === 0) return null;
  return <aside aria-label="Вызовы официанта" className="fixed right-4 top-4 z-50 flex flex-col gap-2">
    {notices.map((notice) => <div key={notice.id} role="status" className="rounded-lg bg-primary p-4 text-on-primary shadow-lg">
      <span>Стол №{notice.tableNumber} просит {notice.reason === 'NEED_BILL' ? 'счёт' : 'официанта'}</span>
      <button aria-label="Закрыть уведомление" className="ml-4" onClick={() => setNotices((items) => items.filter((item) => item.id !== notice.id))}>×</button>
    </div>)}
  </aside>;
}
