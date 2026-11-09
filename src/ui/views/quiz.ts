import { getQuestion } from '../../data/index.ts';
import type { Question } from '../../data/types.ts';
import { KIND_LABEL, TF_PREFIX, type Task } from '../../core/round.ts';
import { currentResult, currentTask, stats, type TaskResult } from '../../core/session.ts';
import { collapse, excludeButton, questionRef, renderAnswer, starButton } from '../components.ts';
import { cx, h, type Child } from '../dom.ts';
import { icon } from '../icons.ts';
import type { Actions, Ctx, UiState } from '../state.ts';

const LETTERS = 'АБВГДЕ';

export function quizView({ state, actions }: Ctx): HTMLElement {
  const s = state.session!;
  const task = currentTask(s)!;
  const q = getQuestion(task.qid)!;
  const result = currentResult(s);
  const st = stats(s);
  const answered = !!result;
  const failed = st.wrong >= s.config.limit;
  const saved = state.data.saved.includes(q.id);

  const tags: Child[] = [];
  if (s.skipped[s.current!]) tags.push(h('span', { class: 'tag tag--warn' }, 'пропущене'));
  if (task.kind !== 'card' && !(task.kind === 'choice' && task.source === 'base')) {
    tags.push(
      h('span', { class: 'tag' }, task.kind === 'choice' && task.source === 'term' ? 'Термін' : KIND_LABEL[task.kind]),
    );
  }
  if (task.exam) tags.push(h('span', { class: 'tag tag--accent' }, 'з білетів'));

  return h(
    'main',
    { class: cx('screen screen--quiz', state.justAnswered && 'is-just-answered') },
    h(
      'div',
      { class: 'quizbar' },
      h(
        'div',
        { class: 'topbar' },
        h('button', { type: 'button', class: 'topbar__back', onclick: actions.exit }, icon('back'), 'Меню'),
        h(
          'div',
          { class: 'stats', 'aria-live': 'polite' },
          h(
            'span',
            { class: 'pill pill--ok', 'data-testid': 'stat-ok', 'aria-label': `Правильно: ${st.correct}` },
            `✓ ${st.correct}`,
          ),
          h(
            'span',
            { class: 'pill pill--bad', 'data-testid': 'stat-bad', 'aria-label': `Неправильно: ${st.wrong}` },
            `✗ ${st.wrong}`,
          ),
        ),
      ),
      h(
        'div',
        {
          class: 'progress',
          role: 'progressbar',
          'aria-valuemin': 0,
          'aria-valuemax': st.total,
          'aria-valuenow': st.answered,
        },
        h('i', { style: `width:${(st.answered / st.total) * 100}%` }),
      ),
      h(
        'div',
        { class: 'meta' },
        h('span', { 'data-testid': 'progress' }, `Відповідей: ${st.answered} / ${st.total}`),
        h('span', null, st.pendingSkipped ? `Пропущено: ${st.pendingSkipped}` : ''),
      ),
    ),
    failed
      ? h(
          'div',
          { class: 'failbadge', role: 'status', 'data-testid': 'fail-badge' },
          'Ліміт помилок досягнуто — тест не складено',
        )
      : null,
    state.notice ? excludeNotice(state, actions) : null,

    h(
      'article',
      { class: 'qcard', 'data-kind': task.kind, 'data-qid': q.id },
      h(
        'div',
        { class: 'qcard__meta' },
        h('span', { class: 'qcard__ref' }, questionRef(q)),
        tags,
        h(
          'div',
          { class: 'qcard__tools' },
          excludeButton(() => actions.exclude(q.id)),
          starButton(saved, () => actions.toggleSaved(q.id)),
        ),
      ),
      body(task, q, state, actions, result),
    ),
    answered && task.kind !== 'card' ? feedback(task, q, result) : null,
    controls(task, state, actions, answered),
  );
}

/**
 * Пояснення після виключення: що сталося, де повернути, «Скасувати виключення» і ×.
 * Зверху — смужка часу до автозакриття (анімує App, бо екран перемальовується повністю).
 */
