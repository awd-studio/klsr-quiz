import type { Answer, Question } from '../data/types.ts';
import { isGroup } from '../core/text.ts';
import type { Theme } from '../core/storage.ts';
import { cx, h, type Child } from './dom.ts';

const NUMBERED = /^\d+\.\s/;

/** Відповідь з файлу: одне визначення — абзац, кілька пунктів — список, групи — з підзаголовками. */
export function renderAnswer(answer: Answer, className?: string): HTMLElement {
  if (answer.length === 1 && typeof answer[0] === 'string') {
    return h('p', { class: cx('answer-text', className) }, answer[0]);
  }
  const items = answer.map((item) =>
    isGroup(item)
      ? h('li', { class: 'answer-group' }, h('span', { class: 'answer-group__title' }, item.title), list(item.items))
      : h('li', null, item),
  );
  const numbered = answer.every((i) => typeof i === 'string' && NUMBERED.test(i));
  return h('ul', { class: cx('answer-list', numbered && 'answer-list--numbered', className) }, items);
}

function list(items: readonly string[]): HTMLElement {
  const numbered = items.every((i) => NUMBERED.test(i));
  return h(
    'ul',
    { class: cx('answer-list', numbered && 'answer-list--numbered') },
    items.map((i) => h('li', null, i)),
  );
}

/** Короткий підпис питання: «Модуль 2 · №15». */
export const questionRef = (q: Question): string => `Модуль ${q.module} · №${q.n}`;

export function segmented<T extends string>(
  name: string,
  value: T,
  options: ReadonlyArray<{ value: T; title: string; hint: string }>,
  onChange: (v: T) => void,
): HTMLElement {
  return h(
    'div',
    { class: 'seg', role: 'radiogroup', 'aria-label': name },
    options.map((o) =>
      h(
        'button',
        {
          type: 'button',
          role: 'radio',
          class: cx('seg__btn', o.value === value && 'is-on'),
          'aria-checked': String(o.value === value),
          'data-value': o.value,
          onclick: () => onChange(o.value),
        },
        h('b', null, o.title),
        h('span', null, o.hint),
      ),
    ),
  );
}

export function stepper(
  id: string,
  label: string,
  hint: string,
  value: number,
  min: number,
  max: number,
  onChange: (v: number) => void,
  disabled = false,
): HTMLElement {
  const clamp = (v: number) => Math.max(min, Math.min(max, Number.isFinite(v) ? Math.round(v) : min));
  const input = h('input', {
    id,
    type: 'number',
    inputmode: 'numeric',
    min,
    max,
    value,
    disabled,
    onchange: (e) => onChange(clamp(Number((e.target as HTMLInputElement).value))),
  });
  return h(
    'div',
    { class: cx('row', disabled && 'is-disabled') },
    h('label', { for: id }, label, h('small', null, hint)),
    h(
      'div',
      { class: 'num' },
      h(
        'button',
        { type: 'button', 'aria-label': `${label}: менше`, disabled, onclick: () => onChange(clamp(value - 1)) },
        '−',
      ),
      input,
      h(
        'button',
        { type: 'button', 'aria-label': `${label}: більше`, disabled, onclick: () => onChange(clamp(value + 1)) },
        '+',
      ),
    ),
  );
}

const SVG = 'http://www.w3.org/2000/svg';

/** Значки теми (24×24, контур). */
const THEME_ICONS: Readonly<Record<Theme, string>> = {
  // Коло, ліва половина зафарбована — «як у системі».
  system: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 3v18',
  light:
    'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  dark: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
};

function themeIcon(theme: Theme): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  if (theme === 'system') {
    const half = document.createElementNS(SVG, 'path');
    half.setAttribute('d', 'M12 3a9 9 0 0 0 0 18z');
    half.setAttribute('fill', 'currentColor');
    svg.appendChild(half);
  }
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', THEME_ICONS[theme]);
  svg.appendChild(path);
  return svg;
}

const THEMES: ReadonlyArray<{ value: Theme; label: string }> = [
  { value: 'system', label: 'Як у системі' },
  { value: 'light', label: 'Світла' },
  { value: 'dark', label: 'Темна' },
];

/** Компактний перемикач теми: як у системі / світла / темна. */
export function themeSwitch(value: Theme, onChange: (t: Theme) => void): HTMLElement {
  return h(
    'div',
    { class: 'theme', role: 'radiogroup', 'aria-label': 'Тема оформлення' },
    THEMES.map((t) =>
      h(
        'button',
        {
          type: 'button',
          role: 'radio',
          class: cx('theme__btn', t.value === value && 'is-on'),
          'aria-checked': String(t.value === value),
          'aria-label': `Тема: ${t.label}`,
          title: `Тема: ${t.label}`,
          'data-theme-value': t.value,
          onclick: () => onChange(t.value),
        },
        themeIcon(t.value),
      ),
    ),
  );
}

/** Значок «виключити»: перекреслене коло. */
function banIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  for (const [k, v] of Object.entries({
    viewBox: '0 0 24 24',
    width: '18',
    height: '18',
    'aria-hidden': 'true',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
  }))
    svg.setAttribute(k, v);
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM5.6 5.6l12.8 12.8');
  svg.appendChild(path);
  return svg;
}

export const EXCLUDE_TITLE = 'Виключити питання: більше не показувати його в тестах';

/** Кнопка «виключити питання» поряд із зірочкою. */
export function excludeButton(onExclude: () => void): HTMLElement {
  return h(
    'button',
    {
      type: 'button',
      class: 'iconbtn exclude',
      'aria-label': EXCLUDE_TITLE,
      title: EXCLUDE_TITLE,
      'data-testid': 'exclude',
      onclick: onExclude,
    },
    banIcon(),
  );
}

/** Підвал: версія, «Що нового» і (на сайті) посилання на офлайн-файл. */
export function footer(version: string, onChangelog: () => void, extra: Child = null): HTMLElement {
  return h(
    'footer',
    { class: 'footer' },
    extra,
    h('span', null, 'Питання та відповіді — дослівно з файлу «Залікові питання КЛСР».'),
    h(
      'div',
      { class: 'footer__version' },
      h('span', { 'data-testid': 'version' }, `Версія ${version}`),
      h('span', { 'aria-hidden': 'true' }, '·'),
      h(
        'button',
        { type: 'button', class: 'link link--inline', 'data-testid': 'changelog', onclick: onChangelog },
        'Що нового',
      ),
    ),
  );
}

export function starButton(saved: boolean, onToggle: () => void): HTMLElement {
  return h(
    'button',
    {
      type: 'button',
      class: cx('star', saved && 'is-on'),
      'aria-pressed': String(saved),
      'aria-label': saved ? 'Прибрати зі збережених' : 'Зберегти питання',
      title: saved ? 'Прибрати зі збережених' : 'Зберегти питання',
      onclick: onToggle,
    },
    saved ? '★' : '☆',
  );
}

export function modal(title: string, text: Child, buttons: Child, tone: 'danger' | 'neutral' = 'neutral') {
  return h(
    'div',
    { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'modal-title' },
    h(
      'div',
      { class: 'modal__box' },
      h('h3', { id: 'modal-title', class: cx('modal__title', tone === 'danger' && 'is-danger') }, title),
      h('div', { class: 'modal__text' }, text),
      h('div', { class: 'btns btns--two' }, buttons),
    ),
  );
}
