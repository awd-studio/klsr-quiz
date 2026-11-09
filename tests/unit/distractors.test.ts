import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { QUESTIONS, getQuestion, questionsOfSet, sameQuestionGroup } from '../../src/data/index.ts';
import { clearlyDifferent, easyDistractors, easyExtraItems, wordOverlap } from '../../src/core/distractors.ts';
import { seeded } from '../../src/core/rng.ts';
import { buildTasks, isCorrect, reshuffle, taskFor, type Difficulty, type Task } from '../../src/core/round.ts';
import { answerItems, flattenText, normalize, sameAnswer, sameItemSet } from '../../src/core/text.ts';
import { parseChangelog } from '../../src/core/changelog.ts';

const key = (a: readonly unknown[]) => JSON.stringify(a);

describe('easy distractors', () => {
  for (const q of QUESTIONS) {
    it(`${q.id}: 3 distinct, clearly different wrong answers from other questions`, () => {
      for (let seed = 0; seed < 5; seed++) {
        const d = easyDistractors(q, QUESTIONS, seeded(seed), 3, sameQuestionGroup);
        assert.equal(d.length, 3);
        assert.equal(new Set(d.map(key)).size, 3, 'distinct');
        for (const a of d) {
          assert.ok(!sameAnswer(a, q.a) && !sameItemSet(a, q.a), 'not the correct answer');
          assert.ok(clearlyDifferent(q.a, a), `too similar: ${flattenText(a).join(' | ')}`);
          // Це правильна відповідь на інше питання (не з тієї ж групи однакових питань).
          const owner = QUESTIONS.find((o) => o.a === a)!;
          assert.ok(owner && owner.id !== q.id && sameQuestionGroup(owner.id) !== sameQuestionGroup(q.id));
        }
      }
    });
  }

  it('prefer adjacent questions of the same module and the same answer shape', () => {
    let sameModule = 0;
    let sameShape = 0;
    let total = 0;
    for (const q of QUESTIONS) {
      for (const a of easyDistractors(q, QUESTIONS, seeded(1), 3, sameQuestionGroup)) {
        const owner = QUESTIONS.find((o) => o.a === a)!;
        total++;
        if (owner.module === q.module) sameModule++;
        const def = (x: typeof a) => x.length === 1 && typeof x[0] === 'string';
        if (def(a) === def(q.a)) sameShape++;
      }
    }
    assert.ok(sameModule / total > 0.95, `same module ${sameModule}/${total}`);
    assert.ok(sameShape / total > 0.95, `same shape ${sameShape}/${total}`);
  });

  it('are on average much less similar to the correct answer than the hard ones', () => {
    let easy = 0;
    let hard = 0;
    for (const q of QUESTIONS) {
      hard += q.w.reduce((s, w) => s + wordOverlap(q.a, w), 0) / q.w.length;
      const d = easyDistractors(q, QUESTIONS, seeded(2), 3, sameQuestionGroup);
      easy += d.reduce((s, w) => s + wordOverlap(q.a, w), 0) / d.length;
    }
    assert.ok(easy / QUESTIONS.length < 0.25, `easy overlap ${easy / QUESTIONS.length}`);
    assert.ok(hard / QUESTIONS.length > 0.5, `hard overlap ${hard / QUESTIONS.length}`);
    assert.ok(easy * 2 < hard);
  });

  it('extra items for «multi» never coincide with the correct items', () => {
    for (const q of QUESTIONS) {
      for (const v of q.variants) {
        if (v.kind !== 'multi') continue;
        const extra = easyExtraItems(q, QUESTIONS, seeded(3), v.extra.length, sameQuestionGroup);
        const correct = new Set(answerItems(q.a).map(normalize));
        assert.ok(extra.length >= 1, q.id);
        assert.equal(new Set(extra.map(normalize)).size, extra.length);
        for (const e of extra) assert.ok(!correct.has(normalize(e)), `${q.id}: ${e}`);
      }
    }
  });
});

/** Відповідь, що вважається правильною для завдання. */
function rightResponse(t: Task) {
  switch (t.kind) {
    case 'card':
      return { kind: 'card', known: true } as const;
    case 'choice':
      return { kind: 'choice', index: t.options.findIndex((o) => o.correct) } as const;
    case 'tf':
      return { kind: 'tf', value: t.correct } as const;
    case 'multi':
      return { kind: 'multi', selected: t.options.flatMap((o, i) => (o.correct ? [i] : [])) } as const;
    case 'order':
      return { kind: 'order', sequence: t.items.map((_, i) => i) } as const;
  }
}

