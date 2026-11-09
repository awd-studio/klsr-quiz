import type { Answer, Question } from '../data/types.ts';
import { isGroup } from '../core/text.ts';
import type { Theme } from '../core/storage.ts';
import { cx, h, type Child } from './dom.ts';
import { THEME_ICON, icon, type IconName } from './icons.ts';

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
  options: ReadonlyArray<{ value: T; title: string; hint: string; icon?: IconName }>,
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
        h('b', null, o.icon ? icon(o.icon) : null, o.title),
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
        {
          type: 'button',
          'aria-label': `${label}: менше`,
          title: `${label}: менше`,
          disabled,
          onclick: () => onChange(clamp(value - 1)),
        },
        icon('minus'),
      ),
      input,
      h(
        'button',
        {
          type: 'button',
          'aria-label': `${label}: більше`,
          title: `${label}: більше`,
          disabled,
          onclick: () => onChange(clamp(value + 1)),
        },
        icon('plus'),
      ),
    ),
  );
}

const THEMES: ReadonlyArray<{ value: Theme; label: string }> = [
  { value: 'system', label: 'Як у системі' },
  { value: 'light', label: 'Світла' },
  { value: 'dark', label: 'Темна' },
];

/**
 * Компактний перемикач теми: як у системі / світла / темна.
 * Під активною кнопкою — «повзунок»; `from` — попередня тема, щоб повзунок
 * проїхав від неї до нової (екран перемальовується повністю, тож transition не спрацює).
 */
export function themeSwitch(value: Theme, onChange: (t: Theme) => void, from: Theme | null = null): HTMLElement {
  const index = (t: Theme) => THEMES.findIndex((x) => x.value === t);
  const moving = from !== null && from !== value;
  return h(
    'div',
    {
      class: cx('theme', moving && 'is-moving'),
      role: 'radiogroup',
      'aria-label': 'Тема оформлення',
      style: `--i:${index(value)};--from:${moving ? index(from) : index(value)}`,
    },
    h('span', { class: 'theme__thumb', 'aria-hidden': 'true' }),
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
        icon(THEME_ICON[t.value]),
      ),
    ),
  );
}

/**
 * Блок, що плавно розгортається/згортається (висота й прозорість, 0,2 с).
 * `animate` — анімувати лише в першому рендері після зміни, інакше показати кінцевий стан.
 * Згорнутий блок лишається в DOM, але невидимий і недоступний для фокусу.
 */
export function collapse(
  open: boolean,
  animate: boolean,
  attrs: Record<string, string>,
  ...children: Child[]
): HTMLElement {
  return h(
    'div',
    {
      ...attrs,
      class: cx('collapse', attrs.class, !open && 'is-closed', animate && (open ? 'is-opening' : 'is-closing')),
      inert: !open,
    },
    h('div', { class: 'collapse__inner' }, children),
  );
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
    icon('ban'),
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
        icon('sparkles', 14),
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
      class: cx('iconbtn star', saved && 'is-on'),
      'aria-pressed': String(saved),
      'aria-label': saved ? 'Прибрати зі збережених' : 'Зберегти питання',
      title: saved ? 'Прибрати зі збережених' : 'Зберегти питання',
      onclick: onToggle,
    },
    icon(saved ? 'starFilled' : 'star', 20),
  );
}

export function modal(title: string, text: Child, buttons: Child, tone: 'danger' | 'neutral' = 'neutral'): HTMLElement {
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
