import { SETS, isInSet, questionsOfSet } from '../../data/index.ts';
import { ALT_SHARE } from '../../core/round.ts';
import { stats } from '../../core/session.ts';
import { segmented, stepper, themeSwitch } from '../components.ts';
import { h } from '../dom.ts';
import type { Ctx } from '../state.ts';

export function homeView({ state, actions, canDownload }: Ctx): HTMLElement {
  const { prefs, hard, saved, session } = state.data;
  const set = SETS[prefs.setId];
  const total = questionsOfSet(prefs.setId).length;
  const hardCount = hard.filter((id) => isInSet(prefs.setId, id)).length;
  const savedCount = saved.filter((id) => isInSet(prefs.setId, id)).length;
  const count = Math.min(prefs.counts[prefs.setId], total);

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
    h('p', { class: 'sub' }, `Залікові питання · ${set.title} · ${total} питань`),

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
        ? h(
            'p',
            { class: 'hint', 'data-testid': 'alt-hint' },
            `Близько ${Math.round(ALT_SHARE * 100)}% питань подаються в іншому форматі: Так / Ні, термін за визначенням, кілька відповідей або послідовність.`,
          )
        : null,
    ),

    h(
      'section',
      { class: 'panel' },
      h('h2', null, 'Налаштування'),
      stepper('count', 'Кількість питань', `від 1 до ${total}`, count, 1, total, actions.setCount),
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
      h('button', { type: 'button', class: 'btn', 'data-testid': 'start', onclick: actions.start }, 'Почати'),
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
    ),

    h(
      'footer',
      { class: 'footer' },
      canDownload
        ? h(
            'a',
            { href: 'klsr-quiz.html', download: 'klsr-quiz.html', class: 'link' },
            'Завантажити офлайн-версію (один HTML-файл)',
          )
        : null,
      h('span', null, 'Питання та відповіді — дослівно з файлу «Залікові питання КЛСР».'),
    ),
  );
}
