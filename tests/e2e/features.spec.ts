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
    await page.getByRole('button', { name: 'Меню', exact: true }).click();

    await expect(page.getByTestId('excluded')).toHaveText('Виключені питання (2)');
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
    await page.getByRole('button', { name: 'Меню', exact: true }).click();

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
    await page.getByRole('button', { name: 'Меню', exact: true }).click();
    await expect(page.getByTestId('excluded')).toHaveText('Виключені питання (0)');
  });

  test('у тесті зі збережених: питань стає менше, останнє — повернення в меню', async ({ page }) => {
    await openApp(page);
    await setCount(page, 2);
    await page.getByTestId('start').click();
    await page.getByRole('button', { name: 'Зберегти питання' }).click();
    await page.getByTestId('know').click();
    await page.getByRole('button', { name: 'Зберегти питання' }).click();
    await page.getByRole('button', { name: 'Меню', exact: true }).click();
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

/** Анімація з CSS-класу елемента (стабільно, навіть якщо вона вже завершилась). */
const cssAnimation = (page: Page, selector: string) =>
  page.locator(selector).evaluate((el) => {
    const st = getComputedStyle(el);
    return { name: st.animationName, duration: st.animationDuration };
  });

/** Анімації Web Animations API на елементі (смужка часу). */
const scriptAnimations = (page: Page, selector: string) =>
  page.locator(selector).evaluate((el) =>
    el.getAnimations().map((a) => {
      const t = a.effect!.getComputedTiming();
      return { duration: Number(t.duration), easing: String(t.easing) };
    }),
  );

test.describe('повідомлення про виключення: таймер, ×, анімації', () => {
  test('з’являється за 0,2 с; смужка 30 с зменшується справа наліво; × закриває за 0,2 с', async ({ page }) => {
    await openApp(page);
    await setCount(page, 3);
    await page.getByTestId('start').click();
    await page.getByTestId('exclude').click();

    const wrap = page.getByTestId('exclude-notice-wrap');
    await expect(wrap).toHaveClass(/is-opening/);
    expect(await cssAnimation(page, '[data-testid=exclude-notice-wrap]')).toEqual({
      name: 'collapse-open',
      duration: '0.2s',
    });

    // Смужка — вгорі повідомлення, на всю ширину; анімація 30 с, рівномірна, справа наліво.
    const notice = (await page.getByTestId('exclude-notice').boundingBox())!;
    const bar = page.getByTestId('notice-timer');
    const barBox = (await bar.boundingBox())!;
    expect(Math.abs(barBox.y - notice.y)).toBeLessThanOrEqual(2);
    expect(barBox.height).toBeLessThanOrEqual(4);
    expect(await scriptAnimations(page, '[data-testid=notice-timer]')).toEqual([
      { duration: 30_000, easing: 'linear' },
    ]);
    expect(await bar.evaluate((el) => getComputedStyle(el).transformOrigin.startsWith('0px'))).toBe(true);
    const scale = () => bar.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
    const s1 = await scale();
    await page.waitForTimeout(600);
    const s2 = await scale();
    expect(s2).toBeLessThan(s1);
    expect(s2).toBeGreaterThan(0.9);

    // Перемальовування (позначка зірочкою) не перезапускає відлік.
    await page.getByRole('button', { name: 'Зберегти питання' }).click();
    expect(await scale()).toBeLessThanOrEqual(s2);

    // × — справа зверху.
    const close = page.getByTestId('close-notice');
    await expect(close).toHaveAttribute('aria-label', 'Закрити повідомлення');
    const c = (await close.boundingBox())!;
    expect(notice.x + notice.width - (c.x + c.width)).toBeLessThanOrEqual(12);
    expect(c.y - notice.y).toBeLessThanOrEqual(12);
    const qid = (await currentTask(page)).qid;
    await close.click();
    await expect(wrap).toHaveClass(/is-closing/);
    expect(await cssAnimation(page, '[data-testid=exclude-notice-wrap]')).toEqual({
      name: 'collapse-close',
      duration: '0.2s',
    });
    await expect(wrap).toHaveCount(0);
    // Закриття не скасовує виключення і не змінює питання.
    expect((await currentTask(page)).qid).toBe(qid);
    expect((await persisted(page)).excluded).toHaveLength(1);
  });

  test('закривається само через 30 секунд', async ({ page }) => {
    await page.clock.install();
    await openApp(page);
    await setCount(page, 3);
    await page.getByTestId('start').click();
    await page.getByTestId('exclude').click();
    await expect(page.getByTestId('exclude-notice')).toBeVisible();
    await page.clock.fastForward(29_000);
    await expect(page.getByTestId('exclude-notice-wrap')).not.toHaveClass(/is-closing/);
    await expect(page.getByTestId('exclude-notice')).toBeVisible();
    await page.clock.fastForward(1_100);
    await expect(page.getByTestId('exclude-notice-wrap')).toHaveCount(0);
    expect((await persisted(page)).excluded).toHaveLength(1);
  });

  test('«Скасувати виключення» — кнопка на повідомленні; повідомлення плавно зникає', async ({ page }) => {
    await openApp(page);
    await setCount(page, 3);
    await page.getByTestId('start').click();
    const before = (await currentTask(page)).qid;
    await page.getByTestId('exclude').click();
    const undo = page.getByTestId('exclude-notice').getByRole('button', { name: 'Скасувати виключення' });
    await expect(undo).toBeVisible();
    await undo.click();
    await expect(page.getByTestId('exclude-notice-wrap')).toHaveClass(/is-closing/);
    expect((await currentTask(page)).qid).toBe(before);
    await expect(page.getByTestId('exclude-notice-wrap')).toHaveCount(0);
    expect((await persisted(page)).excluded).toEqual([]);
  });
});

test.describe('плавна поява і приховування блоків (0,2 с)', () => {
  test('налаштування складності з’являється і зникає при зміні режиму', async ({ page }) => {
    await openApp(page);
    const block = page.getByTestId('choice-settings');
    await expect(block).toBeHidden();
    await page.locator('[data-value=choice]').click();
    await expect(block).toHaveClass(/is-opening/);
    expect(await cssAnimation(page, '[data-testid=choice-settings]')).toEqual({
      name: 'collapse-open',
      duration: '0.2s',
    });
    await expect(block).toBeVisible();
    await page.locator('[data-value=cards]').click();
    await expect(block).toHaveClass(/is-closing/);
    expect(await cssAnimation(page, '[data-testid=choice-settings]')).toEqual({
      name: 'collapse-close',
      duration: '0.2s',
    });
    await expect(block).toBeHidden();
    // Приховане налаштування недоступне з клавіатури.
    await expect(page.locator('[data-value=easy]')).toBeHidden();
    expect(await block.evaluate((el) => (el as HTMLElement).inert)).toBe(true);
  });

  test('відповідь на картці розгортається і згортається', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('start').click();
    const answerBlock = page.locator('#card-answer');
    await expect(answerBlock).toBeHidden();
    await page.getByTestId('flip').click();
    await expect(answerBlock).toHaveClass(/is-opening/);
    expect(await cssAnimation(page, '#card-answer')).toEqual({ name: 'collapse-open', duration: '0.2s' });
    await expect(answerBlock).toBeVisible();
    await page.getByTestId('flip').click();
    await expect(answerBlock).toHaveClass(/is-closing/);
    expect(await cssAnimation(page, '#card-answer')).toEqual({ name: 'collapse-close', duration: '0.2s' });
    await expect(answerBlock).toBeHidden();
  });
});

test.describe('складність варіантів', () => {
  test('налаштування лише в режимі вибору; за замовчуванням — складні; запам’ятовується', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('[data-value=easy]')).toBeHidden();
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
    await page.getByRole('button', { name: 'Меню', exact: true }).click();
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
      await page.getByRole('button', { name: 'Меню', exact: true }).click();
      await page.getByTestId('changelog').click();
      await check('changelog');
      expect(errors).toEqual([]);
    });
  }
});

