import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { IntegrationStatus } from '@bonapp/shared-types';
import { IntegrationCard } from './IntegrationCard';

describe('IntegrationCard', () => {
  const base = {
    name: 'iiko Cloud',
    provider: 'iiko' as const,
    onConfigure: vi.fn(),
  };

  describe('status badge', () => {
    it('shows "Online" badge', () => {
      render(<IntegrationCard {...base} status={IntegrationStatus.Online} pingMs={42} />);
      expect(screen.getByText('Online')).toBeInTheDocument();
    });

    it('shows ping when Online', () => {
      render(<IntegrationCard {...base} status={IntegrationStatus.Online} pingMs={42} />);
      expect(screen.getByText('42 ms')).toBeInTheDocument();
    });

    it('shows "Connection failed" badge', () => {
      render(<IntegrationCard {...base} status={IntegrationStatus.ConnectionFailed} pingMs={null} />);
      expect(screen.getByText('Connection failed')).toBeInTheDocument();
    });

    it('shows "Offline" badge', () => {
      render(<IntegrationCard {...base} status={IntegrationStatus.Offline} />);
      expect(screen.getByText('Offline')).toBeInTheDocument();
    });

    it('shows "Active" badge', () => {
      render(<IntegrationCard {...base} status={IntegrationStatus.Active} />);
      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('shows "Not configured" badge', () => {
      render(<IntegrationCard {...base} status={IntegrationStatus.NotConfigured} />);
      expect(screen.getByText('Not configured')).toBeInTheDocument();
    });
  });

  describe('configure/edit button', () => {
    it('shows "Настроить" when NotConfigured', () => {
      render(<IntegrationCard {...base} status={IntegrationStatus.NotConfigured} />);
      expect(screen.getByRole('button', { name: 'Настроить' })).toBeInTheDocument();
    });

    it('shows "Редактировать" when configured (Online)', () => {
      render(<IntegrationCard {...base} status={IntegrationStatus.Online} pingMs={10} />);
      expect(screen.getByRole('button', { name: 'Редактировать' })).toBeInTheDocument();
    });

    it('shows "Редактировать" when Active', () => {
      render(<IntegrationCard {...base} status={IntegrationStatus.Active} />);
      expect(screen.getByRole('button', { name: 'Редактировать' })).toBeInTheDocument();
    });

    it('calls onConfigure when clicked', () => {
      const onConfigure = vi.fn();
      render(<IntegrationCard {...base} status={IntegrationStatus.NotConfigured} onConfigure={onConfigure} />);
      fireEvent.click(screen.getByRole('button', { name: 'Настроить' }));
      expect(onConfigure).toHaveBeenCalledTimes(1);
    });
  });

  describe('sync button (iiko/r_keeper)', () => {
    it('shows sync button when Online', () => {
      render(
        <IntegrationCard {...base} status={IntegrationStatus.Online} pingMs={10} onSync={vi.fn()} />,
      );
      expect(screen.getByRole('button', { name: 'Синхронизировать меню' })).toBeInTheDocument();
    });

    it('sync button is enabled when Online', () => {
      render(
        <IntegrationCard {...base} status={IntegrationStatus.Online} pingMs={10} onSync={vi.fn()} />,
      );
      expect(screen.getByRole('button', { name: 'Синхронизировать меню' })).not.toBeDisabled();
    });

    it('sync button is disabled when ConnectionFailed', () => {
      render(
        <IntegrationCard {...base} status={IntegrationStatus.ConnectionFailed} onSync={vi.fn()} />,
      );
      expect(screen.getByRole('button', { name: 'Синхронизировать меню' })).toBeDisabled();
    });

    it('sync button is disabled when Offline', () => {
      render(<IntegrationCard {...base} status={IntegrationStatus.Offline} onSync={vi.fn()} />);
      expect(screen.getByRole('button', { name: 'Синхронизировать меню' })).toBeDisabled();
    });

    it('hides sync button when NotConfigured', () => {
      render(<IntegrationCard {...base} status={IntegrationStatus.NotConfigured} onSync={vi.fn()} />);
      expect(screen.queryByRole('button', { name: 'Синхронизировать меню' })).not.toBeInTheDocument();
    });

    it('shows spinner and disables when isSyncing', () => {
      render(
        <IntegrationCard
          {...base}
          status={IntegrationStatus.Online}
          pingMs={10}
          onSync={vi.fn()}
          isSyncing={true}
        />,
      );
      expect(screen.getByRole('button', { name: 'Синхронизировать меню' })).toBeDisabled();
    });

    it('calls onSync when clicked', () => {
      const onSync = vi.fn();
      render(
        <IntegrationCard {...base} status={IntegrationStatus.Online} pingMs={10} onSync={onSync} />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Синхронизировать меню' }));
      expect(onSync).toHaveBeenCalledTimes(1);
    });
  });

  describe('detail info', () => {
    it('renders detail label and value', () => {
      render(
        <IntegrationCard
          {...base}
          status={IntegrationStatus.Active}
          detailLabel="Merchant ID"
          detailValue="M-123"
        />,
      );
      expect(screen.getByText('Merchant ID')).toBeInTheDocument();
      expect(screen.getByText('M-123')).toBeInTheDocument();
    });

    it('renders bePaid mode badge', () => {
      render(
        <IntegrationCard
          {...base}
          provider="bepaid"
          status={IntegrationStatus.Active}
          detailLabel="Shop ID"
          detailValue="S-999"
          mode="test"
        />,
      );
      expect(screen.getByText('test')).toBeInTheDocument();
    });
  });

  it('renders card title', () => {
    render(<IntegrationCard {...base} status={IntegrationStatus.NotConfigured} />);
    expect(screen.getByText('iiko Cloud')).toBeInTheDocument();
  });
});
