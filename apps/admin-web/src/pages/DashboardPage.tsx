import { useAuthStore } from '../auth/auth.store';
import { Link } from 'react-router-dom';

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const canOpenKds = ['CHEF', 'OWNER', 'MANAGER'].includes(user?.role ?? '');

  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-background gap-4">
      <h1 className="text-2xl font-semibold text-on-background">
        Добро пожаловать{user ? `, ${user.fullName}` : ''}
      </h1>
      <p className="text-sm text-on-background/60">Панель управления</p>
      <Link to="/menu" className="text-sm text-primary hover:underline">
        Каталог меню
      </Link>
      {canOpenKds && (
        <Link to="/kds" className="text-sm text-primary hover:underline">
          Live KDS
        </Link>
      )}
      <Link
        to="/tables"
        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-on-primary"
      >
        Схема зала
      </Link>
      <button
        onClick={clearAuth}
        className="text-sm text-primary hover:underline"
      >
        Выйти
      </button>
    </main>
  );
}
