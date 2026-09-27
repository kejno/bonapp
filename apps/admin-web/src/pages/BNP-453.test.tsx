import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OnboardingStep4Page from './OnboardingStep4Page';
import * as tablesApi from '../tables/tables.api';

vi.mock('../tables/tables.api', () => ({
  createArea: vi.fn(),
  createTablesBulk: vi.fn(),
  generateQrPdf: vi.fn(),
  getAreas: vi.fn(),
  getTableQrPreview: vi.fn(),
  getTables: vi.fn(),
}));

describe('BNP-453: создание зоны и первых столов в онбординге', () => {
  beforeEach(() => {
    vi.mocked(tablesApi.getAreas)
      .mockResolvedValueOnce([])
      .mockResolvedValue([{ id: 'area-new', name: 'Терраса', sortOrder: 0 }]);
  });

  it('сохраняет название зоны и заданный диапазон столов с количеством мест', async () => {
    vi.mocked(tablesApi.createArea).mockResolvedValue({ id: 'area-new', name: 'Терраса', sortOrder: 0 });
    vi.mocked(tablesApi.createTablesBulk).mockResolvedValue([
      { id: 'table-21', tableNumber: 21, areaId: 'area-new', seatsCount: 6, label: null, status: 'AVAILABLE' },
      { id: 'table-22', tableNumber: 22, areaId: 'area-new', seatsCount: 6, label: null, status: 'AVAILABLE' },
      { id: 'table-23', tableNumber: 23, areaId: 'area-new', seatsCount: 6, label: null, status: 'AVAILABLE' },
    ]);
    render(<MemoryRouter><QueryClientProvider client={new QueryClient()}><OnboardingStep4Page /></QueryClientProvider></MemoryRouter>);

    fireEvent.change(screen.getByRole('textbox', { name: 'Название зоны' }), { target: { value: 'Терраса' } });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить зону' }));
    await waitFor(() => expect(vi.mocked(tablesApi.createArea).mock.calls[0]?.[0]).toBe('Терраса'));
    await screen.findByRole('option', { name: 'Терраса' });

    fireEvent.change(screen.getByLabelText('Количество мест'), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText('Первый номер стола'), { target: { value: '21' } });
    fireEvent.change(screen.getByLabelText('Количество столов'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить столы' }));

    await waitFor(() => expect(vi.mocked(tablesApi.createTablesBulk).mock.calls[0]?.[0]).toEqual({
      areaId: 'area-new', seatsCount: 6, startNumber: 21, count: 3,
    }));
    expect(await screen.findByText('В этом сеансе создано столов: 3 (21, 22, 23)')).toBeInTheDocument();
  });
});
