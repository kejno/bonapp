import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
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

describe('BNP-454: предпросмотр тейбл-тента', () => {
  beforeEach(() => {
    vi.mocked(tablesApi.getAreas).mockResolvedValue([{ id: 'area-1', name: 'Основной зал', sortOrder: 0 }]);
    vi.mocked(tablesApi.createTablesBulk).mockResolvedValue([
      { id: 'table-7', tableNumber: 7, areaId: 'area-1', seatsCount: 4, label: null, status: 'AVAILABLE' },
    ]);
    vi.mocked(tablesApi.getTableQrPreview).mockResolvedValue({
      tableNumber: 7, restaurantName: 'Кафе у парка', url: 'https://guest.example/menu?qr_token=token-7', qrDataUrl: 'data:image/png;base64,qr-image',
    });
  });

  it('показывает QR-код, название заведения и номер стола', async () => {
    render(<MemoryRouter><QueryClientProvider client={new QueryClient()}><OnboardingStep4Page /></QueryClientProvider></MemoryRouter>);
    await screen.findByRole('option', { name: 'Основной зал' });
    fireEvent.change(screen.getByLabelText('Зона'), { target: { value: 'area-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить столы' }));

    expect(await screen.findByRole('img', { name: 'QR-код стола 7' })).toHaveAttribute('src', 'data:image/png;base64,qr-image');
    expect(screen.getByText('Кафе у парка')).toBeInTheDocument();
    expect(screen.getByText('Стол 7')).toBeInTheDocument();
  });
});
