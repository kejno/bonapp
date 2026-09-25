import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TablesPage from './TablesPage';
import * as tablesApi from '../tables/tables.api';

vi.mock('../tables/tables.api', () => ({
  getAreas: vi.fn(), getTables: vi.fn(), createTable: vi.fn(), updateTable: vi.fn(), generateQrPdf: vi.fn(),
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('BNP-387: печать QR выбранных столов', () => {
  it('скачивает PDF только для выбранных столов, исключая невыбранный стол', async () => {
    vi.mocked(tablesApi.getAreas).mockResolvedValue([{ id: 'main', name: 'Основной зал', sortOrder: 0 }]);
    vi.mocked(tablesApi.getTables).mockResolvedValue([
      { id: 't1', tableNumber: 1, label: null, seatsCount: 4, areaId: 'main', status: 'AVAILABLE' },
      { id: 't2', tableNumber: 2, label: null, seatsCount: 2, areaId: 'main', status: 'AVAILABLE' },
      { id: 't3', tableNumber: 3, label: null, seatsCount: 2, areaId: 'main', status: 'AVAILABLE' },
    ]);
    const pdf = new Blob(['%PDF-selected-tables'], { type: 'application/pdf' });
    vi.mocked(tablesApi.generateQrPdf).mockResolvedValue(pdf);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const createObjectURL = vi.fn().mockReturnValue('blob:tables-pdf');
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<MemoryRouter><QueryClientProvider client={client}><TablesPage /></QueryClientProvider></MemoryRouter>);

    fireEvent.click(await screen.findByRole('button', { name: 'Распечатать QR' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Стол 1/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Стол 2/ }));
    expect(screen.getByRole('checkbox', { name: /Стол 3/ })).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Скачать PDF' }));

    await waitFor(() => expect(vi.mocked(tablesApi.generateQrPdf).mock.calls[0]?.[0]).toEqual(['t1', 't2']));
    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(vi.mocked(tablesApi.generateQrPdf).mock.calls[0]?.[0]).not.toContain('t3');
    expect(createObjectURL).toHaveBeenCalledWith(pdf);
    expect(click.mock.instances[0]).toBeInstanceOf(HTMLAnchorElement);
    expect(click.mock.instances[0]).toMatchObject({ href: 'blob:tables-pdf', download: 'table-qr-codes.pdf' });
  });
});
