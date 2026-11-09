import { getQuestion, questionsOfSet, isInSet, compareIds, sameQuestionGroup } from '../data/index.ts';
import type { Question, QuestionId } from '../data/types.ts';
import { defaultRng, shuffle, type Rng } from '../core/rng.ts';
import { buildTasks, pickQuestions, reshuffle, taskFor, type Response } from '../core/round.ts';
import {
  advance,
  createSession,
  currentResult,
  currentTask,
  finishEarly,
  isFinished,
  markFailNotice,
  needsFailNotice,
  removeTask,
  replaceTask,
  respond,
  skip,
  stats,
  wrongTaskIndices,
  type Session,
  type SessionConfig,
} from '../core/session.ts';
import { saveState, type PersistedState, type Prefs, type StorageLike, type Theme } from '../core/storage.ts';
import type { Actions, Ctx, ExcludeNotice, UiState } from './state.ts';
import { homeView } from './views/home.ts';
import { quizView, handleQuizKey } from './views/quiz.ts';
import { resultView } from './views/result.ts';
import { savedView } from './views/saved.ts';
import { excludedView } from './views/excluded.ts';
import { changelogView } from './views/changelog.ts';
import { modal } from './components.ts';
import { cx, h } from './dom.ts';
import { icon, type IconName } from './icons.ts';
import { MAX_ANIMATION_MS, revealAnswer, scrollToQuestion } from './scroll.ts';
import { applyTheme } from './theme.ts';

export interface AppOptions {
  readonly root: HTMLElement;
  readonly storage: StorageLike | null;
  readonly initial: PersistedState;
  readonly rng?: Rng;
  readonly canDownload?: boolean;
  /** Частка альтернативних форматів (для тестів; за замовчуванням 10%). */
  readonly altShare?: number;
}

/** Повідомлення про виключене питання зникає саме через 30 с. */
export const NOTICE_MS = 30_000;

/** Контролер застосунку: стан → рендер; дії змінюють стан і зберігають його. */
export class App {
  private state: UiState;
  private readonly rng: Rng;
  private lastViewKey = '';
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;
  private timerFor: ExcludeNotice | null = null;
  private readonly opts: AppOptions;
  readonly actions: Actions;

  constructor(opts: AppOptions) {
    this.opts = opts;
    this.rng = opts.rng ?? defaultRng;
    this.state = {
      screen: 'home',
      data: opts.initial,
      session: null,
      revealed: false,
      multi: [],
      order: [],
      modal: null,
      justAnswered: false,
      notice: null,
      toggled: null,
    };
    this.actions = this.createActions();
    document.addEventListener('keydown', (e) => this.onKey(e));
  }

  getState(): UiState {
    return this.state;
  }

