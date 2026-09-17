import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { StaffPage } from './StaffPage'
import { staffApi } from '../../api/staff'
import { shiftsApi } from '../../api/shifts'
import type { StaffMemberDto, ShiftDto } from '@bonapp/shared-types'

vi.mock('../../api/staff')
vi.mock('../../api/shifts')

const mockStaff = vi.mocked(staffApi)
const mockShifts = vi.mocked(shiftsApi)

const member1: StaffMemberDto = {
  id: 'id-1',
  name: 'Иван Иванов',
  role: 'WAITER',
  phone: '+375291234567',
  isActive: true,
  lastLoginAt: null,
  createdAt: '2026-09-17T00:00:00.000Z',
}

const member2: StaffMemberDto = {
  id: 'id-2',
  name: 'Анна Кассир',
  role: 'CASHIER',
  phone: '+375297654321',
  isActive: false,
  lastLoginAt: '2026-09-16T10:00:00.000Z',
  createdAt: '2026-09-16T00:00:00.000Z',
}

const openShift: ShiftDto = {
  id: 'shift-1',
  openedAt: '2026-09-17T08:00:00.000Z',
  closedAt: null,
  cashier: { id: 'id-2', name: 'Анна Кассир' },
  ordersCount: 5,
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/staff']}>
        <StaffPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('StaffPage', () => {
  describe('staff table', () => {
    it('shows loading then renders table with staff members', async () => {
      mockStaff.getAll.mockResolvedValue([member1, member2])
      mockShifts.getCurrent.mockResolvedValue(null)

      renderPage()

      await waitFor(() => {
        expect(screen.getByText('Иван Иванов')).toBeInTheDocument()
      })
      expect(screen.getByText('Анна Кассир')).toBeInTheDocument()
    })

    it('shows both active and inactive status badges for multiple members', async () => {
      mockStaff.getAll.mockResolvedValue([member1, member2])
      mockShifts.getCurrent.mockResolvedValue(null)

      renderPage()

      await waitFor(() => {
        expect(screen.getByText('Активен')).toBeInTheDocument()
      })
      expect(screen.getByText('Неактивен')).toBeInTheDocument()
    })

    it('shows empty state when no staff members', async () => {
      mockStaff.getAll.mockResolvedValue([])
      mockShifts.getCurrent.mockResolvedValue(null)

      renderPage()

      await waitFor(() => {
        expect(screen.getByText('Сотрудники не добавлены')).toBeInTheDocument()
      })
    })

    it('shows Деактивировать only for active members', async () => {
      mockStaff.getAll.mockResolvedValue([member1, member2])
      mockShifts.getCurrent.mockResolvedValue(null)

      renderPage()

      await waitFor(() => {
        expect(screen.getByText('Иван Иванов')).toBeInTheDocument()
      })

      const deactivateButtons = screen.getAllByText('Деактивировать')
      expect(deactivateButtons).toHaveLength(1)
    })

    it('calls staffApi.deactivate when Деактивировать is clicked', async () => {
      mockStaff.getAll.mockResolvedValue([member1])
      mockShifts.getCurrent.mockResolvedValue(null)
      mockStaff.deactivate.mockResolvedValue({ ...member1, isActive: false })

      renderPage()

      await waitFor(() => screen.getByText('Деактивировать'))
      fireEvent.click(screen.getByText('Деактивировать'))

      await waitFor(() => {
        expect(mockStaff.deactivate).toHaveBeenCalled()
        expect(mockStaff.deactivate.mock.calls[0][0]).toBe('id-1')
      })
    })
  })

  describe('shift block', () => {
    it('shows "Смена не открыта" when no current shift', async () => {
      mockStaff.getAll.mockResolvedValue([])
      mockShifts.getCurrent.mockResolvedValue(null)

      renderPage()

      await waitFor(() => {
        expect(screen.getByText('Смена не открыта')).toBeInTheDocument()
      })
    })

    it('shows shift details when shift is open', async () => {
      mockStaff.getAll.mockResolvedValue([member2])
      mockShifts.getCurrent.mockResolvedValue(openShift)

      renderPage()

      await waitFor(() => {
        expect(screen.getAllByText('Анна Кассир').length).toBeGreaterThanOrEqual(1)
      })
      expect(screen.getByText('5')).toBeInTheDocument()
      expect(screen.getByText('Закрыть смену')).toBeInTheDocument()
    })

    it('shows "Открыть смену" button when no shift', async () => {
      mockStaff.getAll.mockResolvedValue([member1])
      mockShifts.getCurrent.mockResolvedValue(null)

      renderPage()

      await waitFor(() => {
        expect(screen.getByText('Открыть смену')).toBeInTheDocument()
      })
    })
  })

  describe('staff form', () => {
    it('opens add form on Добавить click', async () => {
      mockStaff.getAll.mockResolvedValue([])
      mockShifts.getCurrent.mockResolvedValue(null)

      renderPage()

      await waitFor(() => screen.getByText('Добавить'))
      fireEvent.click(screen.getByText('Добавить'))

      expect(screen.getByText('Добавить сотрудника')).toBeInTheDocument()
      expect(screen.getByText('Временный пароль')).toBeInTheDocument()
    })

    it('opens edit form without password field on Редактировать click', async () => {
      mockStaff.getAll.mockResolvedValue([member1])
      mockShifts.getCurrent.mockResolvedValue(null)

      renderPage()

      await waitFor(() => screen.getByText('Редактировать'))
      fireEvent.click(screen.getByText('Редактировать'))

      expect(screen.getByText('Редактировать сотрудника')).toBeInTheDocument()
      expect(screen.queryByText('Временный пароль')).not.toBeInTheDocument()
    })
  })
})
