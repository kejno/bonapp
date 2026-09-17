import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { StaffMemberDto, CloseShiftResultDto } from '@bonapp/shared-types'
import { staffApi } from '../../api/staff'
import { shiftsApi } from '../../api/shifts'
import { StaffForm } from './StaffForm'
import { ShiftBlock } from './ShiftBlock'
import { CloseShiftModal } from './CloseShiftModal'
import { OpenShiftModal } from './OpenShiftModal'

const ROLE_LABELS: Record<string, string> = {
  WAITER: 'Официант',
  CASHIER: 'Кассир',
  MANAGER: 'Менеджер',
  ADMIN: 'Администратор',
}

export function StaffPage() {
  const qc = useQueryClient()
  const [formMember, setFormMember] = useState<StaffMemberDto | null | undefined>(undefined)
  const [closeShiftOpen, setCloseShiftOpen] = useState(false)
  const [openShiftOpen, setOpenShiftOpen] = useState(false)

  const { data: staff = [], isLoading: staffLoading } = useQuery({
    queryKey: ['staff'],
    queryFn: staffApi.getAll,
  })

  const { data: shift } = useQuery({
    queryKey: ['shift', 'current'],
    queryFn: shiftsApi.getCurrent,
  })

  const createMutation = useMutation({
    mutationFn: staffApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff'] })
      setFormMember(undefined)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof staffApi.update>[1] }) =>
      staffApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff'] })
      setFormMember(undefined)
    },
  })

  const deactivateMutation = useMutation({
    mutationFn: staffApi.deactivate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
  })

  const openShiftMutation = useMutation({
    mutationFn: shiftsApi.open,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shift', 'current'] })
      setOpenShiftOpen(false)
    },
  })

  const closeShiftMutation = useMutation({
    mutationFn: shiftsApi.close,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shift', 'current'] })
    },
  })

  async function handleSave(values: Record<string, unknown>) {
    if (formMember === null) {
      await createMutation.mutateAsync(values as Parameters<typeof staffApi.create>[0])
    } else if (formMember) {
      await updateMutation.mutateAsync({
        id: formMember.id,
        data: values as Parameters<typeof staffApi.update>[1],
      })
    }
  }

  async function handleCloseShift(shiftId: string): Promise<CloseShiftResultDto> {
    return closeShiftMutation.mutateAsync(shiftId)
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Сотрудники</h1>
        <button
          type="button"
          onClick={() => setFormMember(null)}
          className="rounded-lg bg-bonapp-accent px-4 py-2 text-sm text-white"
        >
          Добавить
        </button>
      </div>

      <ShiftBlock
        shift={shift ?? null}
        staff={staff}
        onOpenShift={() => setOpenShiftOpen(true)}
        onCloseShift={() => setCloseShiftOpen(true)}
      />

      {staffLoading ? (
        <p className="text-sm text-gray-500">Загрузка…</p>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Имя</th>
                <th className="px-4 py-3">Роль</th>
                <th className="px-4 py-3">Телефон</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3">Последний вход</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {staff.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                    Сотрудники не добавлены
                  </td>
                </tr>
              )}
              {staff.map((member) => (
                <tr key={member.id} className="border-t first:border-t-0">
                  <td className="px-4 py-3 font-medium">{member.name}</td>
                  <td className="px-4 py-3">{ROLE_LABELS[member.role] ?? member.role}</td>
                  <td className="px-4 py-3">{member.phone}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        member.isActive
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {member.isActive ? 'Активен' : 'Неактивен'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {member.lastLoginAt
                      ? new Date(member.lastLoginAt).toLocaleString('ru-BY', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })
                      : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setFormMember(member)}
                        className="text-xs text-bonapp-accent underline-offset-2 hover:underline"
                      >
                        Редактировать
                      </button>
                      {member.isActive && (
                        <button
                          type="button"
                          onClick={() => deactivateMutation.mutate(member.id)}
                          className="text-xs text-gray-500 underline-offset-2 hover:underline"
                        >
                          Деактивировать
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formMember !== undefined && (
        <StaffForm
          member={formMember}
          onClose={() => setFormMember(undefined)}
          onSave={handleSave}
        />
      )}

      {closeShiftOpen && shift && (
        <CloseShiftModal
          shift={shift}
          onConfirm={handleCloseShift}
          onClose={() => setCloseShiftOpen(false)}
        />
      )}

      {openShiftOpen && (
        <OpenShiftModal
          staff={staff}
          onOpen={(cashierId) => openShiftMutation.mutateAsync({ cashierId })}
          onClose={() => setOpenShiftOpen(false)}
        />
      )}
    </div>
  )
}
