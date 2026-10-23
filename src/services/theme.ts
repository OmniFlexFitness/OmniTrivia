import { useEffect, useSyncExternalStore } from "react";

/**
 * How the whole app is dressed: the everyday neon grid, or Code Red — the
 * Halloween look, blood red and pumpkin on black, with the decorations.
 *
 * The host owns it. Their window sets it, the snapshot carries it, and every
 * other window — the projector, the remote, each player's phone — paints
 * whatever the host's snapshot says. Nothing about the game changes with it:
 * it is colours, a few decorations and some copy, never a rule.
 *
 * The colours themselves are CSS custom properties in `index.html`, switched by
 * `data-theme` on <html>, so one attribute repaints every screen at once
 * without a component having to know which theme is on.
 */
export type Theme = "neon" | "code-red";

export const DEFAULT_THEME: Theme = "neon";

const PREFERENCE_KEY = "omnitrivia:theme";

export const isTheme = (value: unknown): value is Theme =>
  value === "neon" || value === "code-red";

/** What this host chose last time. Neon unless they switched Code Red on. */
export const readThemePreference = (): Theme => {
  try {
    const saved = window.localStorage.getItem(PREFERENCE_KEY);
    return isTheme(saved) ? saved : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
};

export const saveThemePreference = (theme: Theme): void => {
  try {
    window.localStorage.setItem(PREFERENCE_KEY, theme);
  } catch {
    // Private mode: the theme still applies to this game.
  }
};

/* ------------------------------------------------------------------ *
 * The theme this window is showing
 *
 * One value per window, held outside React so the decorations at the root and
 * the wheel deep inside a screen read the same thing without a provider —
 * the projector and the remote sit outside the game's provider entirely.
 * ------------------------------------------------------------------ */

let current: Theme = DEFAULT_THEME;
const listeners = new Set<() => void>();

/** Paint this window in `theme`. Cheap to call with the theme already on. */
export const applyTheme = (theme: Theme): void => {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = theme;
  }
  if (theme === current) return;
  current = theme;
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The theme this window is painted in, kept current. */
export const useTheme = (): Theme =>
  useSyncExternalStore(subscribe, () => current, () => current);

/**
 * Paint this window in whatever theme its source says.
 *
 * A screen calls this with the host's choice as it reaches it — its own state
 * on the host's window, the snapshot everywhere else. `undefined` means the
 * source has not said (no snapshot yet, or one from a host on a build from
 * before themes), and falls back to `fallback`.
 */
export const useApplyTheme = (theme: Theme | undefined, fallback: Theme = DEFAULT_THEME): void => {
  const resolved = isTheme(theme) ? theme : fallback;
  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);
};
