/**
 * Звірка даних з текстом файлу «Залікові питання КЛСР» (source/questions.txt,
 * отриманий `pdftotext -layout`). Кожне питання і кожна відповідь мають
 * дослівно (з точністю до регістру, пробілів і розділових знаків) стояти
 * під своїм номером у своєму модулі, пункти — у тому ж порядку.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { QUESTIONS } from '../../src/data/index.ts';
import type { ModuleId } from '../../src/data/types.ts';
import { answerItems, flattenText, normalize } from '../../src/core/text.ts';

const SOURCE = readFileSync(new URL('../../source/questions.txt', import.meta.url), 'utf8');

/**
 * Очевидні друкарські помилки PDF, виправлені в даних (нормалізований вигляд).
 * Документовано в README.
 */
const CORRECTIONS: Record<string, ReadonlyArray<readonly [string, string]>> = {
  'm1-16': [['евіра', 'цевіра']],
  'm1-27': [['свїх', 'своїх']],
  'm1-47': [['вливати', 'впливати']],
};

function splitModules(text: string): Record<ModuleId, string> {
  const i2 = text.indexOf('МОДУЛЬ 2');
  const i3 = text.indexOf('МОДУЛЬ 3');
  assert.ok(i2 > 0 && i3 > i2, 'module markers found');
  return { 1: text.slice(0, i2), 2: text.slice(i2, i3), 3: text.slice(i3) };
}

/** Розбиває текст модуля на сегменти «N) …» послідовно від 1 до count. */
function splitNumbered(text: string, count: number): Map<number, string> {
  const starts: number[] = [];
  let from = 0;
  for (let n = 1; n <= count; n++) {
    const re = new RegExp(`(?:^|\\s)${n}\\s*\\)`, 'g');
    re.lastIndex = from;
    const m = re.exec(text);
    assert.ok(m, `segment ${n}) not found`);
    starts.push(m.index);
    from = m.index + m[0].length;
  }
  const map = new Map<number, string>();
  starts.forEach((start, i) => map.set(i + 1, text.slice(start, starts[i + 1] ?? text.length)));
  return map;
}

const modules = splitModules(SOURCE);
const counts: Record<ModuleId, number> = { 1: 100, 2: 44, 3: 65 };
const segments: Record<ModuleId, Map<number, string>> = {
  1: splitNumbered(modules[1], counts[1]),
  2: splitNumbered(modules[2], counts[2]),
  3: splitNumbered(modules[3], counts[3]),
};

function segmentFor(id: string, module: ModuleId, n: number): string {
  let seg = normalize(segments[module].get(n) ?? '');
  for (const [from, to] of CORRECTIONS[id] ?? []) seg = seg.replace(from, to);
  return seg;
}

describe('source file', () => {
  it('has the expected number of questions per module', () => {
    for (const m of [1, 2, 3] as const) {
      assert.equal(QUESTIONS.filter((q) => q.module === m).length, counts[m], `module ${m}`);
      assert.equal(segments[m].size, counts[m]);
    }
  });
});

describe('every question matches the file verbatim', () => {
  for (const q of QUESTIONS) {
    it(`${q.id}: ${q.q}`, () => {
      const seg = segmentFor(q.id, q.module, q.n);
      assert.ok(seg.includes(normalize(q.q)), 'question text');
      const answer = normalize(flattenText(q.a).join(' '));
      assert.ok(seg.includes(answer), `answer text/order\n  data: ${flattenText(q.a).join(' | ')}`);
    });
  }
});

describe('variants reference only text from the file', () => {
  for (const q of QUESTIONS) {
    for (const v of q.variants) {
      if (v.kind === 'term') {
        it(`${q.id} term «${v.term}» is the subject of the question`, () => {
          assert.ok(normalize(q.q).includes(normalize(v.term)));
          for (const o of v.others) assert.notEqual(normalize(o), normalize(v.term));
        });
      }
      if (v.kind === 'order' && v.items) {
        it(`${q.id} order items come from the answer`, () => {
          const seg = segmentFor(q.id, q.module, q.n);
          for (const item of v.items ?? []) assert.ok(seg.includes(normalize(item)), item);
        });
      }
      if (v.kind === 'multi') {
        it(`${q.id} multi extras are not part of the correct answer`, () => {
          const correct = new Set(answerItems(q.a).map(normalize));
          for (const e of v.extra) assert.ok(!correct.has(normalize(e)), e);
        });
      }
    }
  }
});
