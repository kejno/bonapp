import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from './SettingsPage';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('BNP-406: предпросмотр и сохранение цвета бренда', () => {
  it('обновляет предпросмотр сразу и сохраняет выбранный цвет для меню', async () => {
    let persistedSettings = {
      name: 'Кафе', slug: 'cafe', address: 'Минск', unp: '123', legalName: 'ООО Кафе',
      logoUrl: null, brandColor: '#e0533c', serviceMode: 'ORDER_AND_PAY',
    };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        persistedSettings = { ...persistedSettings, ...JSON.parse(String(init.body)) };
      }
      return { ok: true, json: async () => persistedSettings } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const view = render(<SettingsPage />);
    fireEvent.change(await screen.findByLabelText('Цвет бренда'), { target: { value: '#123456' } });
    const preview = screen.getByLabelText('Предпросмотр меню');
    expect(preview).toHaveStyle({ borderColor: '#123456' });
    expect(screen.getByRole('button', { name: 'Добавить' })).toHaveStyle({ backgroundColor: '#123456' });

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/admin/tenant/settings',
      expect.objectContaining({ method: 'PUT', body: expect.stringContaining('"brandColor":"#123456"') }),
    ));
    expect(await screen.findByRole('status')).toHaveTextContent('Настройки сохранены');

    view.unmount();
    render(<SettingsPage />);
    expect(await screen.findByLabelText('Цвет бренда')).toHaveValue('#123456');
  });
});
