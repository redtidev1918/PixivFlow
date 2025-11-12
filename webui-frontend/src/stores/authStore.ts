import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Authentication state interface
 */
export interface AuthState {
  isAuthenticated: boolean;
  userId?: string;
  username?: string;
  token?: string;
  tokenExpiry?: number;
}

/**
 * Authentication actions interface
 */
export interface AuthActions {
  setAuth: (auth: Partial<AuthState>) => void;
  clearAuth: () => void;
  setToken: (token: string, expiry?: number) => void;
  checkTokenExpiry: () => boolean;
}

/**
 * Auth store type
 */
export type AuthStore = AuthState & AuthActions;

/**
 * Initial auth state
 */
const initialState: AuthState = {
  isAuthenticated: false,
};

/**
 * Auth store using Zustand with persistence
 * Persists auth state to localStorage
 */
export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      /**
       * Set authentication state
       */
      setAuth: (auth) =>
        set((state) => ({
          ...state,
          ...auth,
          isAuthenticated: auth.isAuthenticated ?? true,
        })),

      /**
       * Clear authentication state
       */
      clearAuth: () =>
        set({
          ...initialState,
        }),

      /**
       * Set token and expiry
       */
      setToken: (token, expiry) =>
        set({
          token,
          tokenExpiry: expiry,
          isAuthenticated: true,
        }),

      /**
       * Check if token is expired
       * @returns true if token is expired or missing
       */
      checkTokenExpiry: () => {
        const { tokenExpiry } = get();
        if (!tokenExpiry) return true;
        return Date.now() >= tokenExpiry;
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        userId: state.userId,
        username: state.username,
        token: state.token,
        tokenExpiry: state.tokenExpiry,
      }),
    }
  )
);

