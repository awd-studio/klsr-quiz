import { SETS, getQuestion } from '../../data/index.ts';
import { gradeFor, gradeThresholds } from '../../core/grading.ts';
import { DIFFICULTY_LABEL, TF_PREFIX, type Task } from '../../core/round.ts';
import { stats, wrongTaskIndices, type TaskResult } from '../../core/session.ts';
import { questionRef, renderAnswer, starButton } from '../components.ts';
import { cx, h, type Child } from '../dom.ts';
import type { Ctx } from '../state.ts';

const SOURCE_LABEL = {
  regular: '',
  hard: ' · складні питання',
  saved: ' · збережені питання',
  retry: ' · повтор помилок',
} as const;

export function resultView({ state, actions }: Ctx): HTMLElement {
  const s = state.session!;
  const st = stats(s);
  const failed = st.wrong >= s.config.limit;
  const complete = !s.endedEarly && st.answered === st.total;
  const passed = complete && !failed;
  const status = failed ? 'Тест не складено' : complete ? 'Тест складено' : 'Тест завершено достроково';
  const pct = st.total ? Math.round((st.correct / st.total) * 100) : 0;
  const grade = gradeFor(st.correct, st.total);
  const scale = gradeThresholds(st.total)
    .filter((g) => g.key !== 'fail')
    .map((g) => `${g.label} від ${g.min}`)
    .join(', ');
  const wrong = wrongTaskIndices(s);

  return h(
    'main',
    { class: 'screen screen--result' },
    h(
      'section',
      { class: 'panel panel--center' },
      h(
        'div',
        { class: 'muted' },
        `${SETS[s.config.setId].title} · ${s.config.mode === 'cards' ? 'Картки' : `Вибір варіанту (${DIFFICULTY_LABEL[s.config.difficulty]})`}${SOURCE_LABEL[s.config.source]}`,
      ),
      h('div', { class: 'big', 'data-testid': 'result-pct' }, `${pct}%`),
      h(
        'h1',
        {
          class: cx('status', passed ? 'is-ok' : 'is-bad'),
          tabindex: '-1',
          'data-autofocus': true,
          'data-testid': 'result-status',
        },
        status,
      ),
      h(
        'p',
        { class: 'muted', 'data-testid': 'result-line' },
        `Правильно: ${st.correct} · Неправильно: ${st.wrong} · Відповідей: ${st.answered} з ${st.total} · Ліміт помилок: ${s.config.limit}`,
      ),
      // На малій кількості питань пороги шкали зливаються — оцінку не показуємо.
      st.total < 10
        ? null
        : h(
            'p',
            { class: 'grade', 'data-testid': 'result-grade' },
            'За шкалою заліку: ',
            h('b', null, grade.label),
            h('small', null, ` (${scale} з ${st.total})`),
          ),
    ),
    h(
      'div',
      { class: 'btns' },
      h('button', { type: 'button', class: 'btn', 'data-testid': 'again', onclick: actions.again }, 'Пройти знову'),
      wrong.length
        ? h(
            'button',
            { type: 'button', class: 'btn btn--secondary', 'data-testid': 'retry', onclick: actions.retryMistakes },
            `Повторити помилки (${wrong.length})`,
          )
        : null,
      h(
        'button',
        { type: 'button', class: 'btn btn--ghost', 'data-testid': 'home', onclick: actions.home },
        'Головне меню',
      ),
    ),
    wrong.length
      ? h(
          'section',
          { class: 'panel' },
          h('h2', null, 'Помилки'),
          h(
            'div',
            { class: 'rlist' },
            wrong.map((i) => mistake(s.tasks[i]!, s.results[i]!, state.data.saved, actions.toggleSaved)),
          ),
        )
      : null,
  );
}

function mistake(
  task: Task,
  result: TaskResult,
  saved: readonly string[],
  toggleSaved: (id: Task['qid']) => void,
): HTMLElement {
  const q = getQuestion(task.qid)!;
  const asked = taskPrompt(task);
  return h(
    'article',
    { class: 'rlist__item', 'data-qid': q.id },
    h(
      'div',
      { class: 'rlist__meta' },
      h('span', null, questionRef(q)),
      starButton(saved.includes(q.id), () => toggleSaved(q.id)),
    ),
    asked ? h('div', { class: 'rlist__q' }, asked) : null,
    yourAnswer(task, result),
    h('div', { class: 'rlist__label' }, asked ? 'З файлу' : 'Питання'),
    h('div', { class: 'rlist__q' }, q.q),
    h('div', { class: 'rlist__label' }, 'Правильна відповідь'),
    renderAnswer(q.a),
  );
}

/** Як питання було сформульоване в раунді, якщо не дослівно з файлу. */
function taskPrompt(task: Task): string | null {
  switch (task.kind) {
    case 'card':
      return null;
    case 'choice':
      return task.source === 'base' ? null : task.prompt;
    case 'tf':
      return `${TF_PREFIX} ${task.statement}?`;
    case 'multi':
    case 'order':
      return task.prompt;
  }
}

function yourAnswer(task: Task, result: TaskResult): Child {
  const r = result.response;
  let content: Child = null;
  if (task.kind === 'choice' && r.kind === 'choice') content = renderAnswer(task.options[r.index]!.answer);
  if (task.kind === 'tf' && r.kind === 'tf')
    content = `${r.value ? 'Так' : 'Ні'} (правильно: ${task.correct ? 'Так' : 'Ні'})`;
  if (task.kind === 'multi' && r.kind === 'multi') content = r.selected.map((i) => task.options[i]!.text).join('; ');
  if (task.kind === 'order' && r.kind === 'order')
    content = h(
      'ol',
      { class: 'answer-list' },
      r.sequence.map((i) => h('li', null, task.items[i])),
    );
  if (content === null) return null;
  return [h('div', { class: 'rlist__label is-bad' }, 'Ваша відповідь'), h('div', { class: 'rlist__yours' }, content)];
}
