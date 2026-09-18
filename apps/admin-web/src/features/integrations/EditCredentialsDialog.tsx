import { type FormEvent, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog } from '../../components/ui/Dialog';
import { updateTenantSettings } from '../../lib/api';
import { useToastStore } from '../../stores/toastStore';
import type { IntegrationConfig } from './integrationConfigs';

interface Props {
  open: boolean;
  onClose: () => void;
  config: IntegrationConfig;
  tenantId: string;
  initialValues?: Record<string, string>;
}

export function EditCredentialsDialog({ open, onClose, config, tenantId, initialValues = {} }: Props) {
  const qc = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const [values, setValues] = useState<Record<string, string>>(initialValues);
  const [showFields, setShowFields] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function handleClose() {
    setValues(initialValues);
    setError(null);
    onClose();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const dto: Record<string, string | number> = {};
      for (const f of config.fields) {
        if (values[f.key] !== undefined) {
          dto[f.key] = f.type === 'number' ? Number(values[f.key]) : values[f.key];
        }
      }
      await updateTenantSettings(tenantId, dto as any);
      await qc.invalidateQueries({ queryKey: ['integrations', 'status'] });
      addToast('Настройки сохранены', 'success');
      handleClose();
    } catch (err: any) {
      setError(err.message ?? 'Произошла ошибка');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} title={config.title}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {config.fields.map((field) => {
          const isPassword = field.type === 'password';
          const visible = showFields[field.key];
          const inputType = isPassword ? (visible ? 'text' : 'password') : field.type === 'number' ? 'number' : 'text';

          return (
            <div key={field.key} className="flex flex-col gap-1.5">
              <label
                htmlFor={`field-${field.key}`}
                className="text-sm font-medium text-gray-700"
              >
                {field.label}
              </label>

              {field.type === 'select' && field.options ? (
                <select
                  id={`field-${field.key}`}
                  value={values[field.key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bonapp-accent/30"
                >
                  <option value="">— выберите —</option>
                  {field.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="relative">
                  <input
                    id={`field-${field.key}`}
                    type={inputType}
                    value={values[field.key] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-bonapp-accent/30 pr-9"
                  />
                  {isPassword && (
                    <button
                      type="button"
                      aria-label={`${visible ? 'Скрыть' : 'Показать'} ${field.label}`}
                      onClick={() => setShowFields((s) => ({ ...s, [field.key]: !s[field.key] }))}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {visible ? '🙈' : '👁'}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {error && (
          <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={handleClose}
            className="text-sm font-medium px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={saving}
            className="text-sm font-medium px-4 py-2 rounded-lg bg-bonapp-accent text-white hover:bg-[#c94530] disabled:opacity-50"
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
