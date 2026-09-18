import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DishEditDialog } from './DishEditDialog'

describe('DishEditDialog', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('saves an edited dish with PUT and invalidates the menu list', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const onSaved = vi.fn()

    render(<QueryClientProvider client={client}><DishEditDialog dishId="dish-1" initialValues={{ name: 'Драники', category: 'Горячие блюда', price: 12, cost: 4, weight: 250, kitchen: 'HOT', preparationTime: 15, isActive: true, isHit: false, allergens: [], posItemId: '', modifierGroups: [] }} onClose={vi.fn()} onSaved={onSaved} /></QueryClientProvider>)

    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Драники с грибами' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/admin/menu/items/dish-1', expect.objectContaining({ method: 'PUT' })))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['menu-items'] })
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ name: 'Драники с грибами' }))
  })
})
