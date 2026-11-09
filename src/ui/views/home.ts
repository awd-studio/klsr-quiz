import { SETS, isInSet, questionsOfSet } from '../../data/index.ts';
import type { QuestionId } from '../../data/types.ts';
import { ALT_SHARE } from '../../core/round.ts';
import { stats } from '../../core/session.ts';
import { footer, segmented, stepper, themeSwitch } from '../components.ts';
import { h } from '../dom.ts';
import type { Ctx } from '../state.ts';
import { VERSION } from '../version.ts';

export function homeView({ state, actions, canDownload }: Ctx): HTMLElement {
  const { prefs, hard, saved, excluded, session } = state.data;
  const set = SETS[prefs.setId];
  const total = questionsOfSet(prefs.setId).length;
  const active = (id: QuestionId) => isInSet(prefs.setId, id) && !excluded.includes(id);
  const excludedInSet = excluded.filter((id) => isInSet(prefs.setId, id)).length;
  /** Скільки питань можна поставити в тест (без виключених). */
  const available = total - excludedInSet;
  const hardCount = hard.filter(active).length;
  const savedCount = saved.filter(active).length;
  const count = Math.max(Math.min(prefs.counts[prefs.setId], available), Math.min(1, available));

  const resume = session
    ? (() => {
        const st = stats(session);
        return h(
          'button',
          { type: 'button', class: 'btn btn--secondary', 'data-testid': 'resume', onclick: actions.resume },
          `Продовжити тест (${st.answered} з ${st.total})`,
        );
      })()
    : null;

  return h(
    'main',
    { class: 'screen screen--home' },
    h(
      'header',
      { class: 'header' },
      h('h1', { tabindex: '-1', 'data-autofocus': true }, 'КЛСР — тренажер'),
      themeSwitch(prefs.theme, actions.setTheme),
    ),
    h(
      'p',
      { class: 'sub' },
      `Залікові питання · ${set.title} · ${total} питань`,
      excludedInSet ? h('span', { 'data-testid': 'excluded-note' }, ` · виключено ${excludedInSet}`) : null,
    ),

    h(
      'section',
      { class: 'panel' },
      h('h2', null, 'Питання'),
      segmented(
        'Набір питань',
        prefs.setId,
        [
          { value: 'm1', title: 'Модуль 1', hint: `${questionsOfSet('m1').length} питань` },
          { value: 'all', title: 'Загальний', hint: `Модулі 1–3 · ${questionsOfSet('all').length} питань` },
        ],
        actions.setSet,
      ),
    ),

    h(
      'section',
      { class: 'panel' },
      h('h2', null, 'Режим'),
      segmented(
        'Режим',
        prefs.mode,
        [
          { value: 'cards', title: 'Картки', hint: 'Знав / не знав' },
          { value: 'choice', title: 'Вибір варіанту', hint: 'Варіанти відповіді' },
        ],
        actions.setMode,
      ),
      prefs.mode === 'choice'
        ? [
            h('h3', { class: 'panel__sub', id: 'difficulty-label' }, 'Складність варіантів'),
            segmented(
              'Складність варіантів',
              prefs.difficulty,
              [
                { value: 'hard', title: 'Складні', hint: 'Схожі на правильний, як на заліку' },
                { value: 'easy', title: 'Легкі', hint: 'Відповіді на суміжні питання' },
              ],
              actions.setDifficulty,
            ),
            h(
              'p',
              { class: 'hint', 'data-testid': 'difficulty-hint' },
              prefs.difficulty === 'easy'
                ? 'Неправильні варіанти — відповіді на суміжні питання того ж модуля: схожі за формою, але помітно інші за змістом. Правильна відповідь — дослівно з файлу.'
                : 'Неправильні варіанти відрізняються від правильного лише кількома словами чи пунктами — як на заліку.',
            ),
            h(
              'p',
              { class: 'hint', 'data-testid': 'alt-hint' },
              `Близько ${Math.round(ALT_SHARE * 100)}% питань подаються в іншому форматі: Так / Ні, термін за визначенням, кілька відповідей або послідовність. Порядок варіантів щоразу випадковий.`,
            ),
          ]
        : null,
    ),

    h(
      'section',
      { class: 'panel' },
      h('h2', null, 'Налаштування'),
      stepper(
        'count',
        'Кількість питань',
        excludedInSet ? `від 1 до ${available} (без виключених)` : `від 1 до ${total}`,
        count,
        Math.min(1, available),
        available,
        actions.setCount,
      ),
      stepper(
        'limit',
        'Допустимо помилок',
        'Тест не складено, якщо помилок ≥ цього числа',
        prefs.limit,
        1,
        total,
        actions.setLimit,
      ),
      h(
        'button',
        { type: 'button', class: 'link', 'data-testid': 'preset-exam', onclick: actions.presetExam },
        'Як на заліку: 30 питань, незадовільно від 10 помилок',
      ),
    ),

    h(
      'div',
      { class: 'btns' },
      resume,
      h(
        'button',
        { type: 'button', class: 'btn', 'data-testid': 'start', disabled: available === 0, onclick: actions.start },
        'Почати',
      ),
      h(
        'div',
        { class: 'btns__row' },
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn--secondary',
            'data-testid': 'hard',
            disabled: hardCount === 0,
            onclick: actions.startHard,
          },
          `Складні питання (${hardCount})`,
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn--ghost btn--auto',
            'data-testid': 'hard-clear',
            disabled: hard.length === 0,
            onclick: actions.clearHard,
          },
          'Очистити',
        ),
      ),
      h(
        'button',
        { type: 'button', class: 'btn btn--secondary', 'data-testid': 'saved', onclick: actions.openSaved },
        `☆ Збережені питання (${savedCount})`,
      ),
      h(
        'button',
        { type: 'button', class: 'btn btn--secondary', 'data-testid': 'excluded', onclick: actions.openExcluded },
        `⊘ Виключені питання (${excluded.length})`,
      ),
    ),

    footer(
      VERSION,
      actions.openChangelog,
      canDownload
        ? h(
            'a',
            { href: 'klsr-quiz.html', download: 'klsr-quiz.html', class: 'link' },
            'Завантажити офлайн-версію (один HTML-файл)',
          )
        : null,
    ),
  );
}
