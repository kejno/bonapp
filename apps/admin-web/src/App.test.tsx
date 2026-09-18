import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders tables grouped by zone and filters them when a zone is selected', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: 'Схема зала и QR-генератор' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Основной зал/i })).toBeInTheDocument()
    expect(screen.getByText('Стол 1')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Терраса/i }))

    expect(screen.getByText('Стол 5')).toBeInTheDocument()
    expect(screen.queryByText('Стол 1')).not.toBeInTheDocument()
  })

  it('adds a table from the form and shows its details on click', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /Добавить стол/i }))
    fireEvent.change(screen.getByLabelText('Номер стола'), { target: { value: '12' } })
    fireEvent.change(screen.getByLabelText('Метка'), { target: { value: 'У окна' } })
    fireEvent.change(screen.getByLabelText('Количество мест'), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Создать стол' }))

    fireEvent.click(screen.getByText('Стол 12'))

    expect(screen.getByRole('dialog', { name: 'Стол 12' })).toHaveTextContent('У окна')
    expect(screen.getByRole('button', { name: 'Открыть заказ' })).toBeInTheDocument()
  })

  it('selects tables for QR printing and requests a PDF', () => {
    render(<App />)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 500 }))

    fireEvent.click(screen.getByRole('button', { name: 'Распечатать QR' }))
    fireEvent.click(screen.getByLabelText('Стол 1'))
    fireEvent.click(screen.getByRole('button', { name: 'Скачать PDF (1)' }))

    expect(screen.getByRole('button', { name: 'Скачать PDF (1)' })).toBeEnabled()
    expect(fetchMock).toHaveBeenCalledWith('/api/tables/generate-qr-pdf', expect.objectContaining({ method: 'POST' }))
    fetchMock.mockRestore()
  })
})
