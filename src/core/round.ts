import { QUESTIONS, sameQuestionGroup } from '../data/index.ts';
import type { Answer, Question, QuestionId, Variant } from '../data/types.ts';
import { easyDistractors, easyExtraItems } from './distractors.ts';
import { pick, shuffle, type Rng } from './rng.ts';
import { answerItems, stripNumber } from './text.ts';

export type Mode = 'cards' | 'choice';

/**
 * Складність варіантів у режимі вибору:
 * `hard` — неправильні варіанти з файлу, дуже схожі на правильний (як на заліку);
 * `easy` — відповіді на суміжні питання: та сама форма, але помітно інший зміст.
 */
export type Difficulty = 'hard' | 'easy';

export const DIFFICULTY_LABEL: Readonly<Record<Difficulty, string>> = { hard: 'складні', easy: 'легкі' };

export interface ChoiceOption {
  readonly answer: Answer;
  readonly correct: boolean;
}

export interface MultiOption {
  readonly text: string;
  readonly correct: boolean;
}

/** Одне завдання раунду — конкретна форма подання одного питання. */
export type Task =
  | { readonly kind: 'card'; readonly qid: QuestionId; readonly exam: boolean }
  | {
      readonly kind: 'choice';
      readonly qid: QuestionId;
      /** base — питання з файлу; term — визначення → термін; mcq — формулювання з білетів. */
      readonly source: 'base' | 'term' | 'mcq';
      readonly prompt: string;
      /** Цитата під питанням (визначення для формату term). */
      readonly quote: Answer | null;
      readonly options: readonly ChoiceOption[];
      readonly exam: boolean;
    }
  | {
      readonly kind: 'tf';
      readonly qid: QuestionId;
      readonly statement: string;
      readonly correct: boolean;
      readonly exam: boolean;
    }
  | {
      readonly kind: 'multi';
      readonly qid: QuestionId;
      readonly prompt: string;
      readonly options: readonly MultiOption[];
      readonly exam: boolean;
    }
  | {
      readonly kind: 'order';
      readonly qid: QuestionId;
      readonly prompt: string;
      /** Пункти у правильному порядку (без нумерації). */
      readonly items: readonly string[];
      /** Порядок показу: індекси в `items`. */
      readonly shuffled: readonly number[];
      readonly exam: boolean;
    };

export type TaskKind = Task['kind'];

/** Відповідь користувача на завдання. */
export type Response =
  | { readonly kind: 'card'; readonly known: boolean }
  | { readonly kind: 'choice'; readonly index: number }
  | { readonly kind: 'tf'; readonly value: boolean }
  | { readonly kind: 'multi'; readonly selected: readonly number[] }
  | { readonly kind: 'order'; readonly sequence: readonly number[] };

export interface RoundOptions {
  readonly mode: Mode;
  readonly rng: Rng;
  /** Частка питань в альтернативних форматах (режим «Вибір варіанту»), за замовчуванням ALT_SHARE. */
  readonly altShare?: number;
  /** Складність неправильних варіантів (за замовчуванням `hard`). */
  readonly difficulty?: Difficulty;
}

/** Частка питань у форматах Так/Ні, термін, кілька відповідей, послідовність. */
export const ALT_SHARE = 0.1;

/**
 * Скільки питань раунду подати в альтернативному форматі:
 * 10% від кількості (з округленням), але щонайменше одне, якщо питань від 10.
 */
export function altCount(total: number, share = ALT_SHARE): number {
  return Math.min(total, Math.max(total >= 10 && share > 0 ? 1 : 0, Math.round(total * share)));
}

export const TF_PREFIX = 'Чи правильне твердження, що';

/**
 * Вибирає `count` випадкових питань (або всі, якщо count не задано).
 * Питання з однаковим текстом у різних модулях (`groupOf`) в один раунд разом не потрапляють.
 */
export function pickQuestions(
  pool: readonly Question[],
  count: number | null,
  rng: Rng,
  groupOf: (id: QuestionId) => string = (id) => id,
): Question[] {
  const taken = new Set<string>();
  const out: Question[] = [];
  for (const q of shuffle(pool, rng)) {
    if (count !== null && out.length >= count) break;
    const group = groupOf(q.id);
    if (taken.has(group)) continue;
    taken.add(group);
    out.push(q);
  }
  return out;
}

/**
 * Будує завдання раунду. Кожне питання — рівно одне завдання в одній формі, тож
 * одне й те саме питання не може з’явитися в раунді двічі (наприклад, і як вибір, і як Так/Ні).
 * У режимі вибору ~10% питань (з тих, що мають альтернативні формати) подаються інакше.
 */
export function buildTasks(questions: readonly Question[], options: RoundOptions): Task[] {
  const { mode, rng, altShare = ALT_SHARE, difficulty = 'hard' } = options;
  const alt = new Set<QuestionId>();
  if (mode === 'choice') {
    const candidates = shuffle(
      questions.filter((q) => q.variants.length > 0),
      rng,
    );
    for (const q of candidates.slice(0, altCount(questions.length, altShare))) alt.add(q.id);
  }
  return questions.map((q) => taskFor(q, alt.has(q.id) ? pick(q.variants, rng) : null, rng, mode, difficulty));
}

