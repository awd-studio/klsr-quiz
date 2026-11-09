import { getQuestion } from '../../data/index.ts';
import { questionRef, renderAnswer } from '../components.ts';
import { h } from '../dom.ts';
import type { Ctx } from '../state.ts';

/** Список виключених питань (з усіх модулів) з можливістю повернути будь-яке. */
export function excludedView({ state, actions }: Ctx): HTMLElement {
  const { excluded } = state.data;

  return h(
    'main',
    { class: 'screen screen--excluded' },
    h(
      'div',
      { class: 'topbar' },
      h('button', { type: 'button', class: 'topbar__back', onclick: actions.home }, '← Меню'),
    ),
    h('h1', { tabindex: '-1', 'data-autofocus': true }, `Виключені питання (${excluded.length})`),
    h(
      'p',
      { class: 'sub' },
      'Виключені питання не з’являються в жодному тесті — ні в картках, ні у виборі варіанту, ні серед складних чи збережених. ',
      'Виключити питання можна значком ⊘ біля зірочки під час тесту. Натисніть «Повернути», щоб питання знову могло випадати.',
    ),
    excluded.length
      ? h(
          'div',
          { class: 'btns' },
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn--secondary',
              'data-testid': 'restore-all',
              onclick: actions.restoreAllExcluded,
            },
            `Повернути всі (${excluded.length})`,
          ),
        )
      : h('p', { class: 'empty', 'data-testid': 'excluded-empty' }, 'Немає виключених питань.'),
    h(
      'div',
      { class: 'saved-list' },
      excluded.map((id) => {
        const q = getQuestion(id)!;
        return h(
          'article',
          { class: 'panel saved', 'data-qid': id, 'data-testid': 'excluded-item' },
          h(
            'div',
            { class: 'saved__head' },
            h('span', { class: 'muted' }, questionRef(q)),
            h(
              'button',
              {
                type: 'button',
                class: 'btn btn--ghost btn--auto btn--small',
                'data-testid': 'restore',
                'aria-label': `Повернути питання ${questionRef(q)}`,
                onclick: () => actions.restoreExcluded(id),
              },
              'Повернути',
            ),
          ),
          h('h2', { class: 'saved__q' }, q.q),
          h('details', null, h('summary', null, 'Відповідь'), renderAnswer(q.a)),
        );
      }),
    ),
  );
}
