const UNSAVED_CONFIG_MESSAGE =
  "You have unsaved configuration changes. Discard them and continue?";

export function confirmDiscardConfigChanges(): boolean {
  return window.confirm(UNSAVED_CONFIG_MESSAGE);
}
