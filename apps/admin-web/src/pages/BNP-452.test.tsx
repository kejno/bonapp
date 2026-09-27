import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import WelcomePage from './WelcomePage';
import { getReadiness, openShift } from '../welcome/welcome.api';

vi.mock('../welcome/welcome.api', () => ({
  getReadiness: vi.fn(),
  openShift: vi.fn(),
  simulateTestOrder: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function CurrentLocation() {
  return <output>{useLocation().pathname}</output>;
}

describe('BNP-452: открытие смены с /welcome', () => {
  it('открывает смену и переводит на главный дашборд', async () => {
    vi.mocked(getReadiness).mockResolvedValue({
      menuReady: true,
      tablesReady: true,
      paymentsReady: true,
      hasOrders: false,
      hasActiveShift: false,
      canSimulateOrder: true,
    });
    vi.mocked(openShift).mockResolvedValue({ id: 'shift-1' });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <MemoryRouter initialEntries={['/welcome']}>
        <QueryClientProvider client={client}>
          <Routes>
            <Route path="/welcome" element={<WelcomePage />} />
            <Route path="/dashboard" element={<CurrentLocation />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    const openShiftButton = await screen.findByRole('button', { name: 'Открыть смену' });
    await waitFor(() => expect(openShiftButton).toBeEnabled());
    fireEvent.click(openShiftButton);
    await waitFor(() => expect(openShift).toHaveBeenCalledOnce());
    expect(await screen.findByText('/dashboard')).toBeInTheDocument();
  });
});