test.describe('перемикач теми: анімація', () => {
  /** Рахує виклики View Transitions API (кругова зміна теми). */
  const countViewTransitions = (page: Page) =>
    page.addInitScript(() => {
      const w = window as unknown as { __vt: number };
      w.__vt = 0;
      const d = document as unknown as { startViewTransition?: (cb: () => void) => unknown };
      const orig = d.startViewTransition?.bind(document);
      if (orig)
        d.startViewTransition = (cb: () => void) => {
          w.__vt++;
          return orig(cb);
        };
    });
  const vtCalls = (page: Page) => page.evaluate(() => (window as unknown as { __vt: number }).__vt);

  test('повзунок їде до вибраної теми, значок обертається, тема розходиться колом — 0,2 с', async ({ page }) => {
    await countViewTransitions(page);
    await page.emulateMedia({ colorScheme: 'light' });
    await openApp(page);
    const thumb = page.locator('.theme__thumb');
    const at = async (value: string) => {
      const [t, b] = await Promise.all([
        thumb.boundingBox(),
        page.locator(`[data-theme-value=${value}]`).boundingBox(),
      ]);
      return Math.abs(t!.x - b!.x) <= 1 && Math.abs(t!.y - b!.y) <= 1;
    };
    await expect.poll(() => at('system')).toBe(true);

    await page.locator('[data-theme-value=dark]').click();
    await expect(page.locator('.theme')).toHaveClass(/is-moving/);
    expect(await cssAnimation(page, '.theme__thumb')).toEqual({ name: 'theme-thumb', duration: '0.2s' });
    expect(await cssAnimation(page, '.theme__btn.is-on .icon')).toEqual({ name: 'theme-icon', duration: '0.2s' });
    await expect.poll(() => at('dark')).toBe(true);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await vtCalls(page)).toBe(1);

    // Кругове розкриття нової теми описане в CSS і триває 0,2 с.
    const reveal = await page.evaluate(() => {
      for (const sheet of Array.from(document.styleSheets))
        for (const r of Array.from(sheet.cssRules)) {
          const rule = r as CSSStyleRule;
          if (rule.selectorText === '::view-transition-new(root)' && rule.style.animationName)
            return `${rule.style.animationName} ${rule.style.animationDuration}`;
        }
      return null;
    });
    expect(reveal).toBe('theme-reveal 0.2s');

    // Повторне натискання на активну тему нічого не змінює.
    await page.locator('[data-theme-value=dark]').click();
    expect(await vtCalls(page)).toBe(1);

    // Інший екран і повернення — без анімації повзунка.
    await page.getByTestId('changelog').click();
    await page.getByRole('button', { name: 'Меню', exact: true }).click();
    await expect(page.locator('.theme')).not.toHaveClass(/is-moving/);
    await expect.poll(() => at('dark')).toBe(true);
  });

  test('при «зменшеному русі» тема змінюється одразу, без кола', async ({ page }) => {
    await countViewTransitions(page);
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
    await openApp(page);
    await page.locator('[data-theme-value=dark]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(18, 20, 24)');
    expect(await vtCalls(page)).toBe(0);
  });
});

