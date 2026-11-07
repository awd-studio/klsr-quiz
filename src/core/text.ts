import type { Answer, Item, ItemGroup } from '../data/types.ts';

export const isGroup = (item: Item): item is ItemGroup => typeof item !== 'string';

/** Усі рядки відповіді (заголовки груп + пункти) — для порівнянь і пошуку. */
export function flattenText(answer: Answer): string[] {
  return answer.flatMap((item) => (isGroup(item) ? [item.title, ...item.items] : [item]));
}

/**
 * Пункти, з яких складається відповідь, без заголовків груп.
 * Використовується для формату «послідовність» і «кілька відповідей».
 */
export function answerItems(answer: Answer): string[] {
  return answer.flatMap((item) => (isGroup(item) ? [...item.items] : [item]));
}

/** Прибирає нумерацію «1. » на початку пункту (щоб не підказувати порядок). */
export const stripNumber = (text: string): string => text.replace(/^\s*\d+\.\s*/, '');

/**
 * Нормалізація для порівняння з текстом файлу: регістр, апострофи, тире,
 * пробіли та пунктуація не враховуються — лише послідовність літер і цифр.
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’ʼ'`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/** Чи збігаються дві відповіді (з точністю до нормалізації). */
export function sameAnswer(a: Answer, b: Answer): boolean {
  const x = flattenText(a).map(normalize);
  const y = flattenText(b).map(normalize);
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

/** Чи збігаються відповіді як множини пунктів (порядок не важливий). */
export function sameItemSet(a: Answer, b: Answer): boolean {
  const x = flattenText(a).map(normalize).sort();
  const y = flattenText(b).map(normalize).sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
}
