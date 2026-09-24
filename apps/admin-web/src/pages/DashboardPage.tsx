import { useAuthStore } from '../auth/auth.store';

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-background gap-4">
      <h1 className="text-2xl font-semibold text-on-background">
        Добро пожаловать{user ? `, ${user.fullName}` : ''}
      </h1>
      <p className="text-sm text-on-background/60">Панель управления</p>
      <button
        onClick={clearAuth}
        className="text-sm text-primary hover:underline"
      >
        Выйти
      </button>
    </main>
  );
}
