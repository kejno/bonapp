import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { OnboardingStep1 } from './features/onboarding/OnboardingStep1'

const queryClient = new QueryClient()

function App() {
  const [step, setStep] = useState(1)

  return (
    <QueryClientProvider client={queryClient}>
      {step === 1 ? <OnboardingStep1 onComplete={() => setStep(2)} /> : <OnboardingStep2 />}
    </QueryClientProvider>
  )
}

function OnboardingStep2() {
  return <main className="flex min-h-svh items-center justify-center bg-bonapp-bg"><section className="rounded-xl bg-white p-8 text-center shadow-sm"><p className="text-sm font-medium text-bonapp-accent">Шаг 2 из 4</p><h1 className="mt-2 text-2xl font-semibold">Настройка меню</h1></section></main>
}

export default App
