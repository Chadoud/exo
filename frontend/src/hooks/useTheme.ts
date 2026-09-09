import { useState, useEffect } from "react";
import { THEME_STORAGE_KEY } from "../constants";

export type Theme = "dark" | "light";

export function useTheme() {
  // Light is the product default; a stored preference still wins.
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const raw = localStorage.getItem(THEME_STORAGE_KEY);
      return raw === "dark" || raw === "light" ? raw : "light";
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return { theme, toggleTheme };
}
