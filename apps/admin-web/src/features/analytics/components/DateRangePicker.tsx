import type { DateRangePreset } from '@bonapp/shared-types'

const PRESETS: { key: DateRangePreset; label: string }[] = [
  { key: 'today', label: 'Сегодня' },
  { key: 'week', label: 'Неделя' },
  { key: 'month', label: 'Месяц' },
  { key: 'custom', label: 'Произвольный' },
]

function toInputValue(d: Date): string {
  return d.toISOString().slice(0, 10)
}

interface DateRangePickerProps {
  preset: DateRangePreset
  from: Date
  to: Date
  onPresetChange: (preset: DateRangePreset) => void
  onCustomRangeChange: (from: Date, to: Date) => void
}

export function DateRangePicker({
  preset,
  from,
  to,
  onPresetChange,
  onCustomRangeChange,
}: DateRangePickerProps) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      {PRESETS.map((p) => (
        <button
          key={p.key}
          onClick={() => onPresetChange(p.key)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            preset === p.key
              ? 'bg-bonapp-accent text-white'
              : 'bg-white border border-gray-200 text-gray-700 hover:border-bonapp-accent'
          }`}
        >
          {p.label}
        </button>
      ))}
      {preset === 'custom' && (
        <div className="flex gap-2 items-center ml-2">
          <input
            type="date"
            aria-label="Дата начала"
            value={toInputValue(from)}
            onChange={(e) => onCustomRangeChange(new Date(e.target.value), to)}
            className="border border-gray-200 rounded-lg px-2 py-1 text-sm"
          />
          <span className="text-gray-400">—</span>
          <input
            type="date"
            aria-label="Дата окончания"
            value={toInputValue(to)}
            onChange={(e) => onCustomRangeChange(from, new Date(e.target.value))}
            className="border border-gray-200 rounded-lg px-2 py-1 text-sm"
          />
        </div>
      )}
    </div>
  )
}
