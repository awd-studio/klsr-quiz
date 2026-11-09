/** Один випуск зі списку змін. */
export interface Release {
  readonly version: string;
  /** Дата випуску (YYYY-MM-DD), якщо вказана. */
  readonly date: string | null;
  readonly items: readonly string[];
}

/**
 * Розбирає CHANGELOG.md: `## 2.3.0 — 2026-11-09` — заголовок випуску,
 * `- …` — пункт (продовження з відступом приєднується до пункту).
 */
export function parseChangelog(text: string): Release[] {
  const releases: { version: string; date: string | null; items: string[] }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const head = /^##\s+v?(\d+\.\d+\.\d+)(?:\s*[—–-]\s*(\d{4}-\d{2}-\d{2}))?/.exec(line);
    if (head) {
      releases.push({ version: head[1]!, date: head[2] ?? null, items: [] });
      continue;
    }
    const current = releases.at(-1);
    if (!current) continue;
    const item = /^[-*]\s+(.*)$/.exec(line);
    if (item) current.items.push(item[1]!);
    else if (/^\s+\S/.test(line) && current.items.length) {
      current.items[current.items.length - 1] += ` ${line.trim()}`;
    }
  }
  return releases;
}

/** Фрагменти пункту: звичайний текст і `код`. */
export function inlineCode(text: string): { code: boolean; text: string }[] {
  return text
    .split(/(`[^`]+`)/)
    .filter(Boolean)
    .map((part) =>
      part.startsWith('`') && part.endsWith('`')
        ? { code: true, text: part.slice(1, -1) }
        : { code: false, text: part },
    );
}
