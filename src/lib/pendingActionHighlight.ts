const STORAGE_KEY = "hsm:pending-action-highlight";
export const ACTION_HIGHLIGHT_MS = 7000;
export const ACTION_HIGHLIGHT_CLASS =
  "animate-pulse ring-2 ring-amber-400 ring-offset-2 ring-offset-background shadow-[0_0_0.95rem_rgba(251,191,36,0.85)]";

export type PendingActionHighlight =
  | "mods-update-plugins"
  | "experimental-addon-update";

export function setPendingActionHighlight(action: PendingActionHighlight): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(STORAGE_KEY, action);
}

export function consumePendingActionHighlight(): PendingActionHighlight | null {
  if (typeof window === "undefined") return null;
  const value = window.sessionStorage.getItem(STORAGE_KEY);
  if (!value) return null;
  window.sessionStorage.removeItem(STORAGE_KEY);
  if (value === "mods-update-plugins" || value === "experimental-addon-update") {
    return value;
  }
  return null;
}
