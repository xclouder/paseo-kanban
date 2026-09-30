let openSettings: (() => void) | undefined;

export function installOpenKanbanSettings(action: () => void) {
  openSettings = action;
  return () => { if (openSettings === action) openSettings = undefined; };
}

export function openKanbanSettings() {
  openSettings?.();
}
