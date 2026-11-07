import { getQuestion } from '../data/index.ts';
import type { QuestionId, SetId } from '../data/types.ts';
import type { Mode, Task } from './round.ts';
import type { Session } from './session.ts';

/** Мінімальний інтерфейс localStorage (для тестів — будь-який об’єкт з цими методами). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface Prefs {
  readonly setId: SetId;
  readonly mode: Mode;
  /** Кількість питань у раунді — окремо для кожного набору. */
  readonly counts: Readonly<Record<SetId, number>>;
  readonly limit: number;
  readonly theme: Theme;
}

/** Тема оформлення: як у системі, світла або темна. */
export type Theme = 'system' | 'light' | 'dark';

export interface PersistedState {
  readonly v: 2;
  readonly prefs: Prefs;
  /** Питання, з якими були труднощі. */
  readonly hard: readonly QuestionId[];
  /** Питання, збережені користувачем. */
  readonly saved: readonly QuestionId[];
  /** Незавершений тест (для продовження після перезавантаження). */
  readonly session: Session | null;
}

export const STORAGE_KEY = 'klsr-quiz:v2';
export const LEGACY_KEY = 'm1quiz_v1';

/** За замовчуванням: «Модуль 1» — 20 питань, «Загальний» — 30 (як на заліку). */
export const DEFAULT_COUNTS: Readonly<Record<SetId, number>> = { m1: 20, all: 30 };

export const DEFAULT_PREFS: Prefs = { setId: 'm1', mode: 'cards', counts: DEFAULT_COUNTS, limit: 5, theme: 'system' };

export const emptyState = (): PersistedState => ({ v: 2, prefs: DEFAULT_PREFS, hard: [], saved: [], session: null });

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number): v is number => Number.isInteger(v) && (v as number) >= min;

function validIds(v: unknown): QuestionId[] {
  if (!Array.isArray(v)) return [];
  const ids = v.filter((x): x is QuestionId => typeof x === 'string' && !!getQuestion(x));
  return [...new Set(ids)];
}

function parsePrefs(v: unknown): Prefs {
  if (!isObj(v)) return DEFAULT_PREFS;
  return {
    setId: v.setId === 'all' ? 'all' : 'm1',
    mode: v.mode === 'choice' ? 'choice' : 'cards',
    counts: parseCounts(v),
    limit: isInt(v.limit, 1) ? v.limit : DEFAULT_PREFS.limit,
    theme: v.theme === 'light' || v.theme === 'dark' ? v.theme : 'system',
  };
}

function parseCounts(v: Json): Record<SetId, number> {
  const c = isObj(v.counts) ? v.counts : {};
  return {
    m1: isInt(c.m1, 1) ? c.m1 : isInt(v.count, 1) ? v.count : DEFAULT_COUNTS.m1, // `count` — формат до 2.1
    all: isInt(c.all, 1) ? c.all : DEFAULT_COUNTS.all,
  };
}

/** Перевіряє збережену сесію; будь-яка невідповідність — сесію відкидаємо. */
function parseSession(v: unknown): Session | null {
  if (!isObj(v) || v.v !== 1 || !Array.isArray(v.tasks) || !Array.isArray(v.results)) return null;
  const tasks = v.tasks as Task[];
  if (tasks.length === 0 || v.results.length !== tasks.length) return null;
  if (!tasks.every((t) => isObj(t) && typeof t.qid === 'string' && !!getQuestion(t.qid))) return null;
  if (!Array.isArray(v.queue) || !Array.isArray(v.deferred) || !Array.isArray(v.skipped)) return null;
  if (!(v.current === null || isInt(v.current, 0)) || !isObj(v.config)) return null;
  return v as unknown as Session;
}

/** Мігрує стан першої версії (лише модуль 1, номери питань). */
function fromLegacy(raw: string): PersistedState {
  const old: unknown = JSON.parse(raw);
  if (!isObj(old)) return emptyState();
  const hard = Array.isArray(old.hard) ? old.hard.filter((n) => isInt(n, 1)).map((n) => `m1-${n}`) : [];
  return {
    ...emptyState(),
    prefs: parsePrefs({ ...old, setId: 'm1' }),
    hard: validIds(hard),
  };
}

export function loadState(storage: StorageLike | null): PersistedState {
  if (!storage) return emptyState();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
      const data: unknown = JSON.parse(raw);
      if (!isObj(data)) return emptyState();
      return {
        v: 2,
        prefs: parsePrefs(data.prefs),
        hard: validIds(data.hard),
        saved: validIds(data.saved),
        session: parseSession(data.session),
      };
    }
    const legacy = storage.getItem(LEGACY_KEY);
    return legacy ? fromLegacy(legacy) : emptyState();
  } catch {
    return emptyState();
  }
}

export function saveState(storage: StorageLike | null, state: PersistedState): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* Сховище недоступне (приватний режим, переповнення) — працюємо без збереження. */
  }
}

/** localStorage, якщо доступний. */
export function browserStorage(): StorageLike | null {
  try {
    const s = globalThis.localStorage;
    const probe = '__klsr_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}
