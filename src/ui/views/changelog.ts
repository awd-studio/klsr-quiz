import { inlineCode, parseChangelog } from '../../core/changelog.ts';
import { h } from '../dom.ts';
import type { Ctx } from '../state.ts';
import { CHANGELOG, VERSION } from '../version.ts';

const formatDate = (iso: string): string => {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
};

/** Сторінка «Що нового»: історія змін із CHANGELOG.md. */
export function changelogView({ actions }: Ctx): HTMLElement {
  const releases = parseChangelog(CHANGELOG);
  return h(
    'main',
    { class: 'screen screen--changelog' },
    h(
      'div',
      { class: 'topbar' },
      h('button', { type: 'button', class: 'topbar__back', onclick: actions.home }, '← Меню'),
    ),
    h('h1', { tabindex: '-1', 'data-autofocus': true }, 'Що нового'),
    h('p', { class: 'sub' }, `Поточна версія — ${VERSION}.`),
    releases.map((r, i) =>
      h(
        'section',
        { class: 'panel release', 'data-testid': 'release', 'data-version': r.version },
        h(
          'h2',
          { class: 'release__head' },
          h('span', null, `Версія ${r.version}`),
          i === 0 ? h('span', { class: 'tag' }, 'поточна') : null,
          r.date ? h('small', { class: 'release__date' }, formatDate(r.date)) : null,
        ),
        h(
          'ul',
          { class: 'release__list' },
          r.items.map((item) =>
            h(
              'li',
              null,
              inlineCode(item).map((p) => (p.code ? h('code', null, p.text) : p.text)),
            ),
          ),
        ),
      ),
    ),
  );
}
