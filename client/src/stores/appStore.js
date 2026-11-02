import { create } from 'zustand';

export const useAppStore = create((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  clearUser: () => set({ user: null }),
  theme: localStorage.getItem('ChatWave-theme') || localStorage.getItem('GoodBros-theme') || 'dark',
  setTheme: (theme) => {
    localStorage.setItem('ChatWave-theme', theme);
    document.documentElement.dataset.theme = theme;
    set({ theme });
  }
}));
