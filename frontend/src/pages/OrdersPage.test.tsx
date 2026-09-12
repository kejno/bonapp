import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrderCard } from './OrdersPage';

const baseOrder = {
  id: 'order-1',
  tableId: 'table-A',
  status: 'NEW' as const,
  items: [{ menuItemId: 'item-1', name: 'Вода', price: 50, quantity: 2 }],
  totalAmount: 100,
  createdAt: '2026-09-12T10:00:00.000Z',
};

describe('OrderCard — кнопки по статусу', () => {
  it('NEW: показывает "Принять в работу" и "Отменить"', () => {
    render(<OrderCard order={{ ...baseOrder, status: 'NEW' }} updatingId={null} onStatusChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Принять в работу' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отменить' })).toBeInTheDocument();
  });

  it('IN_PROGRESS: показывает "Выполнен" и "Отменить"', () => {
    render(<OrderCard order={{ ...baseOrder, status: 'IN_PROGRESS' }} updatingId={null} onStatusChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Выполнен' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Отменить' })).toBeInTheDocument();
  });

  it('DONE: кнопок действий нет', () => {
    render(<OrderCard order={{ ...baseOrder, status: 'DONE' }} updatingId={null} onStatusChange={vi.fn()} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('CANCELLED: кнопок действий нет', () => {
    render(<OrderCard order={{ ...baseOrder, status: 'CANCELLED' }} updatingId={null} onStatusChange={vi.fn()} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('кнопки задизейблены во время обновления', () => {
    render(<OrderCard order={{ ...baseOrder, status: 'NEW' }} updatingId="order-1" onStatusChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Принять в работу' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Отменить' })).toBeDisabled();
  });

  it('не дизейблит кнопки другой карточки при обновлении', () => {
    render(<OrderCard order={{ ...baseOrder, status: 'NEW' }} updatingId="order-99" onStatusChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Принять в работу' })).not.toBeDisabled();
  });

  it('NEW → IN_PROGRESS: вызывает onStatusChange с правильными аргументами', async () => {
    const onStatusChange = vi.fn();
    render(<OrderCard order={{ ...baseOrder, status: 'NEW' }} updatingId={null} onStatusChange={onStatusChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Принять в работу' }));
    expect(onStatusChange).toHaveBeenCalledWith('order-1', 'IN_PROGRESS');
  });

  it('IN_PROGRESS → CANCELLED: вызывает onStatusChange с правильными аргументами', async () => {
    const onStatusChange = vi.fn();
    render(<OrderCard order={{ ...baseOrder, status: 'IN_PROGRESS' }} updatingId={null} onStatusChange={onStatusChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Отменить' }));
    expect(onStatusChange).toHaveBeenCalledWith('order-1', 'CANCELLED');
  });

  it('отображает несколько позиций заказа', () => {
    const order = {
      ...baseOrder,
      items: [
        { menuItemId: 'item-1', name: 'Пицца', price: 400, quantity: 1 },
        { menuItemId: 'item-2', name: 'Кола', price: 80, quantity: 2 },
      ],
      totalAmount: 560,
    };
    render(<OrderCard order={order} updatingId={null} onStatusChange={vi.fn()} />);
    expect(screen.getByText('Пицца × 1')).toBeInTheDocument();
    expect(screen.getByText('Кола × 2')).toBeInTheDocument();
  });
});
