/** Жодна анімація інтерфейсу не триває довше за 0,2 с. */
export const MAX_ANIMATION_MS = 200;

const reducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

let frame = 0;

/**
 * Плавна прокрутка до `y` за `duration` мс (не довше 0,2 с).
 * Вбудований `behavior: 'smooth'` не дозволяє задати тривалість, тому анімуємо самі.
 */
export function scrollToY(y: number, duration = MAX_ANIMATION_MS): void {
  cancelAnimationFrame(frame);
  const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const target = Math.max(0, Math.min(Math.round(y), max));
  const start = window.scrollY;
  const delta = target - start;
  if (Math.abs(delta) < 1) return;
  const ms = Math.min(duration, MAX_ANIMATION_MS);
  if (ms <= 0 || reducedMotion()) {
    window.scrollTo(0, target);
    return;
  }
  const t0 = performance.now();
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / ms);
    window.scrollTo(0, start + delta * (1 - (1 - p) ** 3));
    if (p < 1) frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
}

/** Висота закріпленої панелі тесту (лічильники, прогрес). */
function stickyOffset(root: ParentNode): number {
  return root.querySelector('.quizbar')?.getBoundingClientRect().height ?? 0;
}

const GAP = 12;

/** Після переходу до наступного питання — прокрутити до картки питання. */
export function scrollToQuestion(root: ParentNode): void {
  const card = root.querySelector<HTMLElement>('.qcard');
  if (!card) return;
  scrollToY(card.getBoundingClientRect().top + window.scrollY - stickyOffset(root) - GAP);
}

/**
 * Після відповіді — показати блок із правильним і вибраним варіантами
 * (прокрутити, якщо він не повністю видимий) і перевести фокус на правильний варіант.
 */
export function revealAnswer(root: ParentNode): void {
  const marks = [...root.querySelectorAll<HTMLElement>('.qcard .is-right, .qcard .is-wrong, .qcard .is-missed')];
  if (marks.length === 0) return;
  const rects = marks.map((m) => m.getBoundingClientRect());
  const top = Math.min(...rects.map((r) => r.top));
  const bottom = Math.max(...rects.map((r) => r.bottom));
  const viewTop = stickyOffset(root) + GAP;
  const viewBottom = window.innerHeight - GAP;
  const space = viewBottom - viewTop;

  const focusTarget = root.querySelector<HTMLElement>('.qcard .is-right, .qcard .is-missed') ?? marks[0]!;

  if (top < viewTop || bottom > viewBottom) {
    const height = bottom - top;
    let shift: number;
    if (height <= space) {
      // Обидва варіанти вміщуються — по центру видимої області.
      shift = top - viewTop - (space - height) / 2;
    } else {
      // Не вміщуються: правильний варіант має бути видно повністю, вибраний — наскільки вистачає місця.
      const r = focusTarget.getBoundingClientRect();
      shift = r.top - top > bottom - r.bottom ? r.bottom - viewBottom : r.top - viewTop;
    }
    scrollToY(window.scrollY + shift);
  }
  focusTarget.focus({ preventScroll: true });
}
