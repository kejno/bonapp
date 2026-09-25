import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TablesPage from './TablesPage';
import * as tablesApi from '../tables/tables.api';

vi.mock('../tables/tables.api', () => ({
  getAreas: vi.fn(), getTables: vi.fn(), createTable: vi.fn(), updateTable: vi.fn(), generateQrPdf: vi.fn(),
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('BNP-387: печать QR выбранных столов', () => {
  it('отправляет выбранные столы на генерацию PDF и инициирует скачивание', async () => {
    vi.mocked(tablesApi.getAreas).mockResolvedValue([{ id: 'main', name: 'Основной зал', sortOrder: 0 }]);
    vi.mocked(tablesApi.getTables).mockResolvedValue([
      { id: 't1', tableNumber: 1, label: null, seatsCount: 4, areaId: 'main', status: 'AVAILABLE' },
      { id: 't2', tableNumber: 2, label: null, seatsCount: 2, areaId: 'main', status: 'AVAILABLE' },
    ]);
    vi.mocked(tablesApi.generateQrPdf).mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<MemoryRouter><QueryClientProvider client={client}><TablesPage /></QueryClientProvider></MemoryRouter>);

    fireEvent.click(await screen.findByRole('button', { name: 'Распечатать QR' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Стол 1/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Стол 2/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Скачать PDF' }));

    await waitFor(() => expect(vi.mocked(tablesApi.generateQrPdf).mock.calls[0]?.[0]).toEqual(['t1', 't2']));
    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    click.mockRestore();
  });
});
