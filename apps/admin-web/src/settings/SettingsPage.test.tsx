import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from './SettingsPage';

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ name: 'Кафе', slug: 'cafe', address: 'Минск', unp: '123', legalName: 'ООО Кафе', logoUrl: null, brandColor: '#e0533c', serviceMode: 'ORDER_AND_PAY' }),
    }));
  });

  it('updates the preview as color changes and saves settings', async () => {
    render(<SettingsPage />);
    const colorInput = await screen.findByLabelText('Цвет бренда');
    fireEvent.change(colorInput, { target: { value: '#123456' } });
    expect(screen.getByLabelText('Предпросмотр меню')).toHaveStyle({ borderColor: '#123456' });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/v1/admin/tenant/settings', expect.objectContaining({ method: 'PUT' })));
    expect(await screen.findByRole('status')).toHaveTextContent('Настройки сохранены');
  });
});
