import { PlatformMetricsDto } from '@bonapp/shared-types';

interface Props {
  metrics: PlatformMetricsDto | undefined;
  isLoading: boolean;
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}

export function PlatformMetrics({ metrics, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-4">
      <MetricCard
        label="MRR (BYN)"
        value={metrics ? `${metrics.mrr.toFixed(2)} BYN` : '—'}
      />
      <MetricCard
        label="Активные рестораны"
        value={metrics ? String(metrics.activeTenants) : '—'}
      />
      <MetricCard
        label="QR-заказы сегодня"
        value={metrics ? String(metrics.ordersToday) : '—'}
      />
    </div>
  );
}
