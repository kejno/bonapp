interface Props {
  itemId: string;
  isAvailable: boolean;
  onToggle: (itemId: string) => void;
}

export function AvailabilityToggle({ itemId, isAvailable, onToggle }: Props) {
  return (
    <button type="button" aria-pressed={isAvailable} onClick={() => onToggle(itemId)}>
      {isAvailable ? 'Доступно' : 'Недоступно'}
    </button>
  );
}
