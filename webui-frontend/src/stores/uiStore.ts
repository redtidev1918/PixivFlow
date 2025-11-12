import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * UI theme type
 */
export type Theme = 'light' | 'dark' | 'auto';

/**
 * UI state interface
 */
export interface UIState {
  theme: Theme;
  sidebarCollapsed: boolean;
  language: string;
  compactMode: boolean;
  tablePageSize: number;
}

/**
 * UI actions interface
 */
export interface UIActions {
  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setLanguage: (language: string) => void;
  setCompactMode: (compact: boolean) => void;
  setTablePageSize: (size: number) => void;
}

/**
 * UI store type
 */
export type UIStore = UIState & UIActions;

/**
 * Initial UI state
 */
const initialState: UIState = {
  theme: 'auto',
  sidebarCollapsed: false,
  language: 'zh-CN',
  compactMode: false,
  tablePageSize: 20,
};

/**
 * UI store using Zustand with persistence
 * Persists UI preferences to localStorage
 */
export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      ...initialState,

      /**
       * Set theme
       */
      setTheme: (theme) => set({ theme }),

      /**
       * Toggle sidebar collapsed state
       */
      toggleSidebar: () =>
        set((state) => ({
          sidebarCollapsed: !state.sidebarCollapsed,
        })),

      /**
       * Set sidebar collapsed state
       */
      setSidebarCollapsed: (collapsed) =>
        set({
          sidebarCollapsed: collapsed,
        }),

      /**
       * Set language
       */
      setLanguage: (language) => set({ language }),

      /**
       * Set compact mode
       */
      setCompactMode: (compact) => set({ compactMode: compact }),

      /**
       * Set table page size
       */
      setTablePageSize: (size) => set({ tablePageSize: size }),
    }),
    {
      name: 'ui-storage',
      partialize: (state) => ({
        theme: state.theme,
        sidebarCollapsed: state.sidebarCollapsed,
        language: state.language,
        compactMode: state.compactMode,
        tablePageSize: state.tablePageSize,
      }),
    }
  )
);

