import { act, cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WaiterCallNotifications from './WaiterCallNotifications';
import { useAuthStore } from '../auth/auth.store';

const { handlers, disconnect } = vi.hoisted(() => ({ handlers: new Map<string, (payload: never) => void>(), disconnect: vi.fn() }));
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({ on: (event: string, callback: (payload: never) => void) => handlers.set(event, callback), disconnect })),
}));

describe('WaiterCallNotifications', () => {
  beforeEach(() => {
    handlers.clear();
    useAuthStore.setState({ accessToken: 'staff-token' });
  });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('keeps each call visible until staff closes it and formats both reasons', () => {
    render(<WaiterCallNotifications />);
    act(() => {
      handlers.get('waiter:called')?.({ tableId: '1', tableNumber: 4, reason: 'NEED_BILL' } as never);
      handlers.get('waiter:called')?.({ tableId: '2', tableNumber: 8, reason: 'CALL_STAFF' } as never);
    });
    expect(screen.getByText('Стол №4 просит счёт')).toBeInTheDocument();
    expect(screen.getByText('Стол №8 просит официанта')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Закрыть уведомление' })[0]);
    expect(screen.queryByText('Стол №4 просит счёт')).not.toBeInTheDocument();
    expect(screen.getByText('Стол №8 просит официанта')).toBeInTheDocument();
  });

  it('disconnects when the component is removed', () => {
    const { unmount } = render(<WaiterCallNotifications />);
    unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
