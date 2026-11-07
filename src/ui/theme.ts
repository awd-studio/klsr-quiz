import type { Theme } from '../core/storage.ts';

/** Колір панелі браузера для кожної теми (збігається з --bg у styles.css). */
const THEME_COLOR = { light: '#f4f5f7', dark: '#121418' } as const;

let applied: Theme | null = null;

/**
 * Застосовує тему: `data-theme` на <html> (CSS перевизначає змінні кольорів)
 * і колір панелі браузера. «Системна» — без атрибута, працює prefers-color-scheme.
 */
export function applyTheme(theme: Theme): void {
  if (theme === applied) return;
  applied = theme;
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;

  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const scheme = meta.dataset.scheme === 'dark' ? 'dark' : 'light';
    meta.content = THEME_COLOR[theme === 'system' ? scheme : theme];
  }
}
