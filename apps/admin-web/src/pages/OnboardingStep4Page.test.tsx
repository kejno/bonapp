import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OnboardingStep4Page from './OnboardingStep4Page';
import * as tablesApi from '../tables/tables.api';

vi.mock('../tables/tables.api', () => ({
  createArea: vi.fn(), createTablesBulk: vi.fn(), generateQrPdf: vi.fn(), getAreas: vi.fn(), getTableQrPreview: vi.fn(), getTables: vi.fn(),
}));

describe('OnboardingStep4Page', () => {
  beforeEach(() => {
    vi.mocked(tablesApi.getAreas).mockResolvedValue([{ id: 'area-1', name: 'Основной зал', sortOrder: 0 }]);
    vi.mocked(tablesApi.getTableQrPreview).mockResolvedValue({
      tableNumber: 1, restaurantName: 'Bonapp', url: 'https://guest.example/menu?qr_token=token', qrDataUrl: 'data:image/png;base64,qr',
    });
  });

  it('creates multiple tables in the selected area and shows them for this session', async () => {
    const created = [1, 2, 3, 4, 5].map((tableNumber) => ({
      id: `table-${tableNumber}`, tableNumber, areaId: 'area-1', seatsCount: 4, label: null, status: 'AVAILABLE',
    }));
    vi.mocked(tablesApi.createTablesBulk).mockResolvedValue(created);
    render(<MemoryRouter><QueryClientProvider client={new QueryClient()}><OnboardingStep4Page /></QueryClientProvider></MemoryRouter>);

    await screen.findByRole('option', { name: 'Основной зал' });
    fireEvent.change(screen.getByLabelText('Зона'), { target: { value: 'area-1' } });
    fireEvent.change(screen.getByLabelText('Количество мест'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Первый номер стола'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Количество столов'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить столы' }));

    await waitFor(() => expect(tablesApi.createTablesBulk.mock.calls[0][0]).toEqual({
      areaId: 'area-1', seatsCount: 4, startNumber: 1, count: 5,
    }));
    expect(await screen.findByText('В этом сеансе создано столов: 5 (1, 2, 3, 4, 5)')).toBeInTheDocument();
  });
});
