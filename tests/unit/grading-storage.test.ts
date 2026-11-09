import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { gradeFor, gradeThresholds } from '../../src/core/grading.ts';
import {
  DEFAULT_PREFS,
  LEGACY_KEY,
  STORAGE_KEY,
  emptyState,
  loadState,
  saveState,
  type StorageLike,
} from '../../src/core/storage.ts';

describe('grading (exam scale 30/28/24/21)', () => {
  it('matches the scale from the exam sheet for 30 questions', () => {
    assert.equal(gradeFor(30, 30).key, 'excellent');
    assert.equal(gradeFor(28, 30).key, 'excellent');
    assert.equal(gradeFor(27, 30).key, 'good');
    assert.equal(gradeFor(24, 30).key, 'good');
    assert.equal(gradeFor(23, 30).key, 'satisfactory');
    assert.equal(gradeFor(21, 30).key, 'satisfactory');
    assert.equal(gradeFor(20, 30).key, 'fail');
  });

  it('scales thresholds proportionally', () => {
    assert.deepEqual(
      gradeThresholds(20).map((g) => g.min),
      [19, 16, 14, 0],
    );
    assert.equal(gradeFor(0, 0).key, 'fail');
  });
});

class MemoryStorage implements StorageLike {
  readonly data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

describe('storage', () => {
  it('returns defaults for empty or broken storage', () => {
    assert.deepEqual(loadState(null), emptyState());
    const s = new MemoryStorage();
    assert.deepEqual(loadState(s), emptyState());
    s.setItem(STORAGE_KEY, '{not json');
    assert.deepEqual(loadState(s), emptyState());
  });

  it('round-trips prefs and lists, dropping unknown ids', () => {
    const s = new MemoryStorage();
    saveState(s, {
      ...emptyState(),
      prefs: {
        ...DEFAULT_PREFS,
        setId: 'all',
        mode: 'choice',
        difficulty: 'easy',
        counts: { m1: 15, all: 40 },
        limit: 10,
        theme: 'dark',
      },
      hard: ['m1-5', 'm3-57'],
      saved: ['m2-16'],
      excluded: ['m1-7', 'm2-3'],
    });
    const raw = JSON.parse(s.getItem(STORAGE_KEY)!);
    raw.hard.push('m9-1');
    raw.excluded.push('m9-2', 'm1-7');
    s.setItem(STORAGE_KEY, JSON.stringify(raw));
    const loaded = loadState(s);
    assert.deepEqual(loaded.prefs, {
      setId: 'all',
      mode: 'choice',
      difficulty: 'easy',
      counts: { m1: 15, all: 40 },
      limit: 10,
      theme: 'dark',
    });
    assert.deepEqual(loaded.hard, ['m1-5', 'm3-57']);
    assert.deepEqual(loaded.saved, ['m2-16']);
    assert.deepEqual(loaded.excluded, ['m1-7', 'm2-3']);
  });

  it('migrates the first version (module 1 only)', () => {
    const s = new MemoryStorage();
    s.setItem(LEGACY_KEY, JSON.stringify({ mode: 'choice', count: 15, limit: 3, hard: [5, 12, 999], prob: true }));
    const loaded = loadState(s);
    assert.equal(loaded.prefs.mode, 'choice');
    assert.deepEqual(loaded.prefs.counts, { m1: 15, all: 30 });
    assert.equal(loaded.prefs.limit, 3);
    assert.equal(loaded.prefs.setId, 'm1');
    assert.deepEqual(loaded.hard, ['m1-5', 'm1-12']);
  });

  it('defaults: 20 questions for module 1, 30 for the general set', () => {
    assert.deepEqual(emptyState().prefs.counts, { m1: 20, all: 30 });
  });

  it('migrates 2.0 prefs (single count, probable/mixed flags) to per-set counts', () => {
    const s = new MemoryStorage();
    s.setItem(
      STORAGE_KEY,
      JSON.stringify({ prefs: { setId: 'all', mode: 'choice', count: 25, limit: 4, probable: true, mixed: false } }),
    );
    assert.deepEqual(loadState(s).prefs, {
      setId: 'all',
      mode: 'choice',
      difficulty: 'hard',
      counts: { m1: 25, all: 30 },
      limit: 4,
      theme: 'system',
    });
  });

  it('theme defaults to system and ignores unknown values', () => {
    assert.equal(emptyState().prefs.theme, 'system');
    const s = new MemoryStorage();
    s.setItem(STORAGE_KEY, JSON.stringify({ prefs: { theme: 'purple' } }));
    assert.equal(loadState(s).prefs.theme, 'system');
    s.setItem(STORAGE_KEY, JSON.stringify({ prefs: { theme: 'light' } }));
    assert.equal(loadState(s).prefs.theme, 'light');
  });

  it('difficulty defaults to hard; exclusions default to an empty list (data from 2.2)', () => {
    assert.equal(emptyState().prefs.difficulty, 'hard');
    assert.deepEqual(emptyState().excluded, []);
    const s = new MemoryStorage();
    s.setItem(STORAGE_KEY, JSON.stringify({ prefs: { mode: 'choice', difficulty: 'weird' }, hard: [], saved: [] }));
    const loaded = loadState(s);
    assert.equal(loaded.prefs.difficulty, 'hard');
    assert.deepEqual(loaded.excluded, []);
  });

  it('a saved 2.2 session without difficulty resumes with hard options', () => {
    const s = new MemoryStorage();
    const task = { kind: 'card', qid: 'm1-1', exam: false };
    const session = {
      v: 1,
      config: { setId: 'm1', mode: 'cards', source: 'regular', limit: 5, count: 1, ids: null },
      tasks: [task],
      queue: [],
      deferred: [],
      current: 0,
      results: [null],
      skipped: [false],
      failNoticeShown: false,
      endedEarly: false,
    };
    s.setItem(STORAGE_KEY, JSON.stringify({ prefs: {}, hard: [], saved: [], session }));
    assert.equal(loadState(s).session?.config.difficulty, 'hard');
  });

  it('drops an invalid saved session', () => {
    const s = new MemoryStorage();
    s.setItem(
      STORAGE_KEY,
      JSON.stringify({ prefs: {}, hard: [], saved: [], session: { v: 1, tasks: [{ qid: 'x' }] } }),
    );
    assert.equal(loadState(s).session, null);
  });
});
