import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from './SettingsPage';

const initialSettings = {
  name: 'Кафе',
  slug: 'cafe',
  address: 'Минск',
  unp: '123456789',
  legalName: 'ООО Кафе',
  logoUrl: null,
  brandColor: '#e0533c',
  serviceMode: 'ORDER_AND_PAY',
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('BNP-405: сохранение настроек заведения', () => {
  it('сохраняет профиль, реквизиты и режим и загружает их после повторного открытия', async () => {
    let persistedSettings = { ...initialSettings };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        persistedSettings = JSON.parse(String(init.body)) as typeof persistedSettings;
        return { ok: true, json: async () => persistedSettings } as Response;
      }
      return { ok: true, json: async () => persistedSettings } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);

    const view = render(<SettingsPage />);
    fireEvent.change(await screen.findByLabelText('Название'), { target: { value: 'Новое кафе' } });
    fireEvent.change(screen.getByLabelText('Адрес'), { target: { value: 'Брест' } });
    fireEvent.change(screen.getByLabelText('УНП'), { target: { value: '987654321' } });
    fireEvent.change(screen.getByLabelText('Юридическое название для чека'), { target: { value: 'ООО Новое кафе' } });
    fireEvent.change(screen.getByLabelText('Режим обслуживания'), { target: { value: 'TAKEAWAY' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/admin/tenant/settings',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          name: 'Новое кафе', address: 'Брест', unp: '987654321',
          legalName: 'ООО Новое кафе', logoUrl: null,
          brandColor: '#e0533c', serviceMode: 'TAKEAWAY',
        }),
      }),
    ));
    expect(await screen.findByRole('status')).toHaveTextContent('Настройки сохранены');

    view.unmount();
    render(<SettingsPage />);
    expect(await screen.findByLabelText('Название')).toHaveValue('Новое кафе');
    expect(screen.getByLabelText('Адрес')).toHaveValue('Брест');
    expect(screen.getByLabelText('УНП')).toHaveValue('987654321');
    expect(screen.getByLabelText('Юридическое название для чека')).toHaveValue('ООО Новое кафе');
    expect(screen.getByLabelText('Режим обслуживания')).toHaveValue('TAKEAWAY');
  });
});