/** Неправильні варіанти потрібної складності; якщо легких не вистачає — доповнюємо складними. */
function wrongAnswers(q: Question, hard: readonly Answer[], difficulty: Difficulty, rng: Rng): readonly Answer[] {
  if (difficulty === 'hard') return hard;
  const easy = easyDistractors(q, QUESTIONS, rng, hard.length, sameQuestionGroup);
  return [...easy, ...hard.slice(easy.length)];
}

/** Варіанти вибору: правильна відповідь (завжди `Question.a`) + неправильні, у випадковому порядку. */
function choiceOptions(correct: Answer, wrong: readonly Answer[], rng: Rng): ChoiceOption[] {
  return shuffle([{ answer: correct, correct: true }, ...wrong.map((answer) => ({ answer, correct: false }))], rng);
}

export function taskFor(
  q: Question,
  variant: Variant | null,
  rng: Rng,
  mode: Mode = 'choice',
  difficulty: Difficulty = 'hard',
): Task {
  if (variant === null) {
    if (mode === 'cards') return { kind: 'card', qid: q.id, exam: false };
    return {
      kind: 'choice',
      qid: q.id,
      source: 'base',
      prompt: q.q,
      quote: null,
      options: choiceOptions(q.a, wrongAnswers(q, q.w, difficulty, rng), rng),
      exam: false,
    };
  }
  const exam = variant.exam === true;
  switch (variant.kind) {
    case 'tf':
      return { kind: 'tf', qid: q.id, statement: variant.statement, correct: variant.correct, exam };
    case 'term':
      return {
        kind: 'choice',
        qid: q.id,
        source: 'term',
        prompt: 'Якому поняттю відповідає визначення?',
        quote: q.a,
        options: shuffle(
          [variant.term, ...variant.others].map((t, i) => ({ answer: [t], correct: i === 0 })),
          rng,
        ),
        exam,
      };
    case 'mcq':
      return {
        kind: 'choice',
        qid: q.id,
        source: 'mcq',
        prompt: variant.prompt,
        quote: null,
        options: choiceOptions(q.a, wrongAnswers(q, variant.wrong, difficulty, rng), rng),
        exam,
      };
    case 'multi': {
      const extra =
        difficulty === 'easy'
          ? easyExtraItems(q, QUESTIONS, rng, variant.extra.length, sameQuestionGroup)
          : variant.extra.slice();
      // Якщо легких пунктів не вистачило — доповнюємо пунктами з файлу.
      for (const item of variant.extra)
        if (extra.length < variant.extra.length && !extra.includes(item)) extra.push(item);
      return {
        kind: 'multi',
        qid: q.id,
        prompt: variant.prompt ?? q.q,
        options: shuffle(
          [
            ...answerItems(q.a).map((text) => ({ text, correct: true })),
            ...extra.map((text) => ({ text, correct: false })),
          ],
          rng,
        ),
        exam,
      };
    }
    case 'order': {
      const items = (variant.items ?? answerItems(q.a)).map(stripNumber);
      return {
        kind: 'order',
        qid: q.id,
        prompt: variant.prompt ?? `Розставте в правильній послідовності: ${q.q}`,
        items,
        shuffled: shuffledIndices(items.length, rng),
        exam,
      };
    }
  }
}

/**
 * Нове випадкове розташування варіантів для завдання без відповіді
 * (коли пропущене питання повертається або тест продовжують після перерви).
 */
export function reshuffle(task: Task, rng: Rng): Task {
  switch (task.kind) {
    case 'choice':
      return { ...task, options: shuffle(task.options, rng) };
    case 'multi':
      return { ...task, options: shuffle(task.options, rng) };
    case 'order':
      return { ...task, shuffled: shuffledIndices(task.items.length, rng) };
    default:
      return task;
  }
}

/** Перемішані індекси, що гарантовано відрізняються від правильного порядку. */
function shuffledIndices(n: number, rng: Rng): number[] {
  const identity = Array.from({ length: n }, (_, i) => i);
  for (let attempt = 0; attempt < 10; attempt++) {
    const s = shuffle(identity, rng);
    if (s.some((v, i) => v !== i)) return s;
  }
  return identity.slice(1).concat(0);
}

/** Чи правильна відповідь на завдання. */
export function isCorrect(task: Task, response: Response): boolean {
  switch (task.kind) {
    case 'card':
      return response.kind === 'card' && response.known;
    case 'choice':
      return response.kind === 'choice' && task.options[response.index]?.correct === true;
    case 'tf':
      return response.kind === 'tf' && response.value === task.correct;
    case 'multi': {
      if (response.kind !== 'multi') return false;
      const chosen = new Set(response.selected);
      return task.options.every((o, i) => o.correct === chosen.has(i));
    }
    case 'order':
      return (
        response.kind === 'order' &&
        response.sequence.length === task.items.length &&
        response.sequence.every((v, i) => v === i)
      );
  }
}

export const KIND_LABEL: Readonly<Record<TaskKind, string>> = {
  card: 'Картка',
  choice: 'Вибір варіанту',
  tf: 'Так / Ні',
  multi: 'Кілька відповідей',
  order: 'Послідовність',
};
