import { create } from 'zustand'

export type GuestSession = {
  tenantId: string
  tableId: string
  tableNumber: string
  brandColor: string
  logoUrl: string | null
  tenantName: string
}

type GuestSessionState = {
  session: GuestSession | null
  setSession: (session: GuestSession) => void
  clearSession: () => void
}

export const useGuestSessionStore = create<GuestSessionState>((set) => ({
  session: null,
  setSession: (session) => set({ session }),
  clearSession: () => set({ session: null }),
}))
