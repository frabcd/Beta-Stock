import { create } from 'zustand';

export type ThemeMode = 'dark' | 'light';
export type GainConvention = 'green-up' | 'red-up';

interface AppState {
  theme: ThemeMode;
  gainConvention: GainConvention;
  commandOpen: boolean;
  mobileTicketOpen: boolean;
  selectedSymbol: string;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
  setGainConvention: (convention: GainConvention) => void;
  setCommandOpen: (open: boolean) => void;
  setMobileTicketOpen: (open: boolean) => void;
  setSelectedSymbol: (symbol: string) => void;
}

const readPreference = <T extends string>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  return (window.localStorage.getItem(key) as T | null) ?? fallback;
};

export const useAppStore = create<AppState>((set) => ({
  theme: readPreference<ThemeMode>('beta-stock-theme', 'dark'),
  gainConvention: readPreference<GainConvention>('beta-stock-gain', 'green-up'),
  commandOpen: false,
  mobileTicketOpen: false,
  selectedSymbol: 'NVDA',
  setTheme: (theme) => {
    window.localStorage.setItem('beta-stock-theme', theme);
    set({ theme });
  },
  toggleTheme: () => set((state) => {
    const theme = state.theme === 'dark' ? 'light' : 'dark';
    window.localStorage.setItem('beta-stock-theme', theme);
    return { theme };
  }),
  setGainConvention: (gainConvention) => {
    window.localStorage.setItem('beta-stock-gain', gainConvention);
    set({ gainConvention });
  },
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  setMobileTicketOpen: (mobileTicketOpen) => set({ mobileTicketOpen }),
  setSelectedSymbol: (selectedSymbol) => set({ selectedSymbol }),
}));
