/** Номер модуля у файлі «Залікові питання КЛСР». */
export type ModuleId = 1 | 2 | 3;

/** Стабільний ідентифікатор питання: `m<модуль>-<номер у файлі>`. */
export type QuestionId = `m${ModuleId}-${number}`;

/** Підсписок відповіді з власним заголовком (напр. «1. За масштабом:»). */
export interface ItemGroup {
  readonly title: string;
  readonly items: readonly string[];
}

/** Один пункт відповіді: рядок або згрупований підсписок. */
export type Item = string | ItemGroup;

/** Відповідь — впорядкований список пунктів. Один пункт = визначення. */
export type Answer = readonly Item[];

/** Питання в тому вигляді, як його записано в модулі даних. */
export interface QuestionSeed {
  /** Номер питання у файлі. */
  readonly n: number;
  /** Текст питання дослівно з файлу. */
  readonly q: string;
  /** Правильна відповідь дослівно з файлу. */
  readonly a: Answer;
  /** Три неправильні варіанти для режиму вибору. */
  readonly w: readonly [Answer, Answer, Answer];
}

/**
 * Альтернативні формати подання питання (лише режим «Вибір варіанту»).
 * Правильна відповідь завжди виводиться з `Question.a` — у варіантах її
 * не дублюємо, щоб не було розбіжностей з файлом.
 */
export type Variant =
  /** Ствердне питання «Чи правильне твердження…?» з відповіддю Так/Ні. */
  | { readonly kind: 'tf'; readonly statement: string; readonly correct: boolean; readonly exam?: true }
  /** Зворотне питання: дано визначення (`Question.a`) — оберіть термін. */
  | {
      readonly kind: 'term';
      /** Термін дослівно з тексту питання. */
      readonly term: string;
      readonly others: readonly [string, string, string];
      readonly exam?: true;
    }
  /** Інше формулювання питання (з білетів) з власними неправильними варіантами. */
  | { readonly kind: 'mcq'; readonly prompt: string; readonly wrong: readonly Answer[]; readonly exam?: true }
  /** Оберіть усі правильні пункти: правильні = пункти `Question.a`. */
  | { readonly kind: 'multi'; readonly prompt?: string; readonly extra: readonly string[]; readonly exam?: true }
  /** Розставте в правильній послідовності (за замовчуванням пункти `Question.a`). */
  | { readonly kind: 'order'; readonly prompt?: string; readonly items?: readonly string[]; readonly exam?: true };

export type VariantKind = Variant['kind'];

/** Повне питання з метаданими. */
export interface Question extends QuestionSeed {
  readonly id: QuestionId;
  readonly module: ModuleId;
  readonly variants: readonly Variant[];
}

export type SetId = 'm1' | 'all';

/** Набір питань для проходження. */
export interface QuestionSet {
  readonly id: SetId;
  readonly title: string;
  readonly modules: readonly ModuleId[];
}
