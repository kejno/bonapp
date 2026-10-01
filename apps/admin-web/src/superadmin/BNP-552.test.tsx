import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import App from '../App';
import { useAuthStore } from '../auth/auth.store';

afterEach(() => {
  cleanup();
  act(() => useAuthStore.getState().clearAuth());
});

describe('BNP-552 доступ к странице SuperAdmin', () => {
  it('показывает страницу SUPER_ADMIN и перенаправляет OWNER на дашборд', () => {
    act(() => {
      useAuthStore.getState().setAuth('access-token', {
        id: 'superadmin-1',
        email: 'admin@example.com',
        role: 'SUPER_ADMIN',
        tenantId: 'tenant-1',
        fullName: 'Admin',
      });
    });
    window.history.pushState({}, '', '/superadmin');
    const { unmount } = render(<App />);
    expect(screen.getByRole('heading', { name: 'Суперадмин' })).toBeInTheDocument();
    unmount();
    cleanup();
    act(() => {
      useAuthStore.getState().setAuth('access-token', {
        id: 'owner-1',
        email: 'owner@example.com',
        role: 'OWNER',
        tenantId: 'tenant-1',
        fullName: 'Owner',
      });
    });
    window.history.pushState({}, '', '/superadmin');
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Добро пожаловать, Owner' })).toBeInTheDocument();
  });
});
