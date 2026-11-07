import type { QuestionId, SetId } from '../data/types.ts';
import type { Mode } from '../core/round.ts';
import type { Session } from '../core/session.ts';
import type { PersistedState, Theme } from '../core/storage.ts';

export type Screen = 'home' | 'quiz' | 'result' | 'saved';

export type ModalState =
  | { readonly kind: 'fail' }
  | {
      readonly kind: 'confirm';
      readonly title: string;
      readonly text: string;
      readonly okLabel: string;
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
}

export interface Actions {
  setSet(id: SetId): void;
  setMode(mode: Mode): void;
  setCount(n: number): void;
  setLimit(n: number): void;
  setTheme(theme: Theme): void;
  presetExam(): void;

  start(): void;
  startHard(): void;
  startSaved(): void;
  resume(): void;
  clearHard(): void;

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
