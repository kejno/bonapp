import { useState } from 'react';
import { TenantSummaryDto, PlanType } from '@bonapp/shared-types';
import {
  usePlatformMetrics,
  useTenants,
  useChangePlan,
  useBlockTenant,
  useUnblockTenant,
  useExtendTrial,
} from '../../api/superadmin';
import { PlatformMetrics } from './components/PlatformMetrics';
import { MrrChart } from './components/MrrChart';
import { TenantFilters } from './components/TenantFilters';
import { TenantTable } from './components/TenantTable';

const PLAN_LABELS: Record<PlanType, string> = {
  TRIAL: 'Триал',
  STARTER: 'Стартер',
  PRO: 'Про',
  ENTERPRISE: 'Энтерпрайз',
};

const PLAN_OPTIONS: PlanType[] = ['TRIAL', 'STARTER', 'PRO', 'ENTERPRISE'];

type Modal =
  | { type: 'changePlan'; tenant: TenantSummaryDto }
  | { type: 'block'; tenant: TenantSummaryDto }
  | { type: 'unblock'; tenant: TenantSummaryDto }
  | { type: 'extendTrial'; tenant: TenantSummaryDto }
  | null;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU');
}

export function SuperAdminPage() {
  const [planFilter, setPlanFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [modal, setModal] = useState<Modal>(null);
  const [selectedPlan, setSelectedPlan] = useState<PlanType>('PRO');
  const [mutationError, setMutationError] = useState<string | null>(null);

  const metricsQuery = usePlatformMetrics();
  const tenantsQuery = useTenants({ plan: planFilter || undefined, status: statusFilter || undefined });
  const changePlanMut = useChangePlan();
  const blockMut = useBlockTenant();
  const unblockMut = useUnblockTenant();
  const extendTrialMut = useExtendTrial();

  function closeModal() {
    setModal(null);
    setMutationError(null);
  }

  function handleConfirm() {
    if (!modal) return;
    setMutationError(null);

    const onError = () => setMutationError('Ошибка сервера. Попробуйте позже.');

    if (modal.type === 'changePlan') {
      changePlanMut.mutate({ id: modal.tenant.id, plan: selectedPlan }, { onSuccess: closeModal, onError });
    } else if (modal.type === 'block') {
      blockMut.mutate(modal.tenant.id, { onSuccess: closeModal, onError });
    } else if (modal.type === 'unblock') {
      unblockMut.mutate(modal.tenant.id, { onSuccess: closeModal, onError });
    } else if (modal.type === 'extendTrial') {
      extendTrialMut.mutate(modal.tenant.id, { onSuccess: closeModal, onError });
    }
  }

  const isPending =
    changePlanMut.isPending || blockMut.isPending || unblockMut.isPending || extendTrialMut.isPending;

  return (
    <div className="min-h-svh bg-bonapp-bg">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-semibold text-gray-900">Суперадмин консоль</h1>

        <PlatformMetrics metrics={metricsQuery.data} isLoading={metricsQuery.isLoading} />

        {metricsQuery.data && (
          <div className="mt-4">
            <MrrChart data={metricsQuery.data.mrrHistory} />
          </div>
        )}

        <div className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-medium text-gray-900">Тенанты</h2>
            <TenantFilters
              plan={planFilter}
              status={statusFilter}
              onPlanChange={setPlanFilter}
              onStatusChange={setStatusFilter}
            />
          </div>
          <TenantTable
            tenants={tenantsQuery.data?.data ?? []}
            isLoading={tenantsQuery.isLoading}
            onChangePlan={(t) => { setSelectedPlan(t.plan); setModal({ type: 'changePlan', tenant: t }); }}
            onBlock={(t) => setModal({ type: 'block', tenant: t })}
            onUnblock={(t) => setModal({ type: 'unblock', tenant: t })}
            onExtendTrial={(t) => setModal({ type: 'extendTrial', tenant: t })}
          />
        </div>
      </div>

      {modal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            {modal.type === 'changePlan' && (
              <>
                <h3 className="mb-4 text-base font-semibold">Изменить тарифный план</h3>
                <p className="mb-3 text-sm text-gray-600">
                  Тенант: <strong>{modal.tenant.name}</strong>
                </p>
                <select
                  aria-label="Выбор тарифного плана"
                  value={selectedPlan}
                  onChange={(e) => setSelectedPlan(e.target.value as PlanType)}
                  className="mb-4 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                >
                  {PLAN_OPTIONS.map((p) => (
                    <option key={p} value={p}>{PLAN_LABELS[p]}</option>
                  ))}
                </select>
              </>
            )}
            {modal.type === 'block' && (
              <>
                <h3 className="mb-4 text-base font-semibold">Заблокировать тенанта</h3>
                <p className="mb-4 text-sm text-gray-600">
                  Заблокировать <strong>{modal.tenant.name}</strong>? Сотрудники и гости потеряют доступ к платформе.
                </p>
              </>
            )}
            {modal.type === 'unblock' && (
              <>
                <h3 className="mb-4 text-base font-semibold">Разблокировать тенанта</h3>
                <p className="mb-4 text-sm text-gray-600">
                  Разблокировать <strong>{modal.tenant.name}</strong>? Доступ к платформе будет восстановлен.
                </p>
              </>
            )}
            {modal.type === 'extendTrial' && (
              <>
                <h3 className="mb-4 text-base font-semibold">Продлить триал на 30 дней?</h3>
                <p className="mb-4 text-sm text-gray-600">
                  Тенант: <strong>{modal.tenant.name}</strong>
                  <br />
                  Новая дата окончания:{' '}
                  <strong>
                    {formatDate(
                      new Date(
                        new Date(modal.tenant.trialEndsAt ?? new Date()).getTime() +
                          30 * 24 * 60 * 60 * 1000,
                      ).toISOString(),
                    )}
                  </strong>
                </p>
              </>
            )}

            {mutationError && (
              <p className="mb-3 text-sm text-red-600">{mutationError}</p>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={closeModal}
                className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
              >
                Отмена
              </button>
              <button
                onClick={handleConfirm}
                disabled={isPending}
                className="rounded-lg bg-bonapp-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {isPending ? 'Сохранение...' : 'Подтвердить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
