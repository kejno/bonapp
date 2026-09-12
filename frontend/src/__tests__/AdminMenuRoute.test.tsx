import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, it, expect, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AdminMenuPage } from '../pages/AdminMenuPage';
import { AdminLayout } from '../components/AdminLayout';
import { PrivateRoute } from '../components/PrivateRoute';

vi.mock('../api/axios', () => ({
  api: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
    patch: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

beforeEach(() => {
  localStorage.setItem('token', 'x.eyJ0ZW5hbnROYW1lIjoiVGVzdCJ9.x');
});

afterEach(() => {
  localStorage.clear();
  cleanup();
  vi.clearAllMocks();
});

it('renders AdminMenuPage (not placeholder) at /admin/menu', async () => {
  render(
    <MemoryRouter initialEntries={['/admin/menu']}>
      <Routes>
        <Route element={<PrivateRoute />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route path="menu" element={<AdminMenuPage />} />
          </Route>
        </Route>
        <Route path="/login" element={<div>Login</div>} />
      </Routes>
    </MemoryRouter>
  );

  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Добавить категорию' })).toBeInTheDocument();
  });
});
