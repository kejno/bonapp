import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import WelcomePage from './WelcomePage';
import { getReadiness, simulateTestOrder } from '../welcome/welcome.api';

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
  return <output>{useLocation().pathname + useLocation().search}</output>;
}

describe('BNP-451: симуляция QR-заказа с /welcome', () => {
  it('создаёт тестовый заказ и открывает его в KDS', async () => {
    vi.mocked(getReadiness).mockResolvedValue({
      menuReady: true,
      tablesReady: true,
      paymentsReady: true,
      hasOrders: false,
      hasActiveShift: false,
      canSimulateOrder: true,
    });
    vi.mocked(simulateTestOrder).mockResolvedValue({ id: 'test-order 1' });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <MemoryRouter initialEntries={['/welcome']}>
        <QueryClientProvider client={client}>
          <Routes>
            <Route path="/welcome" element={<WelcomePage />} />
            <Route path="/kds" element={<CurrentLocation />} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    const simulateButton = await screen.findByRole('button', { name: 'Симулировать тестовый заказ' });
    await waitFor(() => expect(simulateButton).toBeEnabled());
    fireEvent.click(simulateButton);
    await waitFor(() => expect(simulateTestOrder).toHaveBeenCalledOnce());
    expect(await screen.findByText('/kds?orderId=test-order%201')).toBeInTheDocument();
  });
});
