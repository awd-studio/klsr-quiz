import type { QuestionId, SetId } from '../data/types.ts';
import type { Difficulty, Mode } from '../core/round.ts';
import type { Session } from '../core/session.ts';
import type { PersistedState, Theme } from '../core/storage.ts';
import type { IconName } from './icons.ts';

export type Screen = 'home' | 'quiz' | 'result' | 'saved' | 'excluded' | 'changelog';

/** Повідомлення після виключення питання (з можливістю скасувати). */
export interface ExcludeNotice {
  readonly qid: QuestionId;
  /** Замість виключеного питання додано інше (інакше — кількість питань зменшилась). */
  readonly replaced: boolean;
  /** Питання, на якому показується повідомлення (зникає при переході до іншого). */
  readonly shownOn: QuestionId | null;
  /** Стан тесту до виключення — для «Скасувати виключення». */
  readonly before: Session;
  /** Час появи (`Date.now()`), від нього відлічується автозакриття. */
  readonly shownAt: number;
  /** Повідомлення зникає (анімація закриття, потім його прибирають). */
  readonly leaving: boolean;
}

/**
 * Що змінилося щойно — для одноразової анімації появи/зникнення блоку.
 * `{ theme }` — тему змінено, повзунок перемикача їде від попередньої теми.
 */
export type Toggled = 'mode' | 'reveal' | 'notice' | { readonly theme: Theme };

export type ModalState =
  | { readonly kind: 'fail' }
  | {
      readonly kind: 'confirm';
      readonly title: string;
      readonly text: string;
      readonly okLabel: string;
      readonly okIcon: IconName;
      /** Незворотна дія (очищення) — червоний заголовок і кнопка. */
      readonly danger: boolean;
      readonly onOk: () => void;
    };

export interface UiState {
  readonly screen: Screen;
  readonly data: PersistedState;
  /** Активний тест (на екрані quiz) або завершений (на екрані result). */
  readonly session: Session | null;
  /** Картку перевернуто. */
  readonly revealed: boolean;
  /** Поточний вибір у форматі «кілька відповідей». */
  readonly multi: readonly number[];
  /** Поточна послідовність у форматі «послідовність» (індекси пунктів). */
  readonly order: readonly number[];
  readonly modal: ModalState | null;
  /** Щойно відповіли на поточне завдання: анімувати й показати правильний варіант. */
  readonly justAnswered: boolean;
  readonly notice: ExcludeNotice | null;
  /** Анімувати появу/зникнення в першому рендері після зміни (як `justAnswered`). */
  readonly toggled: Toggled | null;
}

export interface Actions {
  setSet(id: SetId): void;
  setMode(mode: Mode): void;
  setDifficulty(d: Difficulty): void;
  setCount(n: number): void;
  setLimit(n: number): void;
  setTheme(theme: Theme): void;
  presetExam(): void;

  start(): void;
  startHard(): void;
  startSaved(): void;
  resume(): void;
  /** Очистити всі списки: складні, збережені й виключені питання. */
  clearLists(): void;

  flip(): void;
  know(known: boolean): void;
  choose(index: number): void;
  answerTf(value: boolean): void;
  toggleMulti(index: number): void;
  submitMulti(): void;
  pickOrder(index: number): void;
  undoOrder(position: number): void;
  submitOrder(): void;
  next(): void;
  skip(): void;
  finish(): void;
  exit(): void;

  toggleSaved(id: QuestionId): void;
  openSaved(): void;

  exclude(id: QuestionId): void;
  undoExclude(): void;
  dismissNotice(): void;
  restoreExcluded(id: QuestionId): void;
  restoreAllExcluded(): void;
  openExcluded(): void;
  openChangelog(): void;
  retryMistakes(): void;
  again(): void;
  home(): void;

  failContinue(): void;
  failRestart(): void;
  closeModal(): void;
}

export interface Ctx {
  readonly state: UiState;
  readonly actions: Actions;
  /** Сторінку відкрито з сервера (можна запропонувати офлайн-файл). */
  readonly canDownload: boolean;
}