  render(): void {
    const ctx: Ctx = { state: this.state, actions: this.actions, canDownload: this.opts.canDownload ?? false };
    const { screen, modal: m } = this.state;
    const view =
      screen === 'quiz'
        ? quizView(ctx)
        : screen === 'result'
          ? resultView(ctx)
          : screen === 'saved'
            ? savedView(ctx)
            : screen === 'excluded'
              ? excludedView(ctx)
              : screen === 'changelog'
                ? changelogView(ctx)
                : homeView(ctx);
    applyTheme(this.state.data.prefs.theme);
    const nodes: Node[] = [view];
    if (m) nodes.push(this.renderModal());
    this.opts.root.replaceChildren(...nodes);

    const key = `${screen}:${this.state.session?.current ?? ''}`;
    if (key !== this.lastViewKey) {
      const sameQuiz = screen === 'quiz' && this.lastViewKey.startsWith('quiz:');
      this.lastViewKey = key;
      // Наступне питання — плавно до картки питання; новий екран — на початок.
      if (sameQuiz) scrollToQuestion(this.opts.root);
      else window.scrollTo(0, 0);
      this.opts.root.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true });
    } else if (this.state.justAnswered && !m) {
      revealAnswer(this.opts.root);
    }
    if (m) this.opts.root.querySelector<HTMLElement>('.modal button')?.focus();
    this.renderCountdown();
  }

  /**
   * Смужка часу, що лишився до закриття повідомлення: зменшується справа наліво.
   * Екран перемальовується повністю, тому анімація щоразу продовжується з того місця,
   * яке відповідає часу від появи повідомлення.
   */
  private renderCountdown(): void {
    const n = this.state.notice;
    const bar = this.opts.root.querySelector<HTMLElement>('.notice__timer');
    if (!n || !bar) return;
    const elapsed = Math.min(NOTICE_MS, Math.max(0, Date.now() - n.shownAt));
    bar.style.transform = `scaleX(${1 - elapsed / NOTICE_MS})`;
    if (n.leaving || typeof bar.animate !== 'function') return;
    const anim = bar.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], {
      duration: NOTICE_MS,
      easing: 'linear',
      fill: 'forwards',
    });
    anim.currentTime = elapsed;
  }

  /** Таймер повідомлення: автозакриття через 30 с, після анімації зникнення — прибрати. */
  private syncNoticeTimer(): void {
    const n = this.state.notice;
    if (n === this.timerFor) return;
    clearTimeout(this.noticeTimer);
    this.timerFor = n;
    if (!n) return;
    if (n.leaving) {
      this.noticeTimer = setTimeout(() => {
        if (this.state.notice === n) this.set({ notice: null }, false);
      }, MAX_ANIMATION_MS);
    } else {
      this.noticeTimer = setTimeout(() => this.dismissNotice(), Math.max(0, n.shownAt + NOTICE_MS - Date.now()));
    }
  }

  private dismissNotice(): void {
    const n = this.state.notice;
    if (n && !n.leaving) this.set({ notice: { ...n, leaving: true } }, false);
  }

  /**
   * Повідомлення показується, поки на екрані питання, що стало на місце виключеного;
   * при переході до іншого питання чи екрана воно зникає разом зі зміною вмісту.
   */
  private keepNotice(s: UiState): UiState {
    const n = s.notice;
    if (!n) return s;
    if (s.screen !== 'quiz' || !s.session) return { ...s, notice: null };
    if (n.leaving) return s;
    return n.shownOn === (currentTask(s.session)?.qid ?? null) ? s : { ...s, notice: null };
  }

  /* ───────────── state helpers ───────────── */

  private set(patch: Partial<UiState>, persist = true): void {
    // Анімації відповіді й появи/зникнення блоків — лише в першому рендері після зміни.
    this.state = this.keepNotice({ ...this.state, justAnswered: false, toggled: null, ...patch });
    if (persist) this.persist();
    this.render();
    this.syncNoticeTimer();
  }

  private persist(): void {
    const { session, screen } = this.state;
    const active = screen === 'quiz' && session && !isFinished(session) ? session : null;
    const keep = screen === 'quiz' ? active : this.state.data.session;
    const data = { ...this.state.data, session: keep };
    this.state = { ...this.state, data };
    saveState(this.opts.storage, data);
  }

  private setPrefs(patch: Partial<Prefs>): void {
    this.set({ data: { ...this.state.data, prefs: { ...this.state.data.prefs, ...patch } } });
  }

  /** Кількість питань змінюється лише для поточного набору. */
  private setCount(count: number): void {
    const p = this.state.data.prefs;
    this.setPrefs({ counts: { ...p.counts, [p.setId]: count } });
  }

  private setLists(hard: readonly QuestionId[], saved: readonly QuestionId[]): PersistedState {
    return { ...this.state.data, hard, saved };
  }

  private isExcluded = (id: QuestionId): boolean => this.state.data.excluded.includes(id);

  private confirm(
    title: string,
    text: string,
    okLabel: string,
    okIcon: IconName,
    onOk: () => void,
    danger = false,
  ): void {
    this.set({ modal: { kind: 'confirm', title, text, okLabel, okIcon, danger, onOk } }, false);
  }

  /**
   * Зміна теми: нова тема розходиться колом від натиснутої кнопки (View Transitions, 0,2 с),
   * а повзунок перемикача їде від попередньої теми. Без підтримки API або при
   * «зменшеному русі» тема змінюється одразу, повзунок — без кола.
   */
  private changeTheme(theme: Theme): void {
    const { data } = this.state;
    const from = data.prefs.theme;
    if (theme === from) return;
    const apply = () => this.set({ data: { ...data, prefs: { ...data.prefs, theme } }, toggled: { theme: from } });
    const btn = this.opts.root.querySelector(`[data-theme-value="${theme}"]`);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!btn || reduce || typeof document.startViewTransition !== 'function') return apply();
    const r = btn.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const root = document.documentElement.style;
    root.setProperty('--reveal-x', `${x}px`);
    root.setProperty('--reveal-y', `${y}px`);
    root.setProperty('--reveal-r', `${radius}px`);
    document.startViewTransition(apply);
  }

  /* ───────────── sessions ───────────── */

  private configFor(source: SessionConfig['source'], ids: readonly QuestionId[] | null = null): SessionConfig {
    const p = this.state.data.prefs;
    return {
      setId: p.setId,
      mode: p.mode,
      difficulty: p.difficulty,
      source,
      limit: p.limit,
      count: p.counts[p.setId],
      ids,
    };
  }

  /** Питання набору, крім виключених. */
  private available(setId: SessionConfig['setId']): Question[] {
    return questionsOfSet(setId).filter((q) => !this.isExcluded(q.id));
  }

  private questionsFor(config: SessionConfig): Question[] {
    if (config.ids) {
      return shuffle(
        config.ids
          .filter((id) => !this.isExcluded(id))
          .map((id) => getQuestion(id))
          .filter((q): q is Question => !!q),
        this.rng,
      );
    }
    return pickQuestions(this.available(config.setId), config.count, this.rng, sameQuestionGroup);
  }

  private launch(config: SessionConfig): void {
    const questions = this.questionsFor(config);
    if (questions.length === 0) return;
    const tasks = buildTasks(questions, {
      mode: config.mode,
      difficulty: config.difficulty,
      rng: this.rng,
      ...(this.opts.altShare === undefined ? {} : { altShare: this.opts.altShare }),
    });
    this.set({
      screen: 'quiz',
      session: createSession(config, tasks),
      revealed: false,
      multi: [],
      order: [],
      modal: null,
    });
  }

  /** Почати новий тест, попередивши про втрату незавершеного. */
  private startGuarded(config: SessionConfig): void {
    if (this.state.data.session) {
      this.confirm('Почати новий тест?', 'Незавершений тест буде втрачено.', 'Почати', 'play', () =>
        this.launch(config),
      );
    } else {
      this.launch(config);
    }
  }

  private idsInSet(ids: readonly QuestionId[]): QuestionId[] {
    const setId = this.state.data.prefs.setId;
    return ids.filter((id) => isInSet(setId, id) && !this.isExcluded(id));
  }

  /**
   * Пропущене питання повертається або тест продовжують — варіанти
   * перемішуються заново, щоб не запам’ятовувати їхнє розташування.
   */
  private freshen(s: Session, force = false): Session {
    const i = s.current;
    if (i === null || s.results[i] || !(force || s.skipped[i])) return s;
    const tasks = s.tasks.slice();
    tasks[i] = reshuffle(tasks[i]!, this.rng);
    return { ...s, tasks };
  }

  /**
   * Виключає питання: запам’ятовує його і прибирає з поточного тесту.
   * У звичайному тесті на його місце стає інше питання набору, якого ще немає в раунді;
   * якщо таких не лишилось (або тест зі списку — складні, збережені, помилки) — питань стає менше.
   */
  private excludeQuestion(id: QuestionId): void {
    if (this.isExcluded(id)) return;
    const excluded = [...this.state.data.excluded, id].sort(compareIds);
    const data = { ...this.state.data, excluded };
    const s = this.state.session;
    const index = s?.current ?? null;
    if (!s || index === null || this.state.screen !== 'quiz' || s.tasks[index]?.qid !== id) {
      this.set({ data });
      return;
    }

    const { config } = s;
    let replacement: Question | undefined;
    if (!config.ids) {
      const used = new Set(s.tasks.map((t) => sameQuestionGroup(t.qid)));
      const pool = questionsOfSet(config.setId).filter(
        (q) => !excluded.includes(q.id) && !used.has(sameQuestionGroup(q.id)),
      );
      replacement = pool.length ? pool[Math.floor(this.rng() * pool.length)] : undefined;
    }
    const session = replacement
      ? replaceTask(s, index, taskFor(replacement, null, this.rng, config.mode, config.difficulty))
      : removeTask(s, index);

    this.state = { ...this.state, data };
    if (session.tasks.length === 0) {
      this.state = { ...this.state, data: { ...data, session: null } };
      this.set({ screen: 'home', session: null, modal: null });
      return;
    }
    if (isFinished(session)) {
      this.toResult(session);
      return;
    }
    const shownOn = currentTask(session)?.qid ?? null;
    this.set({
      session,
      revealed: false,
      multi: [],
      order: [],
      notice: { qid: id, replaced: !!replacement, shownOn, before: s, shownAt: Date.now(), leaving: false },
      toggled: 'notice',
    });
  }

  private undoExclude(): void {
    const n = this.state.notice;
    if (!n || n.leaving || this.state.screen !== 'quiz') return;
    const excluded = this.state.data.excluded.filter((x) => x !== n.qid);
    this.state = { ...this.state, data: { ...this.state.data, excluded } };
    this.set({ session: n.before, revealed: false, multi: [], order: [], notice: { ...n, leaving: true } });
  }

  private restore(ids: readonly QuestionId[]): void {
    const excluded = this.state.data.excluded.filter((x) => !ids.includes(x));
    this.set({ data: { ...this.state.data, excluded }, modal: null });
  }

  /** Чи вже відповіли на поточне завдання (варіанти після цього не змінюються). */
  private answered(): boolean {
    const s = this.state.session;
    return !!s && !!currentResult(s);
  }

  /** Записати відповідь, оновити «складні питання», показати ліміт помилок. */
  private answer(response: Response): void {
    const s = this.state.session;
    if (!s || currentResult(s)) return;
    const next = respond(s, response);
    const result = currentResult(next)!;
    const qid = currentTask(next)!.qid;
    let hard = this.state.data.hard;
    if (!result.correct && !hard.includes(qid)) hard = [...hard, qid];
    if (result.correct && s.config.source === 'hard') hard = hard.filter((id) => id !== qid);
    const data = this.setLists(hard, this.state.data.saved);

    const fail = needsFailNotice(next);
    const session = fail ? markFailNotice(next) : next;
    if (s.config.mode === 'cards' && !fail) {
      const moved = advance(session);
      this.state = { ...this.state, data };
      if (isFinished(moved)) this.toResult(moved);
      else this.set({ session: moved, revealed: false });
    } else {
      this.set({ data, session, modal: fail ? { kind: 'fail' } : null, justAnswered: true });
    }
  }

  private goNext(): void {
    const s = this.state.session;
    if (!s) return;
    const next = advance(s);
    if (isFinished(next)) this.toResult(next);
    else this.set({ session: this.freshen(next), revealed: false, multi: [], order: [] });
  }

  private toResult(s: Session): void {
    this.state = { ...this.state, data: { ...this.state.data, session: null } };
    this.set({ screen: 'result', session: s, modal: null, revealed: false, multi: [], order: [] });
  }

  /* ───────────── actions ───────────── */

  private createActions(): Actions {
    return {
      setSet: (setId) => this.setPrefs({ setId }),
      setMode: (mode) => {
        const { data } = this.state;
        if (mode !== data.prefs.mode) this.set({ data: { ...data, prefs: { ...data.prefs, mode } }, toggled: 'mode' });
      },
      setDifficulty: (difficulty) => this.setPrefs({ difficulty }),
      setCount: (count) => this.setCount(count),
      setLimit: (limit) => this.setPrefs({ limit }),
      setTheme: (theme) => this.changeTheme(theme),
      presetExam: () => {
        this.setCount(30);
        this.setPrefs({ limit: 10 });
      },

      start: () => this.startGuarded(this.configFor('regular')),
      startHard: () => {
        const ids = this.idsInSet(this.state.data.hard);
        if (ids.length) this.startGuarded(this.configFor('hard', ids));
      },
      startSaved: () => {
        const ids = this.idsInSet(this.state.data.saved);
        if (ids.length) this.startGuarded(this.configFor('saved', ids));
      },
      resume: () => {
        const s = this.state.data.session;
        if (s)
          this.set({
            screen: 'quiz',
            session: this.freshen(s, true),
            revealed: false,
            multi: [],
            order: [],
            modal: null,
          });
      },
      clearLists: () => {
        const { hard, saved, excluded } = this.state.data;
        if (!hard.length && !saved.length && !excluded.length) return;
        this.confirm(
          'Очистити всі списки?',
          `Буде очищено (в усіх модулях): складні питання — ${hard.length}, збережені — ${saved.length}, ` +
            `виключені — ${excluded.length}. Виключені питання знову з’являтимуться в тестах. ` +
            'Незавершений тест і налаштування збережуться. Цю дію не можна скасувати.',
          'Очистити',
          'trash',
          () => this.set({ data: { ...this.state.data, hard: [], saved: [], excluded: [] }, modal: null }),
          true,
        );
      },

      flip: () => this.set({ revealed: !this.state.revealed, toggled: 'reveal' }, false),
      know: (known) => this.answer({ kind: 'card', known }),
      choose: (index) => this.answer({ kind: 'choice', index }),
      answerTf: (value) => this.answer({ kind: 'tf', value }),
      toggleMulti: (i) => {
        if (this.answered()) return;
        const cur = this.state.multi;
        this.set({ multi: cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i] }, false);
      },
      submitMulti: () => {
        if (this.state.multi.length)
          this.answer({ kind: 'multi', selected: [...this.state.multi].sort((a, b) => a - b) });
      },
      pickOrder: (i) => {
        if (this.answered()) return;
        if (!this.state.order.includes(i)) this.set({ order: [...this.state.order, i] }, false);
      },
      undoOrder: (pos) => {
        if (!this.answered()) this.set({ order: this.state.order.filter((_, p) => p !== pos) }, false);
      },
      submitOrder: () => {
        const task = this.state.session && currentTask(this.state.session);
        if (task?.kind === 'order' && this.state.order.length === task.items.length) {
          this.answer({ kind: 'order', sequence: this.state.order });
        }
      },
      next: () => this.goNext(),
      skip: () => {
        const s = this.state.session;
        if (s) this.set({ session: this.freshen(skip(s)), revealed: false, multi: [], order: [] });
      },
      finish: () =>
        this.confirm('Завершити тест?', 'Питання без відповіді не будуть зараховані.', 'Завершити', 'flag', () =>
          this.toResult(finishEarly(this.state.session!)),
        ),
      // Незавершений тест лишається збереженим — його можна продовжити з головного екрана.
      exit: () => this.set({ screen: 'home', session: null, modal: null }),

      toggleSaved: (id) => {
        const saved = this.state.data.saved;
        const next = saved.includes(id) ? saved.filter((x) => x !== id) : [...saved, id].sort(compareIds);
        this.set({ data: this.setLists(this.state.data.hard, next) });
      },
      openSaved: () => this.set({ screen: 'saved', modal: null }),

      exclude: (id) => this.excludeQuestion(id),
      undoExclude: () => this.undoExclude(),
      dismissNotice: () => this.dismissNotice(),
      restoreExcluded: (id) => this.restore([id]),
      restoreAllExcluded: () =>
        this.confirm(
          'Повернути всі виключені питання?',
          'Усі виключені питання знову з’являтимуться в тестах.',
          'Повернути всі',
          'undo',
          () => this.restore(this.state.data.excluded),
        ),
      openExcluded: () => this.set({ screen: 'excluded', modal: null }),
      openChangelog: () => this.set({ screen: 'changelog', modal: null }),
      retryMistakes: () => {
        const s = this.state.session;
        if (!s) return;
        const ids = [...new Set(wrongTaskIndices(s).map((i) => s.tasks[i]!.qid))];
        if (ids.length) this.launch({ ...s.config, source: 'retry', ids });
      },
      again: () => {
        const s = this.state.session;
        if (!s) return;
        const { config } = s;
        if (config.source === 'hard') {
          const ids = this.idsInSet(this.state.data.hard);
          if (ids.length) this.launch({ ...config, ids });
          else this.set({ screen: 'home', session: null });
          return;
        }
        this.launch(config);
      },
      home: () => this.set({ screen: 'home', session: null, modal: null }),

      failContinue: () => {
        const s = this.state.session;
        if (!s || s.config.mode !== 'cards') return this.set({ modal: null }, false);
        // У режимі карток після закриття повідомлення одразу переходимо далі.
        const next = advance(s);
        if (isFinished(next)) this.toResult(next);
        else this.set({ modal: null, session: next, revealed: false });
      },
      failRestart: () => {
        const s = this.state.session;
        if (s) this.launch(s.config);
      },
      closeModal: () => this.set({ modal: null }, false),
    };
  }

  private renderModal(): HTMLElement {
    const m = this.state.modal!;
    if (m.kind === 'fail') {
      const s = this.state.session!;
      const st = stats(s);
      return modal(
        'Тест не складено',
        `Помилок: ${st.wrong} (ліміт ${s.config.limit}). Можна почати заново або продовжити до кінця.`,
        [
          h(
            'button',
            { type: 'button', class: 'btn btn--secondary', onclick: this.actions.failRestart },
            icon('again'),
            'Почати заново',
          ),
          h('button', { type: 'button', class: 'btn', onclick: this.actions.failContinue }, icon('next'), 'Продовжити'),
        ],
        'danger',
      );
    }
    return modal(
      m.title,
      m.text,
      [
        h(
          'button',
          { type: 'button', class: 'btn btn--secondary', onclick: this.actions.closeModal },
          icon('close'),
          'Скасувати',
        ),
        h(
          'button',
          { type: 'button', class: cx('btn', m.danger && 'btn--danger'), onclick: () => m.onOk() },
          icon(m.okIcon),
          m.okLabel,
        ),
      ],
      m.danger ? 'danger' : 'neutral',
    );
  }

  private onKey(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const target = e.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    if (this.state.modal) {
      if (e.key === 'Escape' && this.state.modal.kind === 'confirm') this.actions.closeModal();
      return;
    }
    if (this.state.screen === 'quiz' && this.state.session) {
      if (handleQuizKey(e, this.state, this.actions)) e.preventDefault();
    }
  }
}
