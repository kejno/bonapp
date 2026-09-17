import { IntegrationStatus } from '@bonapp/shared-types';

const STATUS_LABELS: Record<IntegrationStatus, string> = {
  [IntegrationStatus.Online]: 'Online',
  [IntegrationStatus.Offline]: 'Offline',
  [IntegrationStatus.ConnectionFailed]: 'Connection failed',
  [IntegrationStatus.Active]: 'Active',
  [IntegrationStatus.NotConfigured]: 'Not configured',
};

const STATUS_CLASSES: Record<IntegrationStatus, string> = {
  [IntegrationStatus.Online]: 'bg-green-100 text-green-700',
  [IntegrationStatus.Offline]: 'bg-yellow-100 text-yellow-700',
  [IntegrationStatus.ConnectionFailed]: 'bg-red-100 text-red-700',
  [IntegrationStatus.Active]: 'bg-green-100 text-green-700',
  [IntegrationStatus.NotConfigured]: 'bg-gray-100 text-gray-500',
};

export interface IntegrationCardProps {
  name: string;
  provider: 'iiko' | 'r_keeper' | 'oplaty' | 'erip' | 'bepaid' | 'skno';
  status: IntegrationStatus;
  pingMs?: number | null;
  detailLabel?: string;
  detailValue?: string | null;
  mode?: 'test' | 'prod' | null;
  onConfigure: () => void;
  onSync?: () => void;
  isSyncing?: boolean;
}

export function IntegrationCard({
  name,
  provider,
  status,
  pingMs,
  detailLabel,
  detailValue,
  mode,
  onConfigure,
  onSync,
  isSyncing = false,
}: IntegrationCardProps) {
  const hasSyncButton = (provider === 'iiko' || provider === 'r_keeper') && onSync;
  const syncVisible = hasSyncButton && status !== IntegrationStatus.NotConfigured;
  const syncEnabled = status === IntegrationStatus.Online && !isSyncing;
  const isConfigured = status !== IntegrationStatus.NotConfigured;

  return (
    <div
      className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col gap-4"
      data-testid={`integration-card-${provider}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold text-gray-900">{name}</span>
        <span
          className={[
            'text-xs font-medium px-2 py-0.5 rounded-full',
            STATUS_CLASSES[status],
          ].join(' ')}
        >
          {STATUS_LABELS[status]}
        </span>
      </div>

      {(detailLabel || pingMs != null || mode) && (
        <dl className="flex flex-col gap-1 text-sm text-gray-600">
          {detailLabel && detailValue && (
            <div className="flex items-center gap-2">
              <dt className="text-gray-400">{detailLabel}</dt>
              <dd className="font-medium text-gray-800">{detailValue}</dd>
            </div>
          )}
          {pingMs != null && (
            <div className="flex items-center gap-2">
              <dt className="text-gray-400">Ping</dt>
              <dd className="font-medium text-gray-800">{pingMs} ms</dd>
            </div>
          )}
          {mode && (
            <div className="flex items-center gap-2">
              <dt className="text-gray-400">Режим</dt>
              <dd>
                <span
                  className={[
                    'text-xs font-medium px-1.5 py-0.5 rounded',
                    mode === 'test' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700',
                  ].join(' ')}
                >
                  {mode}
                </span>
              </dd>
            </div>
          )}
        </dl>
      )}

      <div className="flex items-center gap-2 pt-1 border-t border-gray-50">
        <button
          onClick={onConfigure}
          className="text-sm font-medium text-bonapp-accent hover:underline"
        >
          {isConfigured ? 'Редактировать' : 'Настроить'}
        </button>

        {syncVisible && (
          <button
            onClick={onSync}
            disabled={!syncEnabled}
            aria-label="Синхронизировать меню"
            className={[
              'ml-auto flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors',
              syncEnabled
                ? 'bg-bonapp-accent text-white hover:bg-[#c94530]'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed',
            ].join(' ')}
          >
            {isSyncing && (
              <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            Синхронизировать меню
          </button>
        )}
      </div>
    </div>
  );
}