test.describe('очищення списків', () => {
  const lists = (page: Page) =>
    page.evaluate(() => {
      const d = JSON.parse(localStorage.getItem('klsr-quiz:v2') ?? '{}') as Record<string, unknown>;
      return { hard: d.hard, saved: d.saved, excluded: d.excluded, session: d.session !== null };
    });

  test('«Очистити» в «Мої списки»: підтвердження, очищує складні, збережені й виключені', async ({ page }) => {
    await openApp(page);
    const clear = page.locator('.lists').getByTestId('clear-lists');
    await expect(clear).toBeVisible();
    await expect(clear).toBeDisabled();
    await expect(clear).toHaveAttribute('title', 'Очистити складні, збережені й виключені питання');

    await setCount(page, 3);
    await page.getByTestId('start').click();
    await page.getByRole('button', { name: 'Зберегти питання' }).click();
    await page.getByTestId('dont-know').click();
    await page.getByTestId('exclude').click();
    await page.getByRole('button', { name: 'Меню', exact: true }).click();

    await expect(page.getByTestId('hard')).toHaveText('Складні питання (1)');
    await expect(page.getByTestId('saved')).toHaveText('Збережені питання (1)');
    await expect(page.getByTestId('excluded')).toHaveText('Виключені питання (1)');
    await expect(clear).toBeEnabled();

    // «Скасувати» в діалозі нічого не змінює.
    await clear.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.locator('.modal__title')).toHaveText('Очистити всі списки?');
    await expect(dialog.locator('.modal__title')).toHaveClass(/is-danger/);
    await expect(dialog).toContainText('складні питання — 1, збережені — 1, виключені — 1');
    await dialog.getByRole('button', { name: 'Скасувати' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId('hard')).toHaveText('Складні питання (1)');

    await clear.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Очистити' }).click();
    await expect(page.getByTestId('hard')).toHaveText('Складні питання (0)');
    await expect(page.getByTestId('saved')).toHaveText('Збережені питання (0)');
    await expect(page.getByTestId('excluded')).toHaveText('Виключені питання (0)');
    await expect(clear).toBeDisabled();
    // Незавершений тест лишається.
    await expect(page.getByTestId('resume')).toBeVisible();
    expect(await lists(page)).toEqual({ hard: [], saved: [], excluded: [], session: true });
    await page.reload();
    await expect(page.getByTestId('hard')).toHaveText('Складні питання (0)');
  });
});

