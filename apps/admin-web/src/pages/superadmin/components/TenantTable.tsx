import { useState } from 'react';
import { TenantSummaryDto, PlanType } from '@bonapp/shared-types';

const PLAN_LABELS: Record<PlanType, string> = {
  TRIAL: 'Триал',
  STARTER: 'Стартер',
  PRO: 'Про',
  ENTERPRISE: 'Энтерпрайз',
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Активен',
  BLOCKED: 'Заблокирован',
  TRIAL: 'Триал',
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  BLOCKED: 'bg-red-100 text-red-800',
  TRIAL: 'bg-blue-100 text-blue-800',
};

interface ActionMenuProps {
  tenant: TenantSummaryDto;
  onChangePlan: () => void;
  onBlock: () => void;
  onUnblock: () => void;
  onExtendTrial: () => void;
}

function ActionMenu({ tenant, onChangePlan, onBlock, onUnblock, onExtendTrial }: ActionMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded px-2 py-1 text-sm text-gray-600 hover:bg-gray-100"
        aria-label="Действия"
      >
        ···
      </button>
      {open && (
        <div
          className="absolute right-0 z-10 mt-1 w-44 rounded-lg border border-gray-100 bg-white shadow-md"
          onMouseLeave={() => setOpen(false)}
        >
          <button
            className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
            onClick={() => { setOpen(false); onChangePlan(); }}
          >
            Изменить план
          </button>
          {tenant.status !== 'BLOCKED' && (
            <button
              className="block w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-gray-50"
              onClick={() => { setOpen(false); onBlock(); }}
            >
              Заблокировать
            </button>
          )}
          {tenant.status === 'BLOCKED' && (
            <button
              className="block w-full px-4 py-2 text-left text-sm text-green-600 hover:bg-gray-50"
              onClick={() => { setOpen(false); onUnblock(); }}
            >
              Разблокировать
            </button>
          )}
          {tenant.status === 'TRIAL' && (
            <button
              className="block w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
              onClick={() => { setOpen(false); onExtendTrial(); }}
            >
              Продлить триал
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  tenants: TenantSummaryDto[];
  isLoading: boolean;
  onChangePlan: (tenant: TenantSummaryDto) => void;
  onBlock: (tenant: TenantSummaryDto) => void;
  onUnblock: (tenant: TenantSummaryDto) => void;
  onExtendTrial: (tenant: TenantSummaryDto) => void;
}

export function TenantTable({ tenants, isLoading, onChangePlan, onBlock, onUnblock, onExtendTrial }: Props) {
  if (isLoading) {
    return <div className="py-8 text-center text-sm text-gray-400">Загрузка...</div>;
  }

  if (tenants.length === 0) {
    return <div className="py-8 text-center text-sm text-gray-400">Тенанты не найдены</div>;
  }

  return (
    <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-100 text-gray-500">
          <tr>
            <th className="px-4 py-3 text-left font-medium">Название</th>
            <th className="px-4 py-3 text-left font-medium">План</th>
            <th className="px-4 py-3 text-left font-medium">Статус</th>
            <th className="px-4 py-3 text-left font-medium">Триал до</th>
            <th className="px-4 py-3 text-right font-medium">Выручка 30 дн.</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {tenants.map((t) => (
            <tr key={t.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-900">{t.name}</td>
              <td className="px-4 py-3">{PLAN_LABELS[t.plan]}</td>
              <td className="px-4 py-3">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[t.status] ?? ''}`}>
                  {STATUS_LABELS[t.status] ?? t.status}
                </span>
              </td>
              <td className="px-4 py-3 text-gray-500">
                {t.trialEndsAt
                  ? new Date(t.trialEndsAt).toLocaleDateString('ru-RU')
                  : '—'}
              </td>
              <td className="px-4 py-3 text-right text-gray-700">
                {t.revenueLastThirtyDays.toFixed(2)} BYN
              </td>
              <td className="px-4 py-3 text-right">
                <ActionMenu
                  tenant={t}
                  onChangePlan={() => onChangePlan(t)}
                  onBlock={() => onBlock(t)}
                  onUnblock={() => onUnblock(t)}
                  onExtendTrial={() => onExtendTrial(t)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
