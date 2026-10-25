import { useSyncExternalStore } from "react";

export type ThemeMode = "light" | "dark";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-mode"] });
  return () => observer.disconnect();
}

const read = (): ThemeMode =>
  document.documentElement.dataset.mode === "dark" ? "dark" : "light";

/** The resolved light/dark mode, kept in sync with the theme toggle. */
export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribe, read, () => "dark");
}
