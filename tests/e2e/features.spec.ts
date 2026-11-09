import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { allTasks, answer, currentTask, openApp, setCount } from './helpers.ts';

const VERSION = (
  JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string }
).version;

const persisted = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('klsr-quiz:v2') ?? '{}') as { excluded?: string[] });

test.describe('виключення питань', () => {
  test('значок з підказкою; замість виключеного — інше питання, кількість та сама', async ({ page }) => {
    await openApp(page);
    await page.locator('[data-value=choice]').click();
    await setCount(page, 5);
    await page.getByTestId('start').click();

    const btn = page.getByTestId('exclude');
    await expect(btn).toBeVisible();
    await expect(btn).toHaveAttribute('title', /Виключити питання/);
    const box = (await btn.boundingBox())!;
    expect(box.width).toBeLessThanOrEqual(44); // маленька іконка

    const before = await currentTask(page);
    await btn.click();
    const notice = page.getByTestId('exclude-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('виключено');
    await expect(notice).toContainText('Замість нього додано інше питання');
    await expect(notice).toContainText('Виключені питання');
    await expect(page.getByTestId('progress')).toHaveText('Відповідей: 0 / 5');

    const after = await currentTask(page);
    expect(after.qid).not.toBe(before.qid);
    const tasks = await allTasks(page);
    expect(tasks).toHaveLength(5);
    expect(tasks.map((t) => t.qid)).not.toContain(before.qid);
    expect(new Set(tasks.map((t) => t.qid)).size).toBe(5);
    expect((await persisted(page)).excluded).toEqual([before.qid]);

    // Повідомлення зникає після переходу до наступного питання; тест працює далі.
    await answer(page, true);
    await expect(notice).toHaveCount(0);
    for (let i = 0; i < 4; i++) await answer(page, true);
    await expect(page.getByTestId('result-pct')).toHaveText('100%');
    await expect(page.getByTestId('result-line')).toContainText('Відповідей: 5 з 5');
  });

  test('«Скасувати» повертає питання на місце', async ({ page }) => {
    await openApp(page);
    await setCount(page, 3);
    await page.getByTestId('start').click();
    const before = await currentTask(page);
    await page.getByTestId('exclude').click();
    await page.getByTestId('undo-exclude').click();
    await expect(page.getByTestId('exclude-notice')).toHaveCount(0);
    expect((await currentTask(page)).qid).toBe(before.qid);
    expect((await persisted(page)).excluded).toEqual([]);
  });

  test('якщо замінити нічим — кількість питань зменшується', async ({ page }) => {
    await openApp(page);
    await setCount(page, 100); // усі питання модуля вже в раунді
    await page.getByTestId('start').click();
    await expect(page.getByTestId('progress')).toHaveText('Відповідей: 0 / 100');
    await page.getByTestId('know').click();
    await page.getByTestId('exclude').click();
    await expect(page.getByTestId('exclude-notice')).toContainText('питань у тесті стало менше');
    await expect(page.getByTestId('progress')).toHaveText('Відповідей: 1 / 99');
    await page.getByTestId('exclude').click();
    await expect(page.getByTestId('progress')).toHaveText('Відповідей: 1 / 98');
    expect((await persisted(page)).excluded).toHaveLength(2);
  });

  test('виключені не потрапляють у нові тести; список, повернення одного й усіх', async ({ page }) => {
    await openApp(page);
    await setCount(page, 2);
    await page.getByTestId('start').click();
    const first = (await currentTask(page)).qid;
    await page.getByTestId('exclude').click();
    const second = (await currentTask(page)).qid;
    await page.getByTestId('exclude').click();
    await page.getByRole('button', { name: '← Меню' }).click();

    await expect(page.getByTestId('excluded')).toHaveText('⊘ Виключені питання (2)');
    await expect(page.getByTestId('excluded-note')).toHaveText(' · виключено 2');
    await expect(page.locator('#count')).toHaveAttribute('max', '98');

    // Новий тест з усіх питань модуля — без виключених.
    await setCount(page, 100);
    await expect(page.locator('#count')).toHaveValue('98');
    await page.getByTestId('start').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Почати' }).click();
    const ids = (await allTasks(page)).map((t) => t.qid);
    expect(ids).toHaveLength(98);
    expect(ids).not.toContain(first);
    expect(ids).not.toContain(second);
    await page.getByRole('button', { name: '← Меню' }).click();

    await page.getByTestId('excluded').click();
    await expect(page.getByRole('heading', { name: 'Виключені питання (2)' })).toBeVisible();
    await expect(page.getByTestId('excluded-item')).toHaveCount(2);
    await page.locator(`[data-qid="${first}"]`).getByTestId('restore').click();
    await expect(page.getByTestId('excluded-item')).toHaveCount(1);
    await expect(page.locator(`[data-qid="${second}"]`)).toBeVisible();

    await page.getByTestId('restore-all').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Повернути всі' }).click();
    await expect(page.getByTestId('excluded-empty')).toBeVisible();
    expect((await persisted(page)).excluded).toEqual([]);
    await page.getByRole('button', { name: '← Меню' }).click();
    await expect(page.getByTestId('excluded')).toHaveText('⊘ Виключені питання (0)');
  });

  test('у тесті зі збережених: питань стає менше, останнє — повернення в меню', async ({ page }) => {
    await openApp(page);
    await setCount(page, 2);
    await page.getByTestId('start').click();
    await page.getByRole('button', { name: 'Зберегти питання' }).click();
    await page.getByTestId('know').click();
    await page.getByRole('button', { name: 'Зберегти питання' }).click();
    await page.getByRole('button', { name: '← Меню' }).click();
    await page.getByTestId('saved').click();
    await page.getByTestId('start-saved').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Почати' }).click();
    await expect(page.getByTestId('progress')).toHaveText('Відповідей: 0 / 2');

    await page.getByTestId('exclude').click();
    await expect(page.getByTestId('progress')).toHaveText('Відповідей: 0 / 1');
    await page.getByTestId('exclude').click();
    await expect(page.getByRole('heading', { name: 'КЛСР — тренажер' })).toBeVisible();
    await expect(page.getByTestId('resume')).toHaveCount(0);
    await page.getByTestId('saved').click();
    await expect(page.locator('.tag', { hasText: 'виключене' })).toHaveCount(2);
    await expect(page.getByText('Усі збережені питання виключено.')).toBeVisible();
  });
});

test.describe('складність варіантів', () => {
  test('налаштування лише в режимі вибору; за замовчуванням — складні; запам’ятовується', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('[data-value=easy]')).toHaveCount(0);
    await page.locator('[data-value=choice]').click();
    await expect(page.locator('[data-value=hard]')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('difficulty-hint')).toContainText('як на заліку');
    await page.locator('[data-value=easy]').click();
    await expect(page.getByTestId('difficulty-hint')).toContainText('суміжні питання');
    await page.reload();
    await expect(page.locator('[data-value=easy]')).toHaveAttribute('aria-checked', 'true');
  });

  test('легкі: усі формати, правильні відповіді зараховуються — 100%', async ({ page }) => {
    test.setTimeout(120_000);
    await openApp(page, '?seed=11&alt=1');
    await page.locator('[data-value=choice]').click();
    await page.locator('[data-value=easy]').click();
    await setCount(page, 100);
    await page.getByTestId('start').click();
    await expect(page.getByTestId('progress')).toHaveText('Відповідей: 0 / 100');
    for (let i = 0; i < 100; i++) await answer(page, true);
    await expect(page.getByTestId('result-status')).toHaveText('Тест складено');
    await expect(page.getByTestId('result-pct')).toHaveText('100%');
    await expect(page.locator('.screen--result .muted').first()).toContainText('Вибір варіанту (легкі)');
  });

  test('легкі: неправильна відповідь підсвічується, у помилках — відповідь з файлу', async ({ page }) => {
    await openApp(page, '?alt=0');
    await page.locator('[data-value=choice]').click();
    await page.locator('[data-value=easy]').click();
    await setCount(page, 3);
    await page.getByTestId('start').click();
    const t = await currentTask(page);
    if (t.kind !== 'choice') throw new Error(t.kind);
    expect(t.options).toHaveLength(4);
    expect(t.options.filter((o) => o.correct)).toHaveLength(1);
    await answer(page, false);
    await expect(page.getByTestId('stat-bad')).toHaveText('✗ 1');
    await answer(page, true);
    await answer(page, true);
    await expect(page.locator('.rlist__item')).toHaveCount(1);
    await expect(page.locator('.rlist__label', { hasText: 'Правильна відповідь' })).toBeVisible();
  });
});

