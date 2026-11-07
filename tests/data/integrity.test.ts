import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { QUESTIONS, SAME_QUESTION, SETS, getQuestion, sameQuestionGroup } from '../../src/data/index.ts';
import { variants } from '../../src/data/variants.ts';
import { answerItems, flattenText, normalize, sameAnswer, sameItemSet } from '../../src/core/text.ts';

describe('question data integrity', () => {
  it('ids are unique', () => {
    const ids = QUESTIONS.map((q) => q.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  it('every variants key points to an existing question', () => {
    for (const id of Object.keys(variants)) assert.ok(getQuestion(id), id);
  });

  for (const q of QUESTIONS) {
    it(`${q.id} has a non-empty answer and 3 valid distractors`, () => {
      assert.ok(q.q.trim().length > 0);
      assert.ok(flattenText(q.a).every((t) => t.trim().length > 0));
      assert.equal(q.w.length, 3);
      for (const w of q.w) {
        assert.ok(!sameAnswer(w, q.a), `distractor equals answer: ${flattenText(w).join(' | ')}`);
        // Перестановка тих самих пунктів допустима лише для питань на послідовність.
        if (sameItemSet(w, q.a)) {
          assert.ok(
            q.variants.some((v) => v.kind === 'order'),
            'same items in different order only for ordered questions',
          );
        }
      }
      const keys = q.w.map((w) => normalize(flattenText(w).join('|')));
      assert.equal(new Set(keys).size, 3, 'distractors are distinct');
    });
  }
});

describe('variants', () => {
  for (const q of QUESTIONS) {
    q.variants.forEach((v, i) => {
      it(`${q.id} #${i} (${v.kind}) is well-formed`, () => {
        switch (v.kind) {
          case 'tf':
            assert.ok(v.statement.length > 10);
            assert.ok(!/[?]$/.test(v.statement), 'statement must not end with "?"');
            break;
          case 'term':
            assert.equal(new Set([v.term, ...v.others].map(normalize)).size, 4);
            assert.equal(q.a.length, 1, 'term questions need a single-definition answer');
            break;
          case 'mcq':
            assert.ok(v.wrong.length >= 1 && v.wrong.length <= 3);
            for (const w of v.wrong) assert.ok(!sameItemSet(w, q.a));
            break;
          case 'multi': {
            const correct = answerItems(q.a);
            assert.ok(correct.length >= 2);
            assert.ok(v.extra.length >= 1);
            assert.equal(new Set([...correct, ...v.extra].map(normalize)).size, correct.length + v.extra.length);
            break;
          }
          case 'order': {
            const items = v.items ?? answerItems(q.a);
            assert.ok(items.length >= 3);
            assert.equal(new Set(items.map(normalize)).size, items.length);
            break;
          }
        }
      });
    });
  }

  it('there are both true and false statements', () => {
    const tf = QUESTIONS.flatMap((q) => q.variants).filter((v) => v.kind === 'tf');
    assert.ok(tf.some((v) => v.kind === 'tf' && v.correct));
    assert.ok(tf.some((v) => v.kind === 'tf' && !v.correct));
  });
});

describe('question sets', () => {
  it('sets cover the expected modules', () => {
    assert.equal(QUESTIONS.filter((q) => SETS.m1.modules.includes(q.module)).length, 100);
    assert.equal(QUESTIONS.filter((q) => SETS.all.modules.includes(q.module)).length, 209);
  });

  it('same-question groups reference existing questions with matching topics', () => {
    for (const group of SAME_QUESTION) {
      assert.ok(group.length >= 2);
      const qs = group.map((id) => getQuestion(id));
      assert.ok(qs.every(Boolean), group.join(','));
      assert.equal(new Set(group.map(sameQuestionGroup)).size, 1);
    }
  });
});
