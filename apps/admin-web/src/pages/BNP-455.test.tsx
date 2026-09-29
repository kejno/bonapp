import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
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

describe('BNP-455: завершение четвёртого шага онбординга', () => {
  it('переходит на Welcome-дашборд по кнопке завершения', async () => {
    vi.mocked(tablesApi.getAreas).mockResolvedValue([
      { id: 'area-1', name: 'Основной зал', sortOrder: 0 },
    ]);
    vi.mocked(tablesApi.createTablesBulk).mockResolvedValue([
      { id: 'table-1', tableNumber: 1, areaId: 'area-1', seatsCount: 4, label: null, status: 'AVAILABLE' },
    ]);

    render(
      <MemoryRouter initialEntries={['/onboarding/step-4']}>
        <QueryClientProvider client={new QueryClient()}>
          <Routes>
            <Route path="/onboarding/step-4" element={<OnboardingStep4Page />} />
            <Route path="/welcome" element={<h1>Welcome-дашборд</h1>} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    await screen.findByRole('option', { name: 'Основной зал' });
    fireEvent.change(screen.getByLabelText('Зона'), { target: { value: 'area-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить столы' }));
    expect(await screen.findByText('В этом сеансе создано столов: 1 (1)')).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('link', { name: 'Завершить онбординг' }));
    expect(await screen.findByRole('heading', { name: 'Welcome-дашборд' })).toBeInTheDocument();
  });
});
