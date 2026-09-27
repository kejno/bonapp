import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import OnboardingStep4Page from './OnboardingStep4Page';

vi.mock('../tables/tables.api', () => ({
  createArea: vi.fn(),
  createTablesBulk: vi.fn(),
  generateQrPdf: vi.fn(),
  getAreas: vi.fn().mockResolvedValue([]),
  getTableQrPreview: vi.fn(),
  getTables: vi.fn(),
}));

describe('BNP-455: завершение четвёртого шага онбординга', () => {
  it('переходит на Welcome-дашборд по кнопке завершения', async () => {
    render(
      <MemoryRouter initialEntries={['/onboarding/step-4']}>
        <QueryClientProvider client={new QueryClient()}>
          <Routes>
            <Route path="/onboarding/step-4" element={<OnboardingStep4Page />} />
            <Route path="/dashboard" element={<h1>Welcome-дашборд</h1>} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('link', { name: 'Завершить онбординг' }));
    expect(await screen.findByRole('heading', { name: 'Welcome-дашборд' })).toBeInTheDocument();
  });
});
