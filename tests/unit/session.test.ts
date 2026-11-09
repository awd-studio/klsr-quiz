import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getQuestion } from '../../src/data/index.ts';
import { seeded } from '../../src/core/rng.ts';
import { taskFor } from '../../src/core/round.ts';
import {
  advance,
  createSession,
  currentTask,
  finishEarly,
  isFailed,
  isFinished,
  markFailNotice,
  needsFailNotice,
  removeTask,
  replaceTask,
  respond,
  skip,
  stats,
  wrongTaskIndices,
  type SessionConfig,
} from '../../src/core/session.ts';

const config: SessionConfig = {
  setId: 'm1',
  mode: 'cards',
  difficulty: 'hard',
  source: 'regular',
  limit: 2,
  count: 4,
  ids: null,
};
const tasks = ['m1-1', 'm1-2', 'm1-3', 'm1-4'].map((id) => taskFor(getQuestion(id)!, null, seeded(1), 'cards'));
const known = { kind: 'card', known: true } as const;
const unknown = { kind: 'card', known: false } as const;

describe('session', () => {
  it('walks tasks in order and finishes', () => {
    let s = createSession(config, tasks);
    const seen: string[] = [];
    while (!isFinished(s)) {
      seen.push(currentTask(s)!.qid);
      s = advance(respond(s, known));
    }
    assert.deepEqual(seen, ['m1-1', 'm1-2', 'm1-3', 'm1-4']);
    assert.deepEqual(stats(s), { total: 4, answered: 4, correct: 4, wrong: 0, pendingSkipped: 0 });
  });

  it('shows skipped tasks after the main queue', () => {
    let s = createSession(config, tasks);
    s = skip(s); // m1-1
    s = skip(s); // m1-2
    assert.equal(stats(s).pendingSkipped, 2);
    const order: string[] = [];
    while (!isFinished(s)) {
      order.push(currentTask(s)!.qid);
      s = advance(respond(s, known));
    }
    assert.deepEqual(order, ['m1-3', 'm1-4', 'm1-1', 'm1-2']);
    assert.ok(s.skipped[0] && s.skipped[1] && !s.skipped[2]);
  });

  it('a skipped task can be skipped again until answered', () => {
    let s = createSession(config, tasks.slice(0, 1));
    s = skip(s);
    assert.equal(currentTask(s)!.qid, 'm1-1');
    s = skip(s);
    assert.equal(currentTask(s)!.qid, 'm1-1');
    s = advance(respond(s, known));
    assert.ok(isFinished(s));
  });

  it('respond is idempotent for an answered task', () => {
    let s = createSession(config, tasks);
    s = respond(s, unknown);
    s = respond(s, known);
    assert.equal(stats(s).wrong, 1);
    assert.equal(stats(s).correct, 0);
  });

  it('counts "не знав" as a mistake and reports the limit once', () => {
    let s = createSession(config, tasks);
    s = advance(respond(s, unknown));
    assert.ok(!isFailed(s));
    s = respond(s, unknown);
    assert.ok(isFailed(s));
    assert.ok(needsFailNotice(s));
    s = markFailNotice(s);
    assert.ok(!needsFailNotice(s));
    assert.deepEqual(wrongTaskIndices(s), [0, 1]);
  });

  it('replaceTask puts another question in the same place and resets its state', () => {
    let s = createSession(config, tasks);
    s = skip(s); // m1-1 → у кінець
    s = respond(s, unknown); // m1-2 — помилка
    const other = taskFor(getQuestion('m1-50')!, null, seeded(1), 'cards');
    s = replaceTask(s, 1, other);
    assert.equal(currentTask(s)!.qid, 'm1-50');
    assert.equal(s.results[1], null);
    assert.equal(stats(s).total, 4);
    assert.equal(stats(s).wrong, 0);
    const order: string[] = [];
    while (!isFinished(s)) {
      order.push(currentTask(s)!.qid);
      s = advance(respond(s, known));
    }
    assert.deepEqual(order, ['m1-50', 'm1-3', 'm1-4', 'm1-1']);
  });

  it('removeTask drops the current task, re-indexes the queue and moves on', () => {
    let s = createSession(config, tasks);
    s = advance(respond(s, known)); // m1-1 ✓
    s = skip(s); // m1-2 → у кінець
    assert.equal(currentTask(s)!.qid, 'm1-3');
    s = removeTask(s, s.current!);
    assert.equal(stats(s).total, 3);
    assert.equal(currentTask(s)!.qid, 'm1-4');
    const order: string[] = [];
    while (!isFinished(s)) {
      order.push(currentTask(s)!.qid);
      s = advance(respond(s, known));
    }
    assert.deepEqual(order, ['m1-4', 'm1-2']);
    assert.deepEqual(stats(s), { total: 3, answered: 3, correct: 3, wrong: 0, pendingSkipped: 0 });
  });

  it('removeTask of the last remaining task finishes an empty session', () => {
    let s = createSession(config, tasks.slice(0, 1));
    s = removeTask(s, 0);
    assert.ok(isFinished(s));
    assert.equal(s.tasks.length, 0);
  });

  it('finishEarly ends the session and keeps results', () => {
    let s = createSession(config, tasks);
    s = advance(respond(s, known));
    s = finishEarly(s);
    assert.ok(isFinished(s));
    assert.ok(s.endedEarly);
    assert.equal(stats(s).answered, 1);
  });
});