function excludeNotice(state: UiState, actions: Actions): HTMLElement {
  const n = state.notice!;
  const q = getQuestion(n.qid)!;
  const closing = n.leaving;
  return collapse(
    !closing,
    closing || state.toggled === 'notice',
    { class: 'notice-wrap', 'data-testid': 'exclude-notice-wrap' },
    h(
      'div',
      { class: 'notice', role: 'status', 'data-testid': 'exclude-notice' },
      h('div', { class: 'notice__timer', 'aria-hidden': 'true', 'data-testid': 'notice-timer' }),
      h(
        'p',
        null,
        h('b', null, `Питання «${questionRef(q)}» виключено.`),
        ' Воно більше не з’являтиметься в тестах. ',
        n.replaced
          ? 'Замість нього додано інше питання — кількість питань не змінилась.'
          : 'Інших питань для заміни немає, тому питань у тесті стало менше.',
        ' Повернути його можна в меню «Виключені питання».',
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn--secondary btn--auto btn--small notice__undo',
          'data-testid': 'undo-exclude',
          onclick: actions.undoExclude,
        },
        icon('undo', 16),
        'Скасувати виключення',
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'notice__close',
          'aria-label': 'Закрити повідомлення',
          title: 'Закрити повідомлення',
          'data-testid': 'close-notice',
          onclick: actions.dismissNotice,
        },
        icon('close'),
      ),
    ),
  );
}

/**
 * Після відповіді варіанти не можна змінити, але вони лишаються фокусованими програмно
 * (`disabled` заборонив би фокус на правильному варіанті).
 */
const locked = (result: TaskResult | null) => (result ? { 'aria-disabled': 'true', tabindex: '-1' } : {});

function prompt(text: string): HTMLElement {
  return h('h2', { class: 'qcard__text', tabindex: '-1', 'data-autofocus': true }, text);
}

