import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { QUESTIONS, SAME_QUESTION, getQuestion, questionsOfSet, sameQuestionGroup } from '../../src/data/index.ts';
import type { Question, Variant } from '../../src/data/types.ts';
import { seeded } from '../../src/core/rng.ts';
import { altCount, buildTasks, isCorrect, pickQuestions, taskFor, type Task } from '../../src/core/round.ts';
import { answerItems, sameAnswer } from '../../src/core/text.ts';

const q = (id: string): Question => getQuestion(id)!;
const variantOf = (id: string, kind: Variant['kind']): Variant => q(id).variants.find((v) => v.kind === kind)!;

describe('pickQuestions', () => {
  it('returns the requested number of distinct questions', () => {
    const picked = pickQuestions(questionsOfSet('m1'), 20, seeded(3));
    assert.equal(picked.length, 20);
    assert.equal(new Set(picked.map((x) => x.id)).size, 20);
    assert.ok(picked.every((x) => x.module === 1));
  });

  it('never puts two same-text questions from different modules into one round', () => {
    for (let seed = 0; seed < 50; seed++) {
      const ids = pickQuestions(questionsOfSet('all'), null, seeded(seed), sameQuestionGroup).map((x) => x.id);
      assert.equal(ids.length, 209 - SAME_QUESTION.length);
      for (const group of SAME_QUESTION) assert.equal(group.filter((id) => ids.includes(id)).length, 1);
    }
  });
});

describe('altCount', () => {
  it('is 10% rounded, at least one from 10 questions', () => {
    assert.equal(altCount(4), 0);
    assert.equal(altCount(10), 1);
    assert.equal(altCount(20), 2);
    assert.equal(altCount(30), 3);
    assert.equal(altCount(100), 10);
    assert.equal(altCount(207), 21);
    assert.equal(altCount(20, 0.05), 1);
    assert.equal(altCount(20, 1), 20);
    assert.equal(altCount(20, 0), 0);
  });
});

const kindOf = (t: Task) => (t.kind === 'choice' && t.source === 'base' ? 'base' : t.kind);

describe('buildTasks', () => {
  it('cards mode produces only cards', () => {
    const tasks = buildTasks(QUESTIONS, { mode: 'cards', rng: seeded(1) });
    assert.ok(tasks.every((t) => t.kind === 'card'));
  });

  it('choice mode: exactly altCount questions use another format, the rest are standard', () => {
    for (const n of [10, 20, 30, 100, 209]) {
      for (let seed = 0; seed < 20; seed++) {
        const questions = pickQuestions(questionsOfSet('all'), n, seeded(seed));
        const tasks = buildTasks(questions, { mode: 'choice', rng: seeded(seed + 1000) });
        assert.equal(tasks.filter((t) => kindOf(t) !== 'base').length, altCount(n), `n=${n} seed=${seed}`);
      }
    }
  });

  it('a question appears only once per round (never in two formats)', () => {
    for (let seed = 0; seed < 20; seed++) {
      const tasks = buildTasks(questionsOfSet('all'), { mode: 'choice', rng: seeded(seed), altShare: 0.5 });
      assert.equal(new Set(tasks.map((t) => t.qid)).size, tasks.length);
    }
  });

  it('alternative formats are only used for questions that have them', () => {
    const tasks = buildTasks(QUESTIONS, { mode: 'choice', rng: seeded(3), altShare: 1 });
    for (const t of tasks) {
      if (kindOf(t) !== 'base') assert.ok(q(t.qid).variants.length > 0);
      else assert.equal(q(t.qid).variants.length, 0);
    }
    const kinds = new Set(tasks.map((t) => (t.kind === 'choice' ? `choice:${t.source}` : t.kind)));
    for (const k of ['choice:base', 'choice:term', 'tf', 'multi', 'order']) assert.ok(kinds.has(k), k);
  });
});