test.describe('випадковий порядок варіантів', () => {
  test('правильний варіант — на різних позиціях; «Пройти знову» перемішує заново', async ({ page }) => {
    await openApp(page, '?alt=0');
    await page.locator('[data-value=choice]').click();
    await setCount(page, 30);
    await page.getByTestId('start').click();
    const positions = (tasks: Awaited<ReturnType<typeof allTasks>>) =>
      tasks.map((t) => (t.kind === 'choice' ? t.options.findIndex((o) => o.correct) : -1));
    const a = positions(await allTasks(page));
    expect(new Set(a).size).toBe(4);
    await page.getByTestId('finish').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Завершити' }).click();
    await page.getByTestId('again').click();
    const b = positions(await allTasks(page));
    expect(a.join()).not.toBe(b.join());
  });
});

test.describe('версія і «Що нового»', () => {
  test('у підвалі — версія; сторінка змін відкривається й закривається', async ({ page }) => {
    await openApp(page);
    await expect(page.getByTestId('version')).toHaveText(`Версія ${VERSION}`);
    await page.getByTestId('changelog').click();
    await expect(page.getByRole('heading', { name: 'Що нового' })).toBeVisible();
    const latest = page.getByTestId('release').first();
    await expect(latest).toHaveAttribute('data-version', VERSION);
    await expect(latest).toContainText('поточна');
    await expect(latest.locator('li').first()).toBeVisible();
    expect(await page.getByTestId('release').count()).toBeGreaterThanOrEqual(5);
    await page.getByRole('button', { name: '← Меню' }).click();
    await expect(page.getByRole('heading', { name: 'КЛСР — тренажер' })).toBeVisible();
  });
});

