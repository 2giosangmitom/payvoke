"use client";

import { useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { applyTheme, readTheme, themeStorageKey } from "@/src/lib/theme";

export function ThemeToggle() {
  useEffect(() => {
    const sync = () => {
      applyTheme(readTheme());
    };
    sync();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    window.addEventListener("storage", sync);
    media.addEventListener("change", sync);
    return () => {
      window.removeEventListener("storage", sync);
      media.removeEventListener("change", sync);
    };
  }, []);

  const toggle = () => {
    const next = document.documentElement.dataset.mode === "dark" ? "light" : "dark";
    applyTheme(next);
    try {
      localStorage.setItem(themeStorageKey, next);
    } catch {
      // This visit still uses the selected theme.
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="theme-toggle"
      onClick={toggle}
      aria-label="Toggle light and dark mode"
      title="Toggle light and dark mode"
    >
      <Sun className="theme-sun-icon" size={19} aria-hidden="true" />
      <Moon className="theme-moon-icon" size={19} aria-hidden="true" />
    </Button>
  );
}