describe('taskFor', () => {
  it('base choice: 4 options, exactly one correct and equal to the file answer', () => {
    const t = taskFor(q('m1-5'), null, seeded(2));
    assert.equal(t.kind, 'choice');
    if (t.kind !== 'choice') return;
    assert.equal(t.options.length, 4);
    const correct = t.options.filter((o) => o.correct);
    assert.equal(correct.length, 1);
    assert.ok(sameAnswer(correct[0]!.answer, q('m1-5').a));
  });

  it('term: definition is the file answer, correct option is the term', () => {
    const t = taskFor(q('m1-24'), variantOf('m1-24', 'term'), seeded(2));
    assert.equal(t.kind, 'choice');
    if (t.kind !== 'choice') return;
    assert.deepEqual(t.quote, q('m1-24').a);
    assert.deepEqual(t.options.find((o) => o.correct)!.answer, ['Групова мотивація']);
  });

  it('multi: correct options are exactly the answer items', () => {
    const t = taskFor(q('m1-69'), variantOf('m1-69', 'multi'), seeded(2));
    assert.equal(t.kind, 'multi');
    if (t.kind !== 'multi') return;
    assert.deepEqual(
      t.options
        .filter((o) => o.correct)
        .map((o) => o.text)
        .sort(),
      answerItems(q('m1-69').a).sort(),
    );
  });

  it('order: items strip numbering and the shown order differs from the correct one', () => {
    for (let seed = 0; seed < 30; seed++) {
      const t = taskFor(q('m3-57'), variantOf('m3-57', 'order'), seeded(seed));
      assert.equal(t.kind, 'order');
      if (t.kind !== 'order') return;
      assert.equal(t.items.length, 8);
      assert.equal(t.items[0], 'Отримання бойового завдання');
      assert.ok(t.shuffled.some((v, i) => v !== i));
    }
  });
});

describe('isCorrect', () => {
  const choice = taskFor(q('m1-5'), null, seeded(9)) as Extract<Task, { kind: 'choice' }>;
  const right = choice.options.findIndex((o) => o.correct);

  it('choice', () => {
    assert.ok(isCorrect(choice, { kind: 'choice', index: right }));
    assert.ok(!isCorrect(choice, { kind: 'choice', index: (right + 1) % 4 }));
  });

  it('card', () => {
    const card = taskFor(q('m1-1'), null, seeded(1), 'cards');
    assert.ok(isCorrect(card, { kind: 'card', known: true }));
    assert.ok(!isCorrect(card, { kind: 'card', known: false }));
  });

  it('tf', () => {
    const t = taskFor(q('m3-57'), q('m3-57').variants.find((v) => v.kind === 'tf' && !v.correct)!, seeded(1));
    assert.ok(isCorrect(t, { kind: 'tf', value: false }));
    assert.ok(!isCorrect(t, { kind: 'tf', value: true }));
  });

  it('multi requires the exact set', () => {
    const t = taskFor(q('m1-69'), variantOf('m1-69', 'multi'), seeded(4)) as Extract<Task, { kind: 'multi' }>;
    const all = t.options.flatMap((o, i) => (o.correct ? [i] : []));
    assert.ok(isCorrect(t, { kind: 'multi', selected: all }));
    assert.ok(!isCorrect(t, { kind: 'multi', selected: all.slice(1) }));
    assert.ok(!isCorrect(t, { kind: 'multi', selected: t.options.map((_, i) => i) }));
  });

  it('order requires the exact sequence', () => {
    const t = taskFor(q('m3-35'), variantOf('m3-35', 'order'), seeded(4)) as Extract<Task, { kind: 'order' }>;
    assert.ok(isCorrect(t, { kind: 'order', sequence: [0, 1, 2, 3, 4] }));
    assert.ok(!isCorrect(t, { kind: 'order', sequence: [1, 0, 2, 3, 4] }));
    assert.ok(!isCorrect(t, { kind: 'order', sequence: [0, 1, 2] }));
  });
});
