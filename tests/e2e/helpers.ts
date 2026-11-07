import { expect, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const FILE = path.resolve(import.meta.dirname, '../../dist/klsr-quiz.html');
export const APP_URL = pathToFileURL(FILE).href;

/** Мінімальний опис завдання з тестового хука window.__klsr. */
export type TaskInfo =
  | { kind: 'card'; qid: string }
  | { kind: 'choice'; qid: string; source: string; options: { correct: boolean }[] }
  | { kind: 'tf'; qid: string; correct: boolean }
  | { kind: 'multi'; qid: string; options: { correct: boolean }[] }
  | { kind: 'order'; qid: string; items: string[] };

export async function openApp(page: Page, query = ''): Promise<string[]> {
  if (!existsSync(FILE)) throw new Error('dist/klsr-quiz.html not found — run `npm run build` first');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(APP_URL + query);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole('heading', { name: 'КЛСР — тренажер' })).toBeVisible();
  return errors;
}

export async function currentTask(page: Page): Promise<TaskInfo> {
  return page.evaluate(() => {
    const w = window as unknown as { __klsr: { state: () => { session: { tasks: unknown[]; current: number } } } };
    const s = w.__klsr.state().session;
    return s.tasks[s.current] as TaskInfo;
  });
}

export async function allTasks(page: Page): Promise<TaskInfo[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __klsr: { state: () => { session: { tasks: unknown[] } } } };
    return w.__klsr.state().session.tasks as TaskInfo[];
  });
}

export async function setCount(page: Page, n: number): Promise<void> {
  await page.locator('#count').fill(String(n));
  await page.locator('#count').press('Tab');
}

export async function setLimit(page: Page, n: number): Promise<void> {
  await page.locator('#limit').fill(String(n));
  await page.locator('#limit').press('Tab');
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Відповідає на поточне завдання правильно (або неправильно) і переходить далі. */
export async function answer(page: Page, correct = true): Promise<TaskInfo> {
  const t = await currentTask(page);
  switch (t.kind) {
    case 'card':
      await page.getByTestId(correct ? 'know' : 'dont-know').click();
      return t;
    case 'choice': {
      const right = t.options.findIndex((o) => o.correct);
      const index = correct ? right : (right + 1) % t.options.length;
      await page.getByTestId('option').nth(index).click();
      break;
    }
    case 'tf':
      await page.getByTestId(t.correct === correct ? 'tf-yes' : 'tf-no').click();
      break;
    case 'multi': {
      const indices = t.options.flatMap((o, i) => (o.correct ? [i] : []));
      for (const i of correct ? indices : indices.slice(1)) await page.getByTestId('multi-option').nth(i).click();
      await page.getByTestId('submit').click();
      break;
    }
    case 'order': {
      const items = correct ? t.items : [...t.items].reverse();
      for (const item of items) {
        await page
          .getByTestId('order-option')
          .filter({ hasText: new RegExp(`^${escape(item)}$`) })
          .first()
          .click();
      }
      await page.getByTestId('submit').click();
      break;
    }
  }
  await expect(page.getByTestId('feedback')).toContainText(correct ? 'Правильно' : 'Неправильно');
  await page.getByTestId('next').click();
  return t;
}
