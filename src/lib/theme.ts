/**
 * Day/night theme, held outside React so pages rendered outside the main
 * layout can drive it too. The login page is full-screen and deliberately
 * skips the nav (which is where the toggle normally lives), so without a
 * shared store its own toggle and the nav's would drift apart.
 *
 * The root component remains the only writer of `body[data-theme]` and of
 * localStorage — this module just carries the value between them.
 */
export type Theme = "dark" | "light";

export const THEME_STORAGE_KEY = "fava-theme";

let current: Theme = "light";
const listeners = new Set<(t: Theme) => void>();

/** Reads the persisted choice once, on the client. Safe to call repeatedly. */
export function loadStoredTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "dark" || saved === "light") current = saved;
  } catch {
    // Private mode / storage disabled — the default stands.
  }
  return current;
}

export function getTheme(): Theme {
  return current;
}

export function setTheme(next: Theme): void {
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener(next);
}

export function subscribeTheme(listener: (t: Theme) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
