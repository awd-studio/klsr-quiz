import { SETS, getQuestion, isInSet } from '../../data/index.ts';
import { questionRef, renderAnswer } from '../components.ts';
import { h } from '../dom.ts';
import { icon } from '../icons.ts';
import type { Ctx } from '../state.ts';

export function savedView({ state, actions }: Ctx): HTMLElement {
  const { prefs, saved } = state.data;
  const inSet = saved.filter((id) => isInSet(prefs.setId, id));
  const elsewhere = saved.length - inSet.length;
  const playable = inSet.filter((id) => !state.data.excluded.includes(id)).length;

  return h(
    'main',
    { class: 'screen screen--saved' },
    h(
      'div',
      { class: 'topbar' },
      h('button', { type: 'button', class: 'topbar__back', onclick: actions.home }, icon('back'), 'Меню'),
    ),
    h('h1', { tabindex: '-1', 'data-autofocus': true }, `Збережені питання (${inSet.length})`),
    h(
      'p',
      { class: 'sub' },
      `Набір «${SETS[prefs.setId].title}». Позначайте питання зірочкою під час тесту.`,
      elsewhere ? ` Ще ${elsewhere} — в інших модулях (оберіть набір «Загальний»).` : '',
    ),
    playable
      ? h(
          'div',
          { class: 'btns' },
          h(
            'button',
            { type: 'button', class: 'btn', 'data-testid': 'start-saved', onclick: actions.startSaved },
            icon('play'),
            `Пройти збережені (${prefs.mode === 'cards' ? 'картки' : 'вибір варіанту'})`,
          ),
        )
      : h(
          'p',
          { class: 'empty' },
          inSet.length ? 'Усі збережені питання виключено.' : 'Поки що немає збережених питань.',
        ),
    h(
      'div',
      { class: 'saved-list' },
      inSet.map((id) => {
        const q = getQuestion(id)!;
        return h(
          'article',
          { class: 'panel saved', 'data-qid': id },
          h(
            'div',
            { class: 'saved__head' },
            h(
              'span',
              { class: 'muted' },
              questionRef(q),
              state.data.excluded.includes(id) ? h('span', { class: 'tag tag--warn saved__tag' }, 'виключене') : null,
            ),
            h(
              'button',
              {
                type: 'button',
                class: 'btn btn--ghost btn--auto btn--small',
                'data-testid': 'unsave',
                onclick: () => actions.toggleSaved(id),
              },
              icon('close', 16),
              'Прибрати',
            ),
          ),
          h('h2', { class: 'saved__q' }, q.q),
          h('details', null, h('summary', null, 'Відповідь'), renderAnswer(q.a)),
        );
      }),
    ),
  );
}
