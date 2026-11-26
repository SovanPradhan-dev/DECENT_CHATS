import { create } from 'zustand';

const GLASS_DEFAULTS = { enabled: true, transparency: 50, blur: 50, liquidness: 50 };

function loadGlass() {
  try { return { ...GLASS_DEFAULTS, ...JSON.parse(localStorage.getItem('BroCode-glass') || '{}') }; }
  catch { return { ...GLASS_DEFAULTS }; }
}

function applyGlass(g) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const enabled = g.enabled !== false;
  const alphaMult = enabled ? Math.max(0.05, 1 - (g.transparency / 100) * 0.95) : 1.8;
  const blurMult = enabled ? (g.blur / 50) : 0;
  root.style.setProperty('--glass-alpha-mult', String(alphaMult));
  root.style.setProperty('--glass-blur-mult', String(blurMult));
  const scale = enabled ? (g.liquidness / 100) * 40 : 0;
  const fe = document.querySelector('#ios-liquid-glass feDisplacementMap');
  if (fe) fe.setAttribute('scale', String(scale));
  root.dataset.glass = enabled ? 'on' : 'off';
}

const initialGlass = loadGlass();
applyGlass(initialGlass);

export const useAppStore = create((set, get) => ({
  user: null,
  setUser: (user) => set({ user }),
  clearUser: () => set({ user: null }),
  theme: localStorage.getItem('BroCode-theme') || localStorage.getItem('GoodBros-theme') || 'dark',
  setTheme: (theme) => {
    localStorage.setItem('BroCode-theme', theme);
    document.documentElement.dataset.theme = theme;
    set({ theme });
  },
  glass: initialGlass,
  setGlass: (patch) => {
    const next = { ...get().glass, ...patch };
    localStorage.setItem('BroCode-glass', JSON.stringify(next));
    applyGlass(next);
    set({ glass: next });
  }
}));