test.describe('вигляд у світлій і темній темі', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`${scheme}: усі екрани без горизонтальної прокрутки, тексти контрастні`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      const errors = await openApp(page, '?alt=0');
      const check = async (where: string) => {
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, `${where}: horizontal overflow`).toBeLessThanOrEqual(0);
        // Текст не зливається з фоном (WCAG ≥ 4.5 для основного і ≥ 3 для другорядного тексту).
        const worst = await page.evaluate(() => {
          const lum = (c: string) => {
            const [r, g, b] = (c.match(/[\d.]+/g) ?? ['0', '0', '0']).slice(0, 3).map((v) => {
              const x = Number(v) / 255;
              return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
          };
          const bgOf = (el: Element | null): string => {
            for (let e = el; e; e = e.parentElement) {
              const bg = getComputedStyle(e).backgroundColor;
              if (bg && !/rgba\(.*, 0\)|transparent/.test(bg)) return bg;
            }
            return getComputedStyle(document.body).backgroundColor;
          };
          let min = 99;
          let who = '';
          for (const el of Array.from(document.querySelectorAll('main *'))) {
            const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent!.trim());
            if (!own || !(el as HTMLElement).offsetParent) continue;
            const [a, b] = [lum(getComputedStyle(el).color), lum(bgOf(el))];
            const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
            if (ratio < min) [min, who] = [ratio, `${el.tagName}.${el.className}: ${el.textContent!.slice(0, 30)}`];
          }
          return { min, who };
        });
        expect(worst.min, `${where}: ${worst.who}`).toBeGreaterThanOrEqual(3);
      };

      await page.locator('[data-value=choice]').click();
      await check('home');
      await setCount(page, 3);
      await page.getByTestId('start').click();
      await page.getByTestId('exclude').click();
      await check('quiz + notice');
      await answer(page, false);
      await answer(page, true);
      await answer(page, true);
      await check('result');
      await page.getByTestId('home').click();
      await page.getByTestId('excluded').click();
      await check('excluded');
      await page.getByRole('button', { name: '← Меню' }).click();
      await page.getByTestId('changelog').click();
      await check('changelog');
      expect(errors).toEqual([]);
    });
  }
});
