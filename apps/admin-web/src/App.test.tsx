import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('./stores/authStore', () => ({
  useAuthStore: () => null,
}));

describe('App', () => {
  it('renders the admin heading on the root route', () => {
    render(<App />);
    expect(screen.getByText('Bonapp — Admin')).toBeInTheDocument();
  });
});
