import { useState } from 'react'

type PaymentMethod = 'oplati' | 'erip' | 'card'

const paymentMethods: { id: PaymentMethod; label: string }[] = [
  { id: 'oplati', label: 'Оплати™' },
  { id: 'erip', label: 'ЕРИП' },
  { id: 'card', label: 'Карта' },
]

const qrCells = Array.from({ length: 121 }, (_, index) => {
  const row = Math.floor(index / 11)
  const column = index % 11
  const finder =
    (row < 3 && column < 3) ||
    (row < 3 && column > 7) ||
    (row > 7 && column < 3)
  return finder || (row * 7 + column * 5) % 3 === 0
})

function QrCode() {
  return (
    <svg
      aria-label="QR-код для оплаты через Оплати™"
      className="h-56 w-56 rounded-xl bg-white p-4 shadow-sm"
      role="img"
      viewBox="0 0 11 11"
    >
      <title>QR-код для оплаты через Оплати™</title>
      {qrCells.map((filled, index) =>
        filled ? (
          <rect
            fill="currentColor"
            height="1"
            key={index}
            width="1"
            x={index % 11}
            y={Math.floor(index / 11)}
          />
        ) : null,
      )}
    </svg>
  )
}

function OplatiPanel({ orderId }: { orderId: string }) {
  return (
    <section
      aria-live="polite"
      className="flex flex-col items-center gap-5 text-center"
    >
      <QrCode />
      <div>
        <p className="font-semibold text-stone-900">
          Отсканируйте QR-код в приложении Оплати™
        </p>
        <p className="mt-2 flex items-center justify-center gap-2 text-sm text-stone-500">
          <span
            aria-hidden="true"
            className="inline-block size-2 animate-pulse rounded-full bg-bonapp-accent"
          />
          Ожидаем подтверждение оплаты
        </p>
      </div>
      <a
        className="w-full rounded-xl bg-bonapp-accent px-4 py-3 text-center font-semibold text-white"
        href={`oplati://pay/${orderId}`}
      >
        Открыть приложение
      </a>
    </section>
  )
}

function EripPanel() {
  return (
    <section className="space-y-5">
      <div className="rounded-xl bg-stone-100 p-4 text-center">
        <p className="text-sm text-stone-500">Код E-POS</p>
        <p className="mt-1 text-2xl font-bold tracking-widest text-stone-900">
          1234-5678
        </p>
      </div>
      <ol className="space-y-3 text-sm text-stone-700">
        <li>1. Откройте приложение вашего банка</li>
        <li>2. Выберите оплату через ЕРИП</li>
        <li>3. Перейдите в раздел E-POS</li>
        <li>4. Введите код E-POS</li>
        <li>5. Проверьте сумму и подтвердите оплату</li>
      </ol>
    </section>
  )
}

function CardPanel() {
  return (
    <section className="space-y-4 text-center">
      <p className="text-sm text-stone-600">
        Оплата картой проходит в защищённом окне bePaid.
      </p>
      <button
        className="w-full rounded-xl bg-bonapp-accent px-4 py-3 font-semibold text-white"
        type="button"
      >
        Оплатить картой
      </button>
      <p className="text-xs text-stone-500">
        Apple Pay и Google Pay доступны, если поддерживаются устройством.
      </p>
    </section>
  )
}

export function PaymentPage({
  orderId,
  availableMethods = paymentMethods,
}: {
  orderId: string
  availableMethods?: typeof paymentMethods
}) {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>(
    availableMethods[0]?.id ?? 'oplati',
  )

  return (
    <main className="min-h-svh bg-bonapp-bg px-4 py-8 text-stone-800">
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-semibold">Счёт и оплата</h1>
        <section
          aria-label="Сумма заказа"
          className="mt-6 rounded-xl bg-white p-5 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-stone-600">К оплате</span>
            <strong className="text-xl">25,00 BYN</strong>
          </div>
          <p className="mt-3 text-sm text-stone-500">
            Чаевые временно недоступны до подтверждения фискального учёта.
          </p>
        </section>
        {availableMethods.length === 0 ? (
          <p className="mt-6 rounded-xl bg-white p-5 text-center text-stone-600">
            Онлайн-оплата недоступна. Пожалуйста, оплатите счёт у официанта
          </p>
        ) : (
          <section
            aria-label="Способ оплаты"
            className="mt-6 rounded-xl bg-white p-5 shadow-sm"
          >
            <div className="grid grid-cols-3 gap-2" role="tablist">
              {availableMethods.map((method) => (
                <button
                  aria-selected={selectedMethod === method.id}
                  className={`rounded-xl px-2 py-2 text-sm font-semibold ${selectedMethod === method.id ? 'bg-bonapp-accent text-white' : 'bg-stone-100 text-stone-700'}`}
                  key={method.id}
                  onClick={() => setSelectedMethod(method.id)}
                  role="tab"
                  type="button"
                >
                  {method.label}
                </button>
              ))}
            </div>
            <div className="mt-6">
              {selectedMethod === 'oplati' && <OplatiPanel orderId={orderId} />}
              {selectedMethod === 'erip' && <EripPanel />}
              {selectedMethod === 'card' && <CardPanel />}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}

function App() {
  const match = window.location.pathname.match(/^\/order\/([^/]+)\/pay$/)
  return match ? (
    <PaymentPage orderId={match[1]} />
  ) : (
    <main className="flex min-h-svh items-center justify-center bg-bonapp-bg">
      <h1 className="text-2xl font-semibold text-bonapp-accent">
        Bonapp — Guest
      </h1>
    </main>
  )
}

export default App
