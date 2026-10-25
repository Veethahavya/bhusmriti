export type TextSize = 'sm' | 'md' | 'lg';
export type UiSize = 'compact' | 'default' | 'large';

const TEXT_KEY = 'aeros.textSize';
const UI_KEY = 'aeros.uiSize';
const CONTRAST_KEY = 'aeros.highContrast';

export function readAppearance(): { text: TextSize; ui: UiSize; contrast: boolean } {
  let text: TextSize = 'md';
  let ui: UiSize = 'default';
  let contrast = false;
  try {
    const t = localStorage.getItem(TEXT_KEY);
    const u = localStorage.getItem(UI_KEY);
    if (t === 'sm' || t === 'md' || t === 'lg') text = t;
    if (u === 'compact' || u === 'default' || u === 'large') ui = u;
    contrast = localStorage.getItem(CONTRAST_KEY) === '1';
  } catch { /* ignore */ }
  return { text, ui, contrast };
}

export function applyAppearance() {
  const a = readAppearance();
  document.documentElement.dataset.text = a.text;
  document.documentElement.dataset.ui = a.ui;
  document.documentElement.dataset.contrast = a.contrast ? 'high' : 'normal';
}

export function setTextSize(v: TextSize) {
  try { localStorage.setItem(TEXT_KEY, v); } catch { /* ignore */ }
  applyAppearance();
}
export function setUiSize(v: UiSize) {
  try { localStorage.setItem(UI_KEY, v); } catch { /* ignore */ }
  applyAppearance();
}
export function setHighContrast(v: boolean) {
  try { localStorage.setItem(CONTRAST_KEY, v ? '1' : '0'); } catch { /* ignore */ }
  applyAppearance();
}
export function resetAppearance() {
  try {
    localStorage.removeItem(TEXT_KEY);
    localStorage.removeItem(UI_KEY);
    localStorage.removeItem(CONTRAST_KEY);
  } catch { /* ignore */ }
  applyAppearance();
}
