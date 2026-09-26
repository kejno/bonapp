import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import RegisterPage from './RegisterPage'
import { useAuthStore } from '../auth/auth.store'

afterEach(() => { cleanup(); useAuthStore.getState().clearAuth(); vi.unstubAllGlobals() })

describe('RegisterPage', () => {
  it('submits venue details, stores auth and navigates to onboarding', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ tenantId: 'tenant-1', accessToken: 'token', user: { id: 'u1', email: 'owner@example.com', role: 'OWNER', tenantId: 'tenant-1', fullName: 'Кафе' } }) }))
    render(<MemoryRouter initialEntries={['/register']}><Routes><Route path="/register" element={<RegisterPage />} /><Route path="/onboarding" element={<h1>Настройка заведения</h1>} /></Routes></MemoryRouter>)
    fireEvent.change(screen.getByLabelText('Название заведения'), { target: { value: 'Кафе' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'owner@example.com' } })
    fireEvent.change(screen.getByLabelText('Телефон'), { target: { value: '+375291234567' } })
    fireEvent.change(screen.getByLabelText('Тип заведения'), { target: { value: 'CAFE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Начать 14-дневный триал' }))
    await screen.findByRole('heading', { name: 'Настройка заведения' })
    expect(useAuthStore.getState().accessToken).toBe('token')
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/public/tenants/register'), expect.objectContaining({ method: 'POST' }))
  })
})
