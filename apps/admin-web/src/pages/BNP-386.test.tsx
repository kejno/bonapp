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

describe('BNP-386: добавление стола', () => {
  it('сохраняет введённые данные и добавляет стол в сетку выбранной зоны', async () => {
    const area = { id: 'terrace', name: 'Терраса', sortOrder: 1 };
    const newTable = { id: 't9', tableNumber: 9, label: 'У перил', seatsCount: 5, areaId: area.id, status: 'AVAILABLE' };
    vi.mocked(tablesApi.getAreas).mockResolvedValue([area]);
    vi.mocked(tablesApi.getTables).mockResolvedValueOnce([]).mockResolvedValue([newTable]);
    vi.mocked(tablesApi.createTable).mockResolvedValue(newTable);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<MemoryRouter><QueryClientProvider client={client}><TablesPage /></QueryClientProvider></MemoryRouter>);

    fireEvent.click(await screen.findByRole('button', { name: '+ Добавить стол' }));
    fireEvent.change(screen.getByLabelText('Номер стола'), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText('Метка'), { target: { value: 'У перил' } });
    fireEvent.change(screen.getByLabelText('Количество мест'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(tablesApi.createTable).toHaveBeenCalledWith({
      tableNumber: 9, label: 'У перил', seatsCount: 5, areaId: area.id,
    }));
    expect(await screen.findByRole('button', { name: 'Стол 9, Свободен' })).toHaveAttribute('data-status', 'FREE');
  });
});
