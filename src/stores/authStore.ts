import { create } from 'zustand';
import { loadTokens, clearTokens, login as apiLogin } from '../api/client';
import { useComponentStore } from './componentStore';

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
    const store = useComponentStore.getState();
    if (token) {
      store.addLog('Session restored from stored token', 'info');
      set({ isAuthenticated: true, isLoading: false });
    } else {
      store.addLog('No session found — please sign in', 'info');
      set({ isAuthenticated: false, isLoading: false });
    }
  },

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    const store = useComponentStore.getState();
    store.addLog(`Attempting login for: ${email}`, 'info');
    try {
      const res = await apiLogin(email, password);
      if (res.success && res.data?.user) {
        store.addLog(`Login successful: ${res.data.user.name} (${res.data.user.role})`, 'success');
        set({ isAuthenticated: true, user: res.data.user, isLoading: false });
        return true;
      }
      store.addLog(`Login failed: ${res.message}`, 'error');
      set({ error: res.message || 'Login failed', isLoading: false });
      return false;
    } catch {
      store.addLog('Login failed: network error', 'error');
      set({ error: 'Network error. Please try again.', isLoading: false });
      return false;
    }
  },

  logout: () => {
    useComponentStore.getState().addLog('User logged out', 'info');
    clearTokens();
    set({ isAuthenticated: false, user: null });
  },

  clearError: () => set({ error: null }),
}));
