import { useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";
const KEY = "passport.theme";

export function getStoredTheme(): ThemeMode {
  return (localStorage.getItem(KEY) as ThemeMode) || "system";
}

function resolve(mode: ThemeMode): "light" | "dark" {
  if (mode === "system") return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  return mode;
}

export function applyTheme(mode: ThemeMode) {
  const resolved = resolve(mode);
  document.documentElement.classList.toggle("dark", resolved === "dark");
  const meta = document.querySelector('meta[name="theme-color"]:not([media])') as HTMLMetaElement | null;
  const color = resolved === "dark" ? "#000000" : "#0B5D67";
  if (meta) meta.content = color;
  else {
    const m = document.createElement("meta");
    m.name = "theme-color";
    m.content = color;
    document.head.appendChild(m);
  }
}

export function applyStoredTheme() {
  applyTheme(getStoredTheme());
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (getStoredTheme() === "system") applyTheme("system");
  });
}

export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>(getStoredTheme);
  useEffect(() => {
    localStorage.setItem(KEY, mode);
    applyTheme(mode);
  }, [mode]);
  return { mode, setMode, resolved: resolve(mode) };
}