describe('round difficulty', () => {
  for (const difficulty of ['hard', 'easy'] as Difficulty[]) {
    it(`${difficulty}: every format has exactly the file answer as the correct one`, () => {
      for (let seed = 0; seed < 3; seed++) {
        const tasks = buildTasks(QUESTIONS, { mode: 'choice', rng: seeded(seed), altShare: 1, difficulty });
        for (const t of tasks) {
          const q = getQuestion(t.qid)!;
          assert.ok(isCorrect(t, rightResponse(t)), `${t.qid} correct response accepted`);
          if (t.kind === 'choice') {
            // 4 варіанти; у формулюваннях з білетів неправильних може бути 1–3.
            const expected = t.source === 'mcq' ? q.variants.find((v) => v.kind === 'mcq')!.wrong.length + 1 : 4;
            assert.equal(t.options.length, expected, t.qid);
            const right = t.options.filter((o) => o.correct);
            assert.equal(right.length, 1);
            if (t.source !== 'term') assert.ok(sameAnswer(right[0]!.answer, q.a));
            for (const o of t.options.filter((x) => !x.correct)) {
              assert.ok(!sameAnswer(o.answer, right[0]!.answer), `${t.qid}: wrong equals right`);
              // Будь-який інший варіант — неправильна відповідь.
              const i = t.options.indexOf(o);
              assert.equal(isCorrect(t, { kind: 'choice', index: i }), false);
            }
          }
          if (t.kind === 'multi') {
            const correct = t.options.filter((o) => o.correct).map((o) => normalize(o.text));
            assert.deepEqual(correct.sort(), answerItems(q.a).map(normalize).sort());
            assert.equal(new Set(t.options.map((o) => normalize(o.text))).size, t.options.length);
          }
        }
      }
    });
  }

  it('hard keeps the distractors from the file; easy replaces them', () => {
    const q = getQuestion('m1-3')!;
    const hard = taskFor(q, null, seeded(1), 'choice', 'hard');
    const easy = taskFor(q, null, seeded(1), 'choice', 'easy');
    if (hard.kind !== 'choice' || easy.kind !== 'choice') throw new Error('choice expected');
    const wrongOf = (t: typeof hard) =>
      t.options
        .filter((o) => !o.correct)
        .map((o) => key(o.answer))
        .sort();
    assert.deepEqual(wrongOf(hard), q.w.map(key).sort());
    for (const w of wrongOf(easy)) assert.ok(!q.w.map(key).includes(w));
  });

  it('cards ignore difficulty', () => {
    const t = buildTasks(questionsOfSet('m1'), { mode: 'cards', rng: seeded(1), difficulty: 'easy' });
    assert.ok(t.every((x) => x.kind === 'card'));
  });
});

describe('random order of options', () => {
  it('the correct option lands on every position with roughly equal frequency', () => {
    for (const difficulty of ['hard', 'easy'] as Difficulty[]) {
      const counts = [0, 0, 0, 0];
      const rng = seeded(42);
      for (let i = 0; i < 4000; i++) {
        const t = taskFor(getQuestion('m1-2')!, null, rng, 'choice', difficulty);
        if (t.kind !== 'choice') throw new Error('choice expected');
        counts[t.options.findIndex((o) => o.correct)]!++;
      }
      for (const c of counts) assert.ok(c > 850 && c < 1150, `${difficulty}: ${counts.join(', ')}`);
    }
  });

  it('two rounds of the same questions show options in different orders', () => {
    const qs = questionsOfSet('m1').slice(0, 20);
    const a = buildTasks(qs, { mode: 'choice', rng: seeded(1), altShare: 0 });
    const b = buildTasks(qs, { mode: 'choice', rng: seeded(2), altShare: 0 });
    const order = (t: Task) => (t.kind === 'choice' ? t.options.map((o) => key(o.answer)).join() : '');
    assert.ok(a.filter((t, i) => order(t) !== order(b[i]!)).length >= 10);
  });

  it('reshuffle keeps the same options and the correct one', () => {
    const rng = seeded(5);
    for (const t of buildTasks(QUESTIONS, { mode: 'choice', rng, altShare: 1 })) {
      const r = reshuffle(t, rng);
      assert.equal(r.qid, t.qid);
      assert.ok(isCorrect(r, rightResponse(r)));
      if (t.kind === 'choice' && r.kind === 'choice') {
        assert.deepEqual(r.options.map((o) => key(o.answer)).sort(), t.options.map((o) => key(o.answer)).sort());
      }
      if (t.kind === 'order' && r.kind === 'order') {
        assert.deepEqual([...r.shuffled].sort(), [...t.shuffled].sort());
        assert.ok(
          r.shuffled.some((v, i) => v !== i),
          'still shuffled',
        );
      }
    }
  });
});

describe('changelog', () => {
  const text = readFileSync(new URL('../../CHANGELOG.md', import.meta.url), 'utf8');
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string };
  const releases = parseChangelog(text);

  it('the latest entry matches package.json version and has a date', () => {
    assert.equal(releases[0]?.version, pkg.version);
    assert.match(releases[0]?.date ?? '', /^\d{4}-\d{2}-\d{2}$/);
  });

  it('every release has items; versions are unique and descending', () => {
    assert.ok(releases.length >= 5);
    for (const r of releases) assert.ok(r.items.length > 0, r.version);
    const nums = releases.map((r) => r.version.split('.').map(Number));
    for (let i = 1; i < nums.length; i++) {
      const [a, b] = [nums[i - 1]!, nums[i]!];
      assert.ok(a[0]! * 1e6 + a[1]! * 1e3 + a[2]! > b[0]! * 1e6 + b[1]! * 1e3 + b[2]!);
    }
  });

  it('joins wrapped lines into the item', () => {
    const r = parseChangelog('# T\n\n## 1.2.3 — 2026-01-02\n\n- first\n  continued\n- second `x`\n');
    assert.deepEqual(r, [{ version: '1.2.3', date: '2026-01-02', items: ['first continued', 'second `x`'] }]);
  });
});
