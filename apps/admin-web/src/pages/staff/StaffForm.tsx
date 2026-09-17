import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import type { StaffMemberDto } from '@bonapp/shared-types'

const ROLE_DESCRIPTIONS: Record<string, string> = {
  WAITER:
    'Видит только KDS и свои столы. Не управляет сотрудниками, сменами, меню, отчётами и настройками.',
  CASHIER:
    'Полный доступ к кассе и сменам. Не управляет сотрудниками, меню, отчётами и настройками.',
  MANAGER:
    'Полный доступ к меню, столам и отчётам, кроме системных настроек. Может управлять сотрудниками и открывать/закрывать смены.',
  ADMIN:
    'Полный доступ, включая настройки тенанта и управление сотрудниками; также может открывать/закрывать смены.',
}

const createSchema = z.object({
  name: z.string().min(1, 'Обязательное поле'),
  role: z.enum(['WAITER', 'CASHIER', 'MANAGER', 'ADMIN']),
  phone: z.string().min(1, 'Обязательное поле'),
  temporaryPassword: z.string().min(6, 'Минимум 6 символов'),
})

const editSchema = z.object({
  name: z.string().min(1, 'Обязательное поле'),
  role: z.enum(['WAITER', 'CASHIER', 'MANAGER', 'ADMIN']),
  phone: z.string().min(1, 'Обязательное поле'),
})

type CreateValues = z.infer<typeof createSchema>
type EditValues = z.infer<typeof editSchema>

interface Props {
  member: StaffMemberDto | null
  onClose: () => void
  onSave: (values: CreateValues | EditValues) => Promise<void>
}

export function StaffForm({ member, onClose, onSave }: Props) {
  const isCreate = member === null
  const schema = isCreate ? createSchema : editSchema

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateValues>({
    resolver: zodResolver(schema),
    defaultValues: member
      ? { name: member.name, role: member.role, phone: member.phone }
      : { name: '', role: 'WAITER', phone: '', temporaryPassword: '' },
  })

  const selectedRole = watch('role')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
        <h2 className="mb-4 text-lg font-semibold">
          {isCreate ? 'Добавить сотрудника' : 'Редактировать сотрудника'}
        </h2>
        <form onSubmit={handleSubmit(onSave)} noValidate>
          <div className="mb-3">
            <label className="mb-1 block text-sm font-medium">Имя</label>
            <input
              {...register('name')}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="Имя сотрудника"
            />
            {errors.name && (
              <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
            )}
          </div>

          <div className="mb-3">
            <label className="mb-1 block text-sm font-medium">Роль</label>
            <select
              {...register('role')}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            >
              {Object.keys(ROLE_DESCRIPTIONS).map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            {selectedRole && (
              <p className="mt-1 text-xs text-gray-500">{ROLE_DESCRIPTIONS[selectedRole]}</p>
            )}
          </div>

          <div className="mb-3">
            <label className="mb-1 block text-sm font-medium">Телефон</label>
            <input
              {...register('phone')}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="+375 XX XXX XX XX"
            />
            {errors.phone && (
              <p className="mt-1 text-xs text-red-600">{errors.phone.message}</p>
            )}
          </div>

          {isCreate && (
            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium">Временный пароль</label>
              <input
                {...register('temporaryPassword')}
                type="password"
                className="w-full rounded-lg border px-3 py-2 text-sm"
                placeholder="Минимум 6 символов"
              />
              {errors.temporaryPassword && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.temporaryPassword.message}
                </p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border px-4 py-2 text-sm"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-bonapp-accent px-4 py-2 text-sm text-white disabled:opacity-60"
            >
              {isSubmitting ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
