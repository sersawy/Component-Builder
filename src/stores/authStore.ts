import { create } from 'zustand';
import { loadTokens, clearTokens, login as apiLogin } from '../api/client';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  isLoading: boolean;
  error: string | null;
  init: () => void;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  user: null,
  isLoading: true,
  error: null,

  init: () => {
    loadTokens();
    const token = localStorage.getItem('access_token');
    set({ isAuthenticated: !!token, isLoading: false });
  },

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const res = await apiLogin(email, password);
      if (res.success && res.data?.user) {
        set({ isAuthenticated: true, user: res.data.user, isLoading: false });
        return true;
      }
      set({ error: res.message || 'Login failed', isLoading: false });
      return false;
    } catch {
      set({ error: 'Network error. Please try again.', isLoading: false });
      return false;
    }
  },

  logout: () => {
    clearTokens();
    set({ isAuthenticated: false, user: null });
  },

  clearError: () => set({ error: null }),
}));
