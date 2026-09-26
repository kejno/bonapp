import { create } from 'zustand'

export type GuestSessionState = {
  tenantId: string
  tableId: string
  tableNumber: number
  brandColor: string
  logoUrl: string | null
}

type GuestSessionStore = {
  session: GuestSessionState | null
  setSession: (session: GuestSessionState) => void
  clearSession: () => void
}

export const useGuestSessionStore = create<GuestSessionStore>((set) => ({
  session: null,
  setSession: (session) => set({ session }),
  clearSession: () => set({ session: null }),
}))
