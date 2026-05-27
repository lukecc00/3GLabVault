"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = Exclude<ThemeMode, "system">;

const STORAGE_KEY = "3glabvault-theme";
const MEDIA_QUERY = "(prefers-color-scheme: dark)";

type ThemeContextValue = {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  hydrated: boolean;
  setTheme: (theme: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") {
    return "dark";
  }

  return window.matchMedia(MEDIA_QUERY).matches ? "dark" : "light";
}

function resolveTheme(theme: ThemeMode): ResolvedTheme {
  return theme === "system" ? getSystemTheme() : theme;
}

function applyTheme(theme: ThemeMode) {
  if (typeof document === "undefined") {
    return resolveTheme(theme);
  }

  const resolvedTheme = resolveTheme(theme);
  const root = document.documentElement;

  root.dataset.theme = resolvedTheme;
  root.dataset.themeMode = theme;
  root.style.colorScheme = resolvedTheme;

  return resolvedTheme;
}

function readStoredTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "system";
  }

  const storedTheme = window.localStorage.getItem(STORAGE_KEY);
  return storedTheme === "light" || storedTheme === "dark" || storedTheme === "system"
    ? storedTheme
    : "system";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("dark");
  const [hydrated, setHydrated] = useState(false);

  const setTheme = useCallback((nextTheme: ThemeMode) => {
    setThemeState(nextTheme);
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
    setResolvedTheme(applyTheme(nextTheme));
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const initialTheme = readStoredTheme();
      setThemeState(initialTheme);
      setResolvedTheme(applyTheme(initialTheme));
      setHydrated(true);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (!hydrated || theme !== "system") {
      return;
    }

    const mediaQuery = window.matchMedia(MEDIA_QUERY);
    const frame = window.requestAnimationFrame(() => {
      setResolvedTheme(applyTheme("system"));
    });

    const updateResolvedTheme = () => {
      if (theme === "system") {
        setResolvedTheme(applyTheme("system"));
      }
    };

    mediaQuery.addEventListener("change", updateResolvedTheme);

    return () => {
      window.cancelAnimationFrame(frame);
      mediaQuery.removeEventListener("change", updateResolvedTheme);
    };
  }, [hydrated, theme]);

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      hydrated,
      setTheme,
    }),
    [hydrated, resolvedTheme, setTheme, theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
}
