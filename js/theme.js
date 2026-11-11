// Theme: follows the system by default. The toggle cycles Auto -> Light -> Dark
// and remembers the choice. (index.html applies a saved choice before first paint.)
import { icon } from './lib/dom.js';

const KEY = 'theme';
const MODES = ['auto', 'light', 'dark'];
const ICON = { auto: 'auto', light: 'sun', dark: 'moon' };
const LABEL = { auto: 'Theme: follows system', light: 'Theme: light', dark: 'Theme: dark' };

export function initTheme(button) {
  let mode = 'auto';
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') mode = saved;
  } catch {
    /* storage unavailable: stay on auto */
  }

  const apply = () => {
    if (mode === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = mode;
    button.innerHTML = icon(ICON[mode]);
    button.setAttribute('aria-label', `${LABEL[mode]}. Tap to change`);
    button.title = LABEL[mode];
    syncThemeColor();
  };

  button.addEventListener('click', () => {
    mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
    try {
      if (mode === 'auto') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, mode);
    } catch {
      /* not persisted, still applied for this session */
    }
    apply();
  });

  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncThemeColor);
  apply();
}

/** Keep the browser / status bar colour in step with the app bar. */
function syncThemeColor() {
  const color = getComputedStyle(document.querySelector('.bar')).backgroundColor;
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.setAttribute('content', color);
}
