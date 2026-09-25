import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import App from '../App';
import { useAuthStore } from './auth.store';

afterEach(() => {
  cleanup();
  act(() => useAuthStore.getState().clearAuth());
});

describe('BNP-371 login route access', () => {
  it('shows login to a guest and redirects an authenticated user to the dashboard', () => {
    window.history.pushState({}, '', '/login');
    const { unmount } = render(<App />);
    expect(screen.getByRole('heading', { name: 'Bonapp' })).toBeInTheDocument();
    unmount();

    act(() => useAuthStore.getState().setAuth('token', {
      id: 'user-1', email: 'admin@example.com', role: 'OWNER', tenantId: 'tenant-1', fullName: 'Admin',
    }));
    window.history.pushState({}, '', '/login');
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Добро пожаловать, Admin' })).toBeInTheDocument();
  });
});
