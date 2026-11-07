import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pick, seeded, shuffle } from '../../src/core/rng.ts';
import { answerItems, flattenText, normalize, sameAnswer, sameItemSet, stripNumber } from '../../src/core/text.ts';

describe('rng', () => {
  it('seeded generator is deterministic and within [0, 1)', () => {
    const a = seeded(42);
    const b = seeded(42);
    for (let i = 0; i < 100; i++) {
      const x = a();
      assert.equal(x, b());
      assert.ok(x >= 0 && x < 1);
    }
  });

  it('shuffle returns a permutation and does not mutate input', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = shuffle(input, seeded(1));
    assert.deepEqual(input, [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual(
      [...out].sort((x, y) => x - y),
      input,
    );
    assert.notDeepEqual(out, input);
  });

  it('pick throws on empty list', () => {
    assert.throws(() => pick([], seeded(1)));
    assert.equal(pick(['x'], seeded(1)), 'x');
  });
});

describe('text', () => {
  it('normalize ignores case, punctuation, apostrophes and spaces', () => {
    assert.equal(normalize('Обов’ язки  ГСВ, ГСР:'), normalize("обов'язки гсв гср"));
    assert.equal(normalize('Між відділеннями– 50 м.'), normalize('Між відділеннями – 50 м'));
  });

  it('flattens groups with titles; answerItems skips titles', () => {
    const a = ['x', { title: 'T:', items: ['a', 'b'] }];
    assert.deepEqual(flattenText(a), ['x', 'T:', 'a', 'b']);
    assert.deepEqual(answerItems(a), ['x', 'a', 'b']);
  });

  it('stripNumber removes leading numbering only', () => {
    assert.equal(stripNumber('3. Оцінка обстановки'), 'Оцінка обстановки');
    assert.equal(stripNumber('Крок 3. Оцінка'), 'Крок 3. Оцінка');
  });

  it('sameAnswer is order-sensitive, sameItemSet is not', () => {
    assert.ok(sameAnswer(['А', 'Б'], ['а', 'б.']));
    assert.ok(!sameAnswer(['А', 'Б'], ['Б', 'А']));
    assert.ok(sameItemSet(['А', 'Б'], ['Б', 'А']));
  });
});
