export type ThemePreference = "system" | "light" | "dark";

export const themeStorageKey = "payvoke-theme";

export function readTheme(): ThemePreference {
  try {
    const stored = localStorage.getItem(themeStorageKey);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Private browsing may disable storage. System mode still works.
  }
  return "system";
}

export function applyTheme(preference: ThemePreference) {
  const mode =
    preference === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : preference;
  document.documentElement.dataset.mode = mode;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", mode === "dark" ? "#111c18" : "#f4f7f5");
}

// Runs before the document paints, so stored preferences do not flash the wrong theme.
export const themeScript = `(()=>{let p="system";try{p=localStorage.getItem("${themeStorageKey}")||p}catch{}const m=p==="dark"||p==="light"?p:matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.mode=m;document.querySelector('meta[name="theme-color"]')?.setAttribute("content",m==="dark"?"#111c18":"#f4f7f5")})()`;
