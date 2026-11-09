import type { QuestionId, SetId } from '../data/types.ts';
import { isCorrect, type Difficulty, type Mode, type Response, type Task } from './round.ts';

/** Звідки взялися питання раунду. */
export type Source = 'regular' | 'hard' | 'saved' | 'retry';

export interface SessionConfig {
  readonly setId: SetId;
  readonly mode: Mode;
  /** Складність варіантів (лише для режиму вибору). */
  readonly difficulty: Difficulty;
  readonly source: Source;
  /** Кількість помилок, за якої тест вважається нескладеним. */
  readonly limit: number;
  /** Кількість питань для regular-раунду (для перезапуску). */
  readonly count: number;
  /** Фіксований список питань (hard / saved / retry). */
  readonly ids: readonly QuestionId[] | null;
}

export interface TaskResult {
  readonly correct: boolean;
  readonly response: Response;
}

export interface Session {
  readonly v: 1;
  readonly config: SessionConfig;
  readonly tasks: readonly Task[];
  /** Індекси завдань, що чекають на показ. */
  readonly queue: readonly number[];
  /** Пропущені завдання — показуються після основної черги. */
  readonly deferred: readonly number[];
  readonly current: number | null;
  readonly results: readonly (TaskResult | null)[];
  /** Чи пропускалося завдання хоча б раз (для позначки «пропущене»). */
  readonly skipped: readonly boolean[];
  readonly failNoticeShown: boolean;
  /** Тест завершено достроково кнопкою «Завершити». */
  readonly endedEarly: boolean;
}

export interface SessionStats {
  readonly total: number;
  readonly answered: number;
  readonly correct: number;
  readonly wrong: number;
  /** Пропущені й ще не відповідені. */
  readonly pendingSkipped: number;
}

export function createSession(config: SessionConfig, tasks: readonly Task[]): Session {
  const indices = tasks.map((_, i) => i);
  return {
    v: 1,
    config,
    tasks,
    queue: indices.slice(1),
    deferred: [],
    current: indices.length ? 0 : null,
    results: tasks.map(() => null),
    skipped: tasks.map(() => false),
    failNoticeShown: false,
    endedEarly: false,
  };
}

export const currentTask = (s: Session): Task | null => (s.current === null ? null : (s.tasks[s.current] ?? null));

export const currentResult = (s: Session): TaskResult | null =>
  s.current === null ? null : (s.results[s.current] ?? null);

/** Записує відповідь на поточне завдання (не переходить далі). */
export function respond(s: Session, response: Response): Session {
  const task = currentTask(s);
  if (!task || s.current === null || s.results[s.current]) return s;
  const results = s.results.slice();
  results[s.current] = { correct: isCorrect(task, response), response };
  return { ...s, results };
}

/** Перехід до наступного завдання; пропущені йдуть після основної черги. */
export function advance(s: Session): Session {
  if (s.queue.length > 0) return { ...s, current: s.queue[0]!, queue: s.queue.slice(1) };
  if (s.deferred.length > 0) return { ...s, current: s.deferred[0]!, queue: s.deferred.slice(1), deferred: [] };
  return { ...s, current: null };
}

/** Відкладає поточне завдання (без відповіді) і переходить далі. */
export function skip(s: Session): Session {
  if (s.current === null || s.results[s.current]) return s;
  const skipped = s.skipped.slice();
  skipped[s.current] = true;
  return advance({ ...s, deferred: [...s.deferred, s.current], skipped });
}

/**
 * Замінює завдання `index` іншим (наприклад, коли питання виключили):
 * нове завдання займає те саме місце в черзі, відповідь і позначка «пропущене» скидаються.
 */
export function replaceTask(s: Session, index: number, task: Task): Session {
  if (index < 0 || index >= s.tasks.length) return s;
  const tasks = s.tasks.slice();
  const results = s.results.slice();
  const skipped = s.skipped.slice();
  tasks[index] = task;
  results[index] = null;
  skipped[index] = false;
  return { ...s, tasks, results, skipped };
}

/**
 * Прибирає завдання `index` з раунду (кількість питань зменшується).
 * Якщо це поточне завдання — переходимо до наступного.
 */
export function removeTask(s: Session, index: number): Session {
  if (index < 0 || index >= s.tasks.length) return s;
  const keep = (_: unknown, i: number) => i !== index;
  const shift = (i: number) => (i > index ? i - 1 : i);
  const next: Session = {
    ...s,
    tasks: s.tasks.filter(keep),
    results: s.results.filter(keep),
    skipped: s.skipped.filter(keep),
    queue: s.queue.filter((i) => i !== index).map(shift),
    deferred: s.deferred.filter((i) => i !== index).map(shift),
    current: s.current === null || s.current === index ? null : shift(s.current),
  };
  return s.current === index ? advance(next) : next;
}

export function finishEarly(s: Session): Session {
  return { ...s, current: null, queue: [], deferred: [], endedEarly: true };
}

export function markFailNotice(s: Session): Session {
  return { ...s, failNoticeShown: true };
}

export function stats(s: Session): SessionStats {
  let correct = 0;
  let wrong = 0;
  for (const r of s.results) {
    if (!r) continue;
    if (r.correct) correct++;
    else wrong++;
  }
  const waiting = new Set([...s.queue, ...s.deferred, ...(s.current === null ? [] : [s.current])]);
  const pendingSkipped = [...waiting].filter((i) => s.skipped[i] && !s.results[i]).length;
  return { total: s.tasks.length, answered: correct + wrong, correct, wrong, pendingSkipped };
}

export const isFailed = (s: Session): boolean => stats(s).wrong >= s.config.limit;

export const isFinished = (s: Session): boolean => s.current === null;

/** Чи треба показати повідомлення про досягнення ліміту помилок. */
export const needsFailNotice = (s: Session): boolean => isFailed(s) && !s.failNoticeShown && !isFinished(s);

/** Питання, на які відповіли неправильно (у порядку відповіді в раунді). */
export function wrongTaskIndices(s: Session): number[] {
  return s.results.flatMap((r, i) => (r && !r.correct ? [i] : []));
}
