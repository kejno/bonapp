import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { api } from '../api/axios';
import { OrderCard, OrdersPage } from './OrdersPage';

vi.mock('../api/axios', () => ({
  api: { get: vi.fn(), patch: vi.fn() },
}));

afterEach(() => vi.resetAllMocks());

const baseOrder = {
  id: 'order-1',
  tableId: 'table-A',
  tableName: 'Зал 1',
  status: 'NEW' as const,
  items: [{ menuItemId: 'item-1', name: 'Вода', price: 50, quantity: 2 }],
  totalAmount: 100,
  createdAt: '2026-09-12T10:00:00.000Z',
};

const paginatedResponse = (orders: typeof baseOrder[]) => ({
  data: { data: orders, total: orders.length, page: 1, limit: 50 },
});

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

  it('показывает tableName вместо tableId', () => {
    render(<OrderCard order={baseOrder} updatingId={null} onStatusChange={vi.fn()} />);
    expect(screen.getByText('Стол: Зал 1')).toBeInTheDocument();
    expect(screen.queryByText('Стол: table-A')).not.toBeInTheDocument();
  });
});

describe('OrdersPage — логика компонента', () => {
  it('сбрасывает ошибку загрузки после успешного повторного запроса', async () => {
    vi.mocked(api.get)
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(paginatedResponse([baseOrder]));

    render(<MemoryRouter><OrdersPage /></MemoryRouter>);
    await screen.findByText('Ошибка загрузки заказов');

    await userEvent.click(screen.getByRole('button', { name: 'Новые' }));

    await waitFor(() =>
      expect(screen.queryByText('Ошибка загрузки заказов')).not.toBeInTheDocument(),
    );
  });

  it('показывает ошибку при неудачной смене статуса', async () => {
    vi.mocked(api.get).mockResolvedValue(paginatedResponse([baseOrder]));
    vi.mocked(api.patch).mockRejectedValueOnce(new Error('server error'));

    render(<MemoryRouter><OrdersPage /></MemoryRouter>);
    await screen.findByText('Принять в работу');

    await userEvent.click(screen.getByRole('button', { name: 'Принять в работу' }));

    await screen.findByText('Не удалось изменить статус заказа');
  });
});
