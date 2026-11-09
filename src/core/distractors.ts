import type { Answer, Question, QuestionId } from '../data/types.ts';
import { shuffle, type Rng } from './rng.ts';
import { answerItems, flattenText, isGroup, normalize, sameAnswer, sameItemSet } from './text.ts';

/**
 * «Легкі» неправильні варіанти: правильні відповіді на СУМІЖНІ питання файлу.
 *
 * Складні варіанти (`Question.w`) відрізняються від правильної відповіді одним-двома
 * пунктами чи словами. Легкі — це відповіді на інші питання того самого модуля
 * (найближчі за номером), тож вони мають ту саму форму (визначення ↔ визначення,
 * список ↔ список подібної довжини), але за змістом помітно відрізняються.
 *
 * Гарантії:
 * - жоден варіант не збігається з правильною відповіддю (ні дослівно, ні як набір пунктів);
 * - варіант не має спільних пунктів із правильною відповіддю і не схожий на неї за словами;
 * - варіанти не повторюються між собою;
 * - питання з однаковим текстом у різних модулях (`groupOf`) не дають відповідей одне одному.
 */

/** Скільки найближчих кандидатів розглядати, щоб варіанти не були щоразу однакові. */
const NEAREST = 7;
/** Поріг схожості за словами (частка спільних основ від меншої відповіді). */
const MAX_WORD_OVERLAP = 0.5;

type Shape = 'def' | 'list';

const shapeOf = (a: Answer): Shape => (a.length === 1 && !isGroup(a[0]!) ? 'def' : 'list');

const itemCount = (a: Answer): number => answerItems(a).length;

/** Кеш за об’єктом відповіді: відповіді з даних незмінні, тож обчислюємо один раз. */
function memo<T>(fn: (a: Answer) => T): (a: Answer) => T {
  const cache = new WeakMap<Answer, T>();
  return (a) => {
    let v = cache.get(a);
    if (v === undefined) cache.set(a, (v = fn(a)));
    return v;
  };
}

/** Грубі основи слів (перші 5 літер слів від 4 літер) — для порівняння змісту. */
const stems = memo((a: Answer): Set<string> => {
  const words = flattenText(a)
    .join(' ')
    .toLowerCase()
    .replace(/[’ʼ'`]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 4);
  return new Set(words.map((w) => w.slice(0, 5)));
});

const normalizedItems = memo((a: Answer): Set<string> => new Set(answerItems(a).map(normalize)));

/** Частка спільних основ від меншої з двох відповідей (0…1). */
export function wordOverlap(a: Answer, b: Answer): number {
  const x = stems(a);
  const y = stems(b);
  const min = Math.min(x.size, y.size);
  if (min === 0) return 0;
  let common = 0;
  for (const s of x) if (y.has(s)) common++;
  return common / min;
}

/** Чи достатньо відповідь `b` відрізняється від `a`, щоб бути легким неправильним варіантом. */
export function clearlyDifferent(a: Answer, b: Answer): boolean {
  if (sameAnswer(a, b) || sameItemSet(a, b)) return false;
  const items = normalizedItems(a);
  for (const i of normalizedItems(b)) if (items.has(i)) return false;
  return wordOverlap(a, b) < MAX_WORD_OVERLAP;
}

/** Відстань між питаннями: спершу той самий модуль і форма, потім номер і довжина. */
function distance(q: Question, other: Question): number {
  const module = q.module === other.module ? 0 : 1000;
  const shape = shapeOf(q.a) === shapeOf(other.a) ? 0 : 500;
  const near = Math.abs(q.n - other.n);
  const size =
    shapeOf(q.a) === 'list'
      ? Math.abs(itemCount(q.a) - itemCount(other.a)) * 3
      : Math.abs(Math.log((flattenText(q.a)[0]!.length + 1) / (flattenText(other.a)[0]!.length + 1))) * 4;
  return module + shape + near + size;
}

/** Кандидати, відсортовані за відстанню, — не залежать від випадковості, тож кешуються. */
type GroupOf = (id: QuestionId) => string;
type Ranked = readonly { readonly o: Question }[];
const rankedCache = new WeakMap<readonly Question[], WeakMap<GroupOf, Map<QuestionId, Ranked>>>();

/** Кожне питання — окрема група (за замовчуванням). */
const ownGroup: GroupOf = (id) => id;

function rankedCandidates(q: Question, pool: readonly Question[], groupOf: GroupOf): Ranked {
  let byGroup = rankedCache.get(pool);
  if (!byGroup) rankedCache.set(pool, (byGroup = new WeakMap()));
  let byQuestion = byGroup.get(groupOf);
  if (!byQuestion) byGroup.set(groupOf, (byQuestion = new Map()));
  const hit = byQuestion.get(q.id);
  if (hit) return hit;
  const group = groupOf(q.id);
  const ranked = pool
    .filter((o) => o.id !== q.id && groupOf(o.id) !== group && clearlyDifferent(q.a, o.a))
    .map((o) => ({ o, d: distance(q, o) }))
    .sort((x, y) => x.d - y.d || (x.o.id < y.o.id ? -1 : 1));
  byQuestion.set(q.id, ranked);
  return ranked;
}

/**
 * Підбирає `count` легких неправильних варіантів для питання `q` із пулу `pool`.
 * Повертає менше, якщо відповідних кандидатів не вистачає.
 */
export function easyDistractors(
  q: Question,
  pool: readonly Question[],
  rng: Rng,
  count = 3,
  groupOf: GroupOf = ownGroup,
): Answer[] {
  const ranked = rankedCandidates(q, pool, groupOf);
  const out: Answer[] = [];
  const take = (candidates: Ranked) => {
    for (const { o } of candidates) {
      if (out.length >= count) return;
      if (out.every((a) => !sameAnswer(a, o.a) && !sameItemSet(a, o.a))) out.push(o.a);
    }
  };
  // Випадкові з найближчих, а якщо їх не вистачило — наступні за відстанню.
  take(shuffle(ranked.slice(0, Math.max(NEAREST, count)), rng));
  take(ranked.slice(Math.max(NEAREST, count)));
  return out;
}

/**
 * Легкі «зайві» пункти для формату «кілька відповідей»: пункти з відповідей
 * на суміжні питання, яких немає серед правильних і які не схожі на них.
 */
export function easyExtraItems(
  q: Question,
  pool: readonly Question[],
  rng: Rng,
  count: number,
  groupOf: GroupOf = ownGroup,
): string[] {
  const correct = answerItems(q.a);
  const taken = new Set(correct.map(normalize));
  const sources = easyDistractors(q, pool, rng, 6, groupOf)
    .filter((a) => shapeOf(a) === 'list')
    .map((a) => shuffle(answerItems(a), rng));
  const out: string[] = [];
  // По черзі по одному пункту з кожної відповіді — так варіанти різноманітніші.
  for (let round = 0; out.length < count && sources.some((s) => s.length > round); round++) {
    for (const items of sources) {
      const item = items[round];
      if (item === undefined || out.length >= count) continue;
      const key = normalize(item);
      if (taken.has(key) || correct.some((c) => wordOverlap([c], [item]) >= MAX_WORD_OVERLAP)) continue;
      taken.add(key);
      out.push(item);
    }
  }
  return out;
}
