"use client";

import { useEffect } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { applyTheme, readTheme, themeStorageKey } from "@/src/lib/theme";

export function ThemeToggle() {
  useEffect(() => {
    const sync = () => applyTheme(readTheme());
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
      className="relative hover:text-primary"
      onClick={toggle}
      aria-label="Toggle light and dark mode"
      title="Toggle light and dark mode"
    >
      <Sun
        aria-hidden="true"
        className="absolute size-[19px] transition-[opacity,rotate,scale] duration-200 dark:scale-75 dark:rotate-90 dark:opacity-0"
      />
      <Moon
        aria-hidden="true"
        className="absolute size-[19px] scale-75 rotate-90 opacity-0 transition-[opacity,rotate,scale] duration-200 dark:scale-100 dark:rotate-0 dark:opacity-100"
      />
    </Button>
  );
}
