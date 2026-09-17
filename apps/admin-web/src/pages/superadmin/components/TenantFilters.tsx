import { PlanType, TenantStatus } from '@bonapp/shared-types';

const PLAN_OPTIONS: Array<{ value: PlanType | ''; label: string }> = [
  { value: '', label: 'Все планы' },
  { value: 'TRIAL', label: 'Триал' },
  { value: 'STARTER', label: 'Стартер' },
  { value: 'PRO', label: 'Про' },
  { value: 'ENTERPRISE', label: 'Энтерпрайз' },
];

const STATUS_OPTIONS: Array<{ value: TenantStatus | ''; label: string }> = [
  { value: '', label: 'Все статусы' },
  { value: 'ACTIVE', label: 'Активные' },
  { value: 'BLOCKED', label: 'Заблокированные' },
  { value: 'TRIAL', label: 'На триале' },
];

interface Props {
  plan: string;
  status: string;
  onPlanChange: (v: string) => void;
  onStatusChange: (v: string) => void;
}

export function TenantFilters({ plan, status, onPlanChange, onStatusChange }: Props) {
  return (
    <div className="flex gap-3">
      <select
        aria-label="Фильтр по плану"
        value={plan}
        onChange={(e) => onPlanChange(e.target.value)}
        className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
      >
        {PLAN_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Фильтр по статусу"
        value={status}
        onChange={(e) => onStatusChange(e.target.value)}
        className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
