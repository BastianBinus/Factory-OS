import { readString, writeString } from '../utils/storage';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'factoryos.theme';
export const THEME_CHANGE_EVENT = 'factoryos:themechange';

function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark';
}

function systemTheme(): Theme {
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getTheme(): Theme {
  const attr = document.documentElement.dataset['theme'];
  if (isTheme(attr ?? null)) return attr as Theme;
  const stored = readString(STORAGE_KEY);
  return isTheme(stored) ? stored : systemTheme();
}

export function setTheme(theme: Theme): void {
  document.documentElement.dataset['theme'] = theme;
  writeString(STORAGE_KEY, theme);
  document.dispatchEvent(new CustomEvent<Theme>(THEME_CHANGE_EVENT, { detail: theme }));
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

/** Subscribe to theme changes. Returns an unsubscribe function. */
export function onThemeChange(handler: (theme: Theme) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent<Theme>).detail);
  document.addEventListener(THEME_CHANGE_EVENT, listener);
  return () => document.removeEventListener(THEME_CHANGE_EVENT, listener);
}

const SUN = `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
  <circle cx="8" cy="8" r="3.1"/>
  <path d="M8 1v1.6M8 13.4V15M15 8h-1.6M2.6 8H1M12.9 3.1l-1.1 1.1M4.2 11.8l-1.1 1.1M12.9 12.9l-1.1-1.1M4.2 4.2L3.1 3.1"/>
</svg>`;

const MOON = `<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true">
  <path d="M13.5 9.6A5.8 5.8 0 0 1 6.4 2.5a5.9 5.9 0 1 0 7.1 7.1Z"/>
</svg>`;

/**
 * Button that flips the theme. Shows the icon of the theme it will switch *to*,
 * which is the convention users expect from a single-button toggle.
 */
export function createThemeToggle(): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn--ghost btn--icon';

  const paint = (theme: Theme) => {
    const next = theme === 'dark' ? 'light' : 'dark';
    button.innerHTML = next === 'dark' ? MOON : SUN;
    button.title = `Switch to ${next} theme`;
    button.setAttribute('aria-label', button.title);
  };

  paint(getTheme());
  button.addEventListener('click', () => paint(toggleTheme()));
  onThemeChange(paint);

  return button;
}

/**
 * Applies the stored or system theme. index.html already does this inline to
 * avoid a flash; this keeps the two in sync and starts following the OS setting
 * when the user has never chosen explicitly.
 */
export function initTheme(): Theme {
  const stored = readString(STORAGE_KEY);
  const theme: Theme = isTheme(stored) ? stored : systemTheme();
  document.documentElement.dataset['theme'] = theme;

  if (!isTheme(stored)) {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
      if (isTheme(readString(STORAGE_KEY))) return;
      const next: Theme = event.matches ? 'dark' : 'light';
      document.documentElement.dataset['theme'] = next;
      document.dispatchEvent(new CustomEvent<Theme>(THEME_CHANGE_EVENT, { detail: next }));
    });
  }

  return theme;
}
