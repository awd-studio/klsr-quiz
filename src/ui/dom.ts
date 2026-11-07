export type Child = Node | string | number | null | undefined | false | readonly Child[];

type Handler = (event: Event) => void;
export type Attrs = Record<string, string | number | boolean | null | undefined | Handler>;

/**
 * Мінімальний hyperscript: `h('button', { class: 'btn', onclick }, 'Текст')`.
 * Атрибути `on*` стають обробниками подій; `true` — булевий атрибут; `false/null` — пропуск.
 * Текст завжди вставляється як текстовий вузол (без innerHTML).
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, String(value));
    }
  }
  append(el, children);
  return el;
}

function append(parent: Node, children: readonly Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(parent, child);
    else if (child instanceof Node) parent.appendChild(child);
    else parent.appendChild(document.createTextNode(String(child)));
  }
}

export const cx = (...names: ReadonlyArray<string | false | null | undefined>): string =>
  names.filter(Boolean).join(' ');
