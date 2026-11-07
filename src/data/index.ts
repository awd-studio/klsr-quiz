import { module1 } from './module1.ts';
import { module2 } from './module2.ts';
import { module3 } from './module3.ts';
import type { ModuleId, Question, QuestionId, QuestionSeed, QuestionSet, SetId } from './types.ts';
import { variants } from './variants.ts';

export type * from './types.ts';

const toQuestions = (module: ModuleId, seeds: readonly QuestionSeed[]): Question[] =>
  seeds.map((seed) => {
    const id: QuestionId = `m${module}-${seed.n}`;
    return { ...seed, id, module, variants: variants[id] ?? [] };
  });

/** Усі питання з файлу в порядку модулів і номерів. */
export const QUESTIONS: readonly Question[] = [
  ...toQuestions(1, module1),
  ...toQuestions(2, module2),
  ...toQuestions(3, module3),
];

const BY_ID = new Map<string, Question>(QUESTIONS.map((q) => [q.id, q]));

export const getQuestion = (id: string): Question | undefined => BY_ID.get(id);

/**
 * Питання з однаковим текстом у різних модулях файлу. У «Загальному» наборі
 * в один раунд потрапляє лише одне питання з групи.
 */
export const SAME_QUESTION: readonly (readonly QuestionId[])[] = [
  ['m1-32', 'm2-4'], // «Що таке індивідуальна підготовка?» / «Індивідуальна підготовка – це… ?»
  ['m1-73', 'm3-20'], // «Типи конфліктів…?» / «Типи конфліктів:»
];

const GROUP = new Map<string, string>(SAME_QUESTION.flatMap((g) => g.map((id) => [id, g[0]!] as const)));

/** Ключ групи однакових питань (для інших питань — власний id). */
export const sameQuestionGroup = (id: QuestionId): string => GROUP.get(id) ?? id;

export const SETS: Readonly<Record<SetId, QuestionSet>> = {
  m1: { id: 'm1', title: 'Модуль 1', modules: [1] },
  all: { id: 'all', title: 'Загальний', modules: [1, 2, 3] },
};

/** Порядок як у файлі: спершу модуль, потім номер. */
export function compareIds(a: string, b: string): number {
  const [ma, na] = parseId(a);
  const [mb, nb] = parseId(b);
  return ma - mb || na - nb;
}

function parseId(id: string): [number, number] {
  const match = /^m(\d)-(\d+)$/.exec(id);
  return match ? [Number(match[1]), Number(match[2])] : [9, 9999];
}

export const questionsOfSet = (setId: SetId): Question[] =>
  QUESTIONS.filter((q) => SETS[setId].modules.includes(q.module));

export const isInSet = (setId: SetId, id: string): boolean => {
  const q = getQuestion(id);
  return !!q && SETS[setId].modules.includes(q.module);
};
