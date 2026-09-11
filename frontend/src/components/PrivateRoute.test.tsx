import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PrivateRoute } from './PrivateRoute';

function renderWithRouter(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div>Login page</div>} />
        <Route element={<PrivateRoute />}>
          <Route path="/admin" element={<div>Protected content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('PrivateRoute', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('renders protected content when token is present', () => {
    localStorage.setItem('token', 'header.payload.signature');
    renderWithRouter('/admin');
    expect(screen.getByText('Protected content')).toBeInTheDocument();
  });

  it('redirects to /login when token is absent', () => {
    renderWithRouter('/admin');
    expect(screen.getByText('Login page')).toBeInTheDocument();
  });
});
