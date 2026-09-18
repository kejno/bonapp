import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EditCredentialsDialog } from './EditCredentialsDialog';
import type { IntegrationConfig } from './integrationConfigs';

vi.mock('../../lib/api', () => ({
  updateTenantSettings: vi.fn().mockResolvedValue(undefined),
}));

const wrap = (ui: React.ReactNode) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
};

const iikoConfig: IntegrationConfig = {
  provider: 'iiko',
  title: 'iiko Cloud',
  fields: [
    { key: 'iikoApiUrl', label: 'API URL', type: 'text' },
    { key: 'iikoLogin', label: 'Логин', type: 'text' },
    { key: 'iikoPassword', label: 'Пароль', type: 'password' },
  ],
};

describe('EditCredentialsDialog', () => {
  it('renders nothing when closed', () => {
    wrap(
      <EditCredentialsDialog
        open={false}
        onClose={vi.fn()}
        config={iikoConfig}
        tenantId="t1"
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders dialog title when open', () => {
    wrap(
      <EditCredentialsDialog
        open={true}
        onClose={vi.fn()}
        config={iikoConfig}
        tenantId="t1"
      />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('iiko Cloud')).toBeInTheDocument();
  });

  it('renders all fields for iiko', () => {
    wrap(
      <EditCredentialsDialog
        open={true}
        onClose={vi.fn()}
        config={iikoConfig}
        tenantId="t1"
      />,
    );
    expect(screen.getByLabelText('API URL')).toBeInTheDocument();
    expect(screen.getByLabelText('Логин')).toBeInTheDocument();
    expect(screen.getByLabelText('Пароль')).toBeInTheDocument();
  });

  it('renders password fields as type=password by default', () => {
    wrap(
      <EditCredentialsDialog
        open={true}
        onClose={vi.fn()}
        config={iikoConfig}
        tenantId="t1"
      />,
    );
    expect(screen.getByLabelText('Пароль')).toHaveAttribute('type', 'password');
  });

  it('toggles password visibility', () => {
    wrap(
      <EditCredentialsDialog
        open={true}
        onClose={vi.fn()}
        config={iikoConfig}
        tenantId="t1"
      />,
    );
    const toggle = screen.getByLabelText('Показать Пароль');
    fireEvent.click(toggle);
    expect(screen.getByLabelText('Пароль')).toHaveAttribute('type', 'text');
    fireEvent.click(toggle);
    expect(screen.getByLabelText('Пароль')).toHaveAttribute('type', 'password');
  });

  it('calls onClose when Escape is pressed', async () => {
    const onClose = vi.fn();
    wrap(
      <EditCredentialsDialog
        open={true}
        onClose={onClose}
        config={iikoConfig}
        tenantId="t1"
      />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('submits form and calls onClose on success', async () => {
    const { updateTenantSettings } = await import('../../lib/api');
    (updateTenantSettings as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const onClose = vi.fn();
    wrap(
      <EditCredentialsDialog
        open={true}
        onClose={onClose}
        config={iikoConfig}
        tenantId="t1"
      />,
    );

    fireEvent.change(screen.getByLabelText('API URL'), {
      target: { value: 'http://iiko.local' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => {
      expect(updateTenantSettings).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('shows error message and keeps dialog open when save fails', async () => {
    const { updateTenantSettings } = await import('../../lib/api');
    (updateTenantSettings as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Unauthorized'),
    );

    const onClose = vi.fn();
    wrap(
      <EditCredentialsDialog
        open={true}
        onClose={onClose}
        config={iikoConfig}
        tenantId="t1"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => {
      expect(screen.getByText('Unauthorized')).toBeInTheDocument();
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