function body(task: Task, q: Question, state: UiState, actions: Actions, result: TaskResult | null): Child {
  switch (task.kind) {
    case 'card':
      return [
        prompt(q.q),
        collapse(
          state.revealed,
          state.toggled === 'reveal',
          { id: 'card-answer' },
          h('div', { class: 'reveal' }, h('div', { class: 'reveal__label' }, 'Відповідь'), renderAnswer(q.a)),
        ),
        h(
          'button',
          {
            type: 'button',
            class: 'btn btn--secondary reveal__btn',
            'aria-expanded': String(state.revealed),
            'aria-controls': 'card-answer',
            'data-testid': 'flip',
            onclick: actions.flip,
          },
          icon(state.revealed ? 'eyeOff' : 'eye'),
          state.revealed ? 'Сховати відповідь' : 'Показати відповідь',
        ),
      ];

    case 'choice': {
      const chosen = result?.response.kind === 'choice' ? result.response.index : -1;
      return [
        prompt(task.prompt),
        task.quote ? h('blockquote', { class: 'quote' }, renderAnswer(task.quote)) : null,
        h(
          'div',
          { class: 'opts', role: 'group', 'aria-label': 'Варіанти відповіді' },
          task.options.map((o, i) =>
            h(
              'button',
              {
                type: 'button',
                class: cx('opt', result && o.correct && 'is-right', result && i === chosen && !o.correct && 'is-wrong'),
                ...locked(result),
                'data-testid': 'option',
                onclick: () => actions.choose(i),
              },
              h('span', { class: 'opt__key', 'aria-hidden': 'true' }, LETTERS[i]),
              renderAnswer(o.answer, 'opt__body'),
            ),
          ),
        ),
      ];
    }

    case 'tf': {
      const value = result?.response.kind === 'tf' ? result.response.value : null;
      const btn = (v: boolean, label: string) =>
        h(
          'button',
          {
            type: 'button',
            class: cx(
              'opt opt--tf',
              result && v === task.correct && 'is-right',
              result && v === value && v !== task.correct && 'is-wrong',
            ),
            ...locked(result),
            'data-testid': v ? 'tf-yes' : 'tf-no',
            onclick: () => actions.answerTf(v),
          },
          label,
        );
      return [
        prompt(`${TF_PREFIX} ${task.statement}?`),
        h('div', { class: 'opts opts--tf' }, btn(true, 'Так'), btn(false, 'Ні')),
      ];
    }

    case 'multi': {
      const picked = result?.response.kind === 'multi' ? result.response.selected : state.multi;
      return [
        prompt(task.prompt),
        h('p', { class: 'hint' }, 'Оберіть усі правильні варіанти'),
        h(
          'div',
          { class: 'opts', role: 'group', 'aria-label': 'Варіанти відповіді' },
          task.options.map((o, i) => {
            const on = picked.includes(i);
            return h(
              'button',
              {
                type: 'button',
                class: cx(
                  'opt opt--check',
                  on && 'is-picked',
                  result && o.correct && on && 'is-right',
                  result && !o.correct && on && 'is-wrong',
                  result && o.correct && !on && 'is-missed',
                ),
                'aria-pressed': String(on),
                ...locked(result),
                'data-testid': 'multi-option',
                onclick: () => actions.toggleMulti(i),
              },
              h('span', { class: 'opt__box', 'aria-hidden': 'true' }, on ? '✓' : ''),
              h('span', null, o.text),
            );
          }),
        ),
      ];
    }

    case 'order': {
      const sequence = result?.response.kind === 'order' ? result.response.sequence : state.order;
      const remaining = task.shuffled.filter((i) => !sequence.includes(i));
      return [
        prompt(task.prompt),
        h(
          'p',
          { class: 'hint' },
          result
            ? 'Ваша послідовність:'
            : 'Натискайте пункти в потрібному порядку. Натисніть обраний пункт, щоб прибрати його.',
        ),
        h(
          'ol',
          { class: 'order', 'data-testid': 'order-picked' },
          sequence.map((itemIndex, pos) =>
            h(
              'li',
              null,
              h(
                'button',
                {
                  type: 'button',
                  class: cx('order__item', result && (itemIndex === pos ? 'is-right' : 'is-wrong')),
                  ...locked(result),
                  onclick: () => actions.undoOrder(pos),
                },
                h('span', { class: 'order__num' }, String(pos + 1)),
                h('span', null, task.items[itemIndex]),
              ),
            ),
          ),
        ),
        remaining.length
          ? h(
              'div',
              { class: 'opts', role: 'group', 'aria-label': 'Пункти' },
              remaining.map((itemIndex) =>
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'opt opt--chip',
                    'data-testid': 'order-option',
                    onclick: () => actions.pickOrder(itemIndex),
                  },
                  task.items[itemIndex],
                ),
              ),
            )
          : null,
      ];
    }
  }
}

function feedback(task: Task, q: Question, result: TaskResult | null): HTMLElement {
  const ok = result?.correct === true;
  const showSource = !(task.kind === 'choice' && task.source === 'base');
  return h(
    'section',
    { class: cx('feedback', ok ? 'is-ok' : 'is-bad'), role: 'status', 'data-testid': 'feedback' },
    h('div', { class: 'feedback__verdict' }, ok ? 'Правильно' : 'Неправильно'),
    task.kind === 'tf' ? h('p', null, `Правильна відповідь: ${task.correct ? 'Так' : 'Ні'}.`) : null,
    showSource ? sourceBlock(q) : null,
  );
}

export function sourceBlock(q: Question): HTMLElement {
  return h(
    'div',
    { class: 'source' },
    h('div', { class: 'source__label' }, `З файлу · ${questionRef(q)}`),
    h('div', { class: 'source__q' }, q.q),
    renderAnswer(q.a),
  );
}

