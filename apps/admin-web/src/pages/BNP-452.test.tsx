import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import WelcomePage from './WelcomePage';
import type { Readiness } from '../welcome/welcome.api';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function CurrentLocation() {
  return <output>{useLocation().pathname}</output>;
}

describe('BNP-452: открытие смены с /welcome', () => {
  it('открывает смену и переводит на главный дашборд', async () => {
    const readiness: Readiness = {
      menuReady: true,
      tablesReady: true,
      paymentsReady: true,
      hasOrders: false,
      hasActiveShift: false,
      canSimulateOrder: true,
    };
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith('/admin/readiness')) {
        return Response.json(readiness);
      }
      if (url.endsWith('/admin/shifts/open')) {
        return Response.json({ id: 'shift-1' });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
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
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/v1\/admin\/shifts\/open$/),
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(await screen.findByText('/dashboard')).toBeInTheDocument();
  });
});
