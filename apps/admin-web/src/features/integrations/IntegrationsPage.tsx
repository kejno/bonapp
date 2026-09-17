import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { IntegrationStatus } from '@bonapp/shared-types';
import { fetchIntegrationsStatus, syncMenu } from '../../lib/api';
import { useToastStore } from '../../stores/toastStore';
import { IntegrationCard } from './IntegrationCard';
import { EditCredentialsDialog } from './EditCredentialsDialog';
import { INTEGRATION_CONFIGS, type IntegrationConfig } from './integrationConfigs';

interface Props {
  tenantId: string;
}

export function IntegrationsPage({ tenantId }: Props) {
  const addToast = useToastStore((s) => s.addToast);
  const qc = useQueryClient();
  const [activeConfig, setActiveConfig] = useState<IntegrationConfig | null>(null);
  const [syncingProvider, setSyncingProvider] = useState<'iiko' | 'r_keeper' | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['integrations', 'status', tenantId],
    queryFn: () => fetchIntegrationsStatus(tenantId),
    refetchInterval: 30_000,
  });

  const syncMutation = useMutation({
    mutationFn: (provider: 'iiko' | 'r_keeper') => syncMenu(tenantId, provider),
    onSuccess: () => {
      addToast('Синхронизация завершена', 'success');
      void qc.invalidateQueries({ queryKey: ['integrations', 'status'] });
    },
    onError: (err: Error) => {
      addToast(`Ошибка синхронизации: ${err.message}`, 'error');
    },
    onSettled: () => setSyncingProvider(null),
  });

  function handleSync(provider: 'iiko' | 'r_keeper') {
    setSyncingProvider(provider);
    syncMutation.mutate(provider);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-64 text-gray-400">
        Загрузка…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center min-h-64 text-red-500">
        Ошибка загрузки данных интеграций
      </div>
    );
  }

  const cards = [
    {
      config: INTEGRATION_CONFIGS.find((c) => c.provider === 'iiko')!,
      status: data.iiko.status,
      pingMs: data.iiko.pingMs,
    },
    {
      config: INTEGRATION_CONFIGS.find((c) => c.provider === 'r_keeper')!,
      status: data.rKeeper.status,
      pingMs: data.rKeeper.pingMs,
    },
    {
      config: INTEGRATION_CONFIGS.find((c) => c.provider === 'oplaty')!,
      status: data.oplaty.status,
      detailLabel: 'Merchant ID',
      detailValue: data.oplaty.merchantId,
    },
    {
      config: INTEGRATION_CONFIGS.find((c) => c.provider === 'erip')!,
      status: data.erip.status,
      detailLabel: 'Service ID',
      detailValue: data.erip.serviceId,
    },
    {
      config: INTEGRATION_CONFIGS.find((c) => c.provider === 'bepaid')!,
      status: data.bePaid.status,
      detailLabel: 'Shop ID',
      detailValue: data.bePaid.shopId,
      mode: data.bePaid.mode,
    },
    {
      config: INTEGRATION_CONFIGS.find((c) => c.provider === 'skno')!,
      status: data.skno.status,
      detailLabel: 'Серийный номер',
      detailValue: data.skno.serialNumber,
      pingMs: data.skno.pingMs,
    },
  ];

  return (
    <div className="min-h-svh bg-bonapp-bg">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-6">Интеграции</h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {cards.map(({ config, status, pingMs, detailLabel, detailValue, mode }) => {
            const isSync = config.provider === 'iiko' || config.provider === 'r_keeper';
            return (
              <IntegrationCard
                key={config.provider}
                name={config.title}
                provider={config.provider}
                status={status ?? IntegrationStatus.NotConfigured}
                pingMs={pingMs}
                detailLabel={detailLabel}
                detailValue={detailValue}
                mode={mode}
                onConfigure={() => setActiveConfig(config)}
                onSync={isSync ? () => handleSync(config.provider as 'iiko' | 'r_keeper') : undefined}
                isSyncing={syncingProvider === config.provider}
              />
            );
          })}
        </div>
      </div>

      {activeConfig && (
        <EditCredentialsDialog
          open={true}
          onClose={() => setActiveConfig(null)}
          config={activeConfig}
          tenantId={tenantId}
        />
      )}
    </div>
  );
}