function controls(task: Task, state: UiState, actions: Actions, answered: boolean): HTMLElement {
  const buttons: Child[] = [];
  if (task.kind === 'card') {
    buttons.push(
      h(
        'div',
        { class: 'btns__pair' },
        h(
          'button',
          { type: 'button', class: 'btn btn--bad', 'data-testid': 'dont-know', onclick: () => actions.know(false) },
          icon('close'),
          'Не знав',
        ),
        h(
          'button',
          { type: 'button', class: 'btn btn--ok', 'data-testid': 'know', onclick: () => actions.know(true) },
          icon('check'),
          'Знав',
        ),
      ),
    );
  } else if (answered) {
    buttons.push(
      h('button', { type: 'button', class: 'btn', 'data-testid': 'next', onclick: actions.next }, 'Далі', icon('next')),
    );
  } else if (task.kind === 'multi') {
    buttons.push(
      h(
        'button',
        {
          type: 'button',
          class: 'btn',
          'data-testid': 'submit',
          disabled: state.multi.length === 0,
          onclick: actions.submitMulti,
        },
        icon('submit'),
        'Перевірити',
      ),
    );
  } else if (task.kind === 'order') {
    buttons.push(
      h(
        'button',
        {
          type: 'button',
          class: 'btn',
          'data-testid': 'submit',
          disabled: state.order.length !== task.items.length,
          onclick: actions.submitOrder,
        },
        icon('submit'),
        'Перевірити',
      ),
    );
  }
  if (!answered) {
    buttons.push(
      h(
        'button',
        { type: 'button', class: 'btn btn--ghost', 'data-testid': 'skip', onclick: actions.skip },
        icon('skip'),
        'Пропустити — наступне питання',
      ),
    );
  }
  buttons.push(
    h(
      'button',
      { type: 'button', class: 'btn btn--ghost', 'data-testid': 'finish', onclick: actions.finish },
      icon('flag'),
      'Завершити тест',
    ),
  );
  return h('div', { class: 'btns' }, buttons);
}

/** Гарячі клавіші на екрані тесту. Повертає true, якщо клавішу оброблено. */
export function handleQuizKey(e: KeyboardEvent, state: UiState, actions: Actions): boolean {
  const s = state.session!;
  const task = currentTask(s);
  if (!task) return false;
  const answered = !!currentResult(s);
  const key = e.key.toLowerCase();
  const digit = /^[1-9]$/.test(key) ? Number(key) - 1 : -1;
  const target = e.target as HTMLElement | null;
  const onButton = target?.tagName === 'BUTTON';
  /** Кнопки керування (Далі, Завершити, зірочка, меню) обробляють Enter самі. */
  const onControl = !!target?.closest('.btns, .star, .iconbtn, .notice, .topbar');

  if (task.kind === 'card') {
    if ((key === ' ' && !onButton) || key === 'f') return (actions.flip(), true);
    if (key === 'arrowleft' || key === '1') return (actions.know(false), true);
    if (key === 'arrowright' || key === '2') return (actions.know(true), true);
    if (key === 's') return (actions.skip(), true);
    return false;
  }
  if (answered) {
    if ((key === 'enter' && !onControl) || key === 'arrowright') return (actions.next(), true);
    return false;
  }
  if (key === 's') return (actions.skip(), true);
  switch (task.kind) {
    case 'choice': {
      const letter = 'абвг'.indexOf(key) >= 0 ? 'абвг'.indexOf(key) : 'abcd'.indexOf(key);
      const i = digit >= 0 ? digit : letter;
      if (i >= 0 && i < task.options.length) return (actions.choose(i), true);
      return false;
    }
    case 'tf':
      if (key === '1' || key === 'y' || key === 'т') return (actions.answerTf(true), true);
      if (key === '2' || key === 'n' || key === 'н') return (actions.answerTf(false), true);
      return false;
    case 'multi':
      if (digit >= 0 && digit < task.options.length) return (actions.toggleMulti(digit), true);
      if (key === 'enter' && !onButton) return (actions.submitMulti(), true);
      return false;
    case 'order': {
      const remaining = task.shuffled.filter((i) => !state.order.includes(i));
      if (digit >= 0 && digit < remaining.length) return (actions.pickOrder(remaining[digit]!), true);
      if (key === 'backspace' && state.order.length) return (actions.undoOrder(state.order.length - 1), true);
      if (key === 'enter' && !onButton) return (actions.submitOrder(), true);
      return false;
    }
  }
}
