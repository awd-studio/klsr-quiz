import { getQuestion, questionsOfSet, isInSet, compareIds, sameQuestionGroup } from '../data/index.ts';
import type { Question, QuestionId } from '../data/types.ts';
import { defaultRng, shuffle, type Rng } from '../core/rng.ts';
import { buildTasks, pickQuestions, type Response } from '../core/round.ts';
import {
  advance,
  createSession,
  currentResult,
  currentTask,
  finishEarly,
  isFinished,
  markFailNotice,
  needsFailNotice,
  respond,
  skip,
  stats,
  wrongTaskIndices,
  type Session,
  type SessionConfig,
} from '../core/session.ts';
import { saveState, type PersistedState, type Prefs, type StorageLike } from '../core/storage.ts';
import type { Actions, Ctx, UiState } from './state.ts';
import { homeView } from './views/home.ts';
import { quizView, handleQuizKey } from './views/quiz.ts';
import { resultView } from './views/result.ts';
import { savedView } from './views/saved.ts';
import { modal } from './components.ts';
import { h } from './dom.ts';
import { revealAnswer, scrollToQuestion } from './scroll.ts';
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

/** Контролер застосунку: стан → рендер; дії змінюють стан і зберігають його. */
export class App {
  private state: UiState;
  private readonly rng: Rng;
  private lastViewKey = '';
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
  }

  /* ───────────── state helpers ───────────── */

  private set(patch: Partial<UiState>, persist = true): void {
    // Анімація відповіді — лише в першому рендері після неї.
    this.state = { ...this.state, justAnswered: false, ...patch };
    if (persist) this.persist();
    this.render();
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

  private confirm(title: string, text: string, okLabel: string, onOk: () => void): void {
    this.set({ modal: { kind: 'confirm', title, text, okLabel, onOk } }, false);
  }

  /* ───────────── sessions ───────────── */

  private configFor(source: SessionConfig['source'], ids: readonly QuestionId[] | null = null): SessionConfig {
    const p = this.state.data.prefs;
    return { setId: p.setId, mode: p.mode, source, limit: p.limit, count: p.counts[p.setId], ids };
  }

  private questionsFor(config: SessionConfig): Question[] {
    if (config.ids) {
      return shuffle(
        config.ids.map((id) => getQuestion(id)).filter((q): q is Question => !!q),
        this.rng,
      );
    }
    return pickQuestions(questionsOfSet(config.setId), config.count, this.rng, sameQuestionGroup);
  }

  private launch(config: SessionConfig): void {
    const questions = this.questionsFor(config);
    if (questions.length === 0) return;
    const tasks = buildTasks(questions, {
      mode: config.mode,
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
      this.confirm('Почати новий тест?', 'Незавершений тест буде втрачено.', 'Почати', () => this.launch(config));
    } else {
      this.launch(config);
    }
  }

  private idsInSet(ids: readonly QuestionId[]): QuestionId[] {
    const setId = this.state.data.prefs.setId;
    return ids.filter((id) => isInSet(setId, id));
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
    else this.set({ session: next, revealed: false, multi: [], order: [] });
  }

  private toResult(s: Session): void {
    this.state = { ...this.state, data: { ...this.state.data, session: null } };
    this.set({ screen: 'result', session: s, modal: null, revealed: false, multi: [], order: [] });
  }

  /* ───────────── actions ───────────── */

  private createActions(): Actions {
    return {
      setSet: (setId) => this.setPrefs({ setId }),
      setMode: (mode) => this.setPrefs({ mode }),
      setCount: (count) => this.setCount(count),
      setLimit: (limit) => this.setPrefs({ limit }),
      setTheme: (theme) => this.setPrefs({ theme }),
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
        if (s) this.set({ screen: 'quiz', session: s, revealed: false, multi: [], order: [], modal: null });
      },
      clearHard: () =>
        this.confirm(
          'Очистити складні питання?',
          'Список питань, з якими були труднощі, буде очищено.',
          'Очистити',
          () => this.set({ data: this.setLists([], this.state.data.saved), modal: null }),
        ),

      flip: () => this.set({ revealed: !this.state.revealed }, false),
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
        if (s) this.set({ session: skip(s), revealed: false, multi: [], order: [] });
      },
      finish: () =>
        this.confirm('Завершити тест?', 'Питання без відповіді не будуть зараховані.', 'Завершити', () =>
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
            'Почати заново',
          ),
          h('button', { type: 'button', class: 'btn', onclick: this.actions.failContinue }, 'Продовжити'),
        ],
        'danger',
      );
    }
    return modal(m.title, m.text, [
      h('button', { type: 'button', class: 'btn btn--secondary', onclick: this.actions.closeModal }, 'Скасувати'),
      h('button', { type: 'button', class: 'btn', onclick: () => m.onOk() }, m.okLabel),
    ]);
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
