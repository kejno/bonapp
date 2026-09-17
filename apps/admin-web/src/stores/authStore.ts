import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { UserRole } from '@bonapp/shared-types';

interface AuthState {
  role: UserRole | null;
  setRole: (role: UserRole) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      role: null,
      setRole: (role) => set({ role }),
    }),
    { name: 'bonapp-auth' },
  ),
);
