/**
 * Resilient double-click detector (studio-demo checkDoubleClick).
 * Survives a full canvas re-render between click 1 and click 2.
 */
export const DOUBLE_CLICK_WINDOW_MS = 380;

let lastKey: string | null = null;
let lastTs = 0;

export function resetDoubleClickState(): void {
  lastKey = null;
  lastTs = 0;
}

export function checkDoubleClick(key: string, now = Date.now()): boolean {
  if (key === '') return false;
  if (lastKey === key && now - lastTs < DOUBLE_CLICK_WINDOW_MS) {
    lastKey = null;
    lastTs = 0;
    return true;
  }
  lastKey = key;
  lastTs = now;
  return false;
}