test.describe('кнопки: значки й підказки', () => {
  /**
   * Кожна видима текстова кнопка має значок; кожна кнопка-значок — `title` і `aria-label`.
   * Варіанти відповіді (.opts, .order) — це зміст питання, а не дії, тому без значків.
   */
  const audit = (page: Page, where: string) =>
    page
      .evaluate(() => {
        const problems: string[] = [];
        for (const el of Array.from(document.querySelectorAll<HTMLElement>('button, a.link'))) {
          if (!el.checkVisibility({ visibilityProperty: true }) || el.closest('.opts, .order')) continue;
          const text = el.textContent!.trim();
          if (text) {
            if (!el.querySelector('svg.icon')) problems.push(`без значка: «${text}»`);
          } else if (!el.title || !el.getAttribute('aria-label')) {
            problems.push(`без підказки: ${el.outerHTML.slice(0, 80)}`);
          }
        }
        return problems;
      })
      .then((p) => expect(p, where).toEqual([]));

  test('на всіх екранах і в діалогах', async ({ page }) => {
    await openApp(page);
    await page.locator('[data-value=choice]').click();
    await audit(page, 'home');
    await setCount(page, 3);
    await page.getByTestId('start').click();
    await audit(page, 'quiz');
    await page.getByTestId('exclude').click();
    await audit(page, 'quiz + notice');
    await page.getByTestId('finish').click();
    await audit(page, 'finish dialog');
    await page.getByRole('dialog').getByRole('button', { name: 'Скасувати' }).click();
    await answer(page, false);
    await answer(page, true);
    await answer(page, true);
    await page.locator('.rlist__item .star').first().click();
    await audit(page, 'result');

    await page.getByTestId('home').click();
    await page.getByTestId('saved').click();
    await audit(page, 'saved');
    await page.getByRole('button', { name: 'Меню', exact: true }).click();
    await page.getByTestId('excluded').click();
    await audit(page, 'excluded');
    await page.getByTestId('restore-all').click();
    await audit(page, 'restore dialog');
    await page.getByRole('dialog').getByRole('button', { name: 'Скасувати' }).click();
    await page.getByRole('button', { name: 'Меню', exact: true }).click();
    await page.getByTestId('changelog').click();
    await audit(page, 'changelog');
    await page.getByRole('button', { name: 'Меню', exact: true }).click();
    await page.getByTestId('clear-lists').click();
    await audit(page, 'clear dialog');
    await page.getByRole('dialog').getByRole('button', { name: 'Скасувати' }).click();

    await page.locator('[data-value=cards]').click();
    await page.getByTestId('start').click();
    await audit(page, 'cards');
    await page.getByTestId('flip').click();
    await audit(page, 'cards revealed');
  });
});
