import { create } from "zustand";
import {
  parseForwardRoute,
  buildForwardRoute,
  type ForwardRoute,
} from "../forward-route.js";
import type { Locale } from "../i18n.js";

type Theme = "dark" | "light";
type DetailTab = "operations" | "intelligence" | "data";

interface UiStoreState {
  route: ForwardRoute;
  theme: Theme;
  locale: Locale;
  detailTab: DetailTab;
  sidebarCollapsed: boolean;
  showConnectForm: boolean;

  /** Navigate by updating the hash — hashchange listener updates route automatically */
  navigate: (route: ForwardRoute) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  setDetailTab: (tab: DetailTab) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setShowConnectForm: (show: boolean) => void;
}

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem("conitens-theme");
    if (stored === "light") return "light";
  } catch {
    // localStorage unavailable
  }
  return "dark";
}

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem("conitens-theme", theme);
  } catch {
    // localStorage unavailable
  }
}

function readStoredLocale(): Locale {
  try {
    const stored = localStorage.getItem("conitens-locale");
    if (stored === "en") return "en";
  } catch {
    // localStorage unavailable
  }
  return "ko";
}

function applyLocale(locale: Locale): void {
  document.documentElement.lang = locale;
  try {
    localStorage.setItem("conitens-locale", locale);
  } catch {
    // localStorage unavailable
  }
}

export const useUiStore = create<UiStoreState>((set, get) => {
  // Initialize route from current hash
  const initialRoute = parseForwardRoute(window.location.hash);

  // Set default hash if none
  if (!window.location.hash) {
    window.location.hash = buildForwardRoute({
      screen: "overview",
      runId: null,
      taskId: null,
      workspaceId: null,
      threadId: null,
      agentId: null,
    });
  }

  // Listen to hashchange
  window.addEventListener("hashchange", () => {
    set({ route: parseForwardRoute(window.location.hash) });
  });

  // Apply initial theme
  const initialTheme = readStoredTheme();
  applyTheme(initialTheme);
  const initialLocale = readStoredLocale();
  applyLocale(initialLocale);

  return {
    route: initialRoute,
    theme: initialTheme,
    locale: initialLocale,
    detailTab: "operations",
    sidebarCollapsed: false,
    showConnectForm: false,

    navigate: (route) => {
      window.location.hash = buildForwardRoute(route);
    },

    setTheme: (theme) => {
      applyTheme(theme);
      set({ theme });
    },

    toggleTheme: () => {
      const next = get().theme === "dark" ? "light" : "dark";
      applyTheme(next);
      set({ theme: next });
    },

    setLocale: (locale) => {
      applyLocale(locale);
      set({ locale });
    },

    toggleLocale: () => {
      const next = get().locale === "ko" ? "en" : "ko";
      applyLocale(next);
      set({ locale: next });
    },

    setDetailTab: (tab) => set({ detailTab: tab }),
    setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
    setShowConnectForm: (show) => set({ showConnectForm: show }),
  };
});
