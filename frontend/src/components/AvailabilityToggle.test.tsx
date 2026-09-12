import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AvailabilityToggle } from './AvailabilityToggle';

describe('AvailabilityToggle', () => {
  it('shows "Доступно" when isAvailable is true', () => {
    render(<AvailabilityToggle itemId="1" isAvailable={true} onToggle={vi.fn()} />);
    expect(screen.getByRole('button')).toHaveTextContent('Доступно');
  });

  it('shows "Недоступно" when isAvailable is false', () => {
    render(<AvailabilityToggle itemId="1" isAvailable={false} onToggle={vi.fn()} />);
    expect(screen.getByRole('button')).toHaveTextContent('Недоступно');
  });

  it('calls onToggle with the item id when clicked', async () => {
    const onToggle = vi.fn();
    render(<AvailabilityToggle itemId="item-42" isAvailable={true} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onToggle).toHaveBeenCalledOnce();
    expect(onToggle).toHaveBeenCalledWith('item-42');
  });

  it('calls onToggle with correct id for each item when multiple toggles are rendered', async () => {
    const onToggle = vi.fn();
    render(
      <>
        <AvailabilityToggle itemId="item-1" isAvailable={true} onToggle={onToggle} />
        <AvailabilityToggle itemId="item-2" isAvailable={false} onToggle={onToggle} />
      </>,
    );
    const [first, second] = screen.getAllByRole('button');
    await userEvent.click(first);
    await userEvent.click(second);
    expect(onToggle).toHaveBeenCalledTimes(2);
    expect(onToggle).toHaveBeenNthCalledWith(1, 'item-1');
    expect(onToggle).toHaveBeenNthCalledWith(2, 'item-2');
  });
});
