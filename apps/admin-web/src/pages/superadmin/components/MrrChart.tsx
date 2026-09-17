import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { MrrMonthlyDto } from '@bonapp/shared-types';

interface Props {
  data: MrrMonthlyDto[];
}

export function MrrChart({ data }: Props) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <p className="mb-4 text-sm font-medium text-gray-700">MRR за 12 месяцев (BYN)</p>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="month" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(value: number) => [`${value.toFixed(2)} BYN`, 'MRR']}
          />
          <Area
            type="monotone"
            dataKey="mrr"
            stroke="#e0533c"
            fill="#e0533c22"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
