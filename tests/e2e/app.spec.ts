import { expect, test } from '@playwright/test';
import { allTasks, answer, currentTask, openApp, setCount, setLimit } from './helpers.ts';

test.describe('головний екран', () => {
  test('завантажується без помилок і без горизонтальної прокрутки', async ({ page }) => {
    const errors = await openApp(page);
    await expect(page.getByText('Залікові питання · Модуль 1 · 100 питань')).toBeVisible();
    await page.locator('[data-value=all]').click();
    await expect(page.getByText('Залікові питання · Загальний · 209 питань')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });

  test('налаштування зберігаються після перезавантаження', async ({ page }) => {
    await openApp(page);
    await page.locator('[data-value=choice]').click();
    await setCount(page, 12);
    await setLimit(page, 3);
    await page.reload();
    await expect(page.locator('[data-value=choice]')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#count')).toHaveValue('12');
    await expect(page.locator('#limit')).toHaveValue('3');
  });

  test('кількість за замовчуванням: «Модуль 1» — 20, «Загальний» — 30, окремо для кожного', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('#count')).toHaveValue('20');
    await page.locator('[data-value=all]').click();
    await expect(page.locator('#count')).toHaveValue('30');
    await setCount(page, 40);
    await page.locator('[data-value=m1]').click();
    await expect(page.locator('#count')).toHaveValue('20');
    await page.locator('[data-value=all]').click();
    await expect(page.locator('#count')).toHaveValue('40');
    await expect(page.getByText('ймовірних')).toHaveCount(0);
    await expect(page.getByText('Змішані формати')).toHaveCount(0);
  });

  test('«Як на заліку» ставить 30 питань і ліміт 10', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('preset-exam').click();
    await expect(page.locator('#count')).toHaveValue('30');
    await expect(page.locator('#limit')).toHaveValue('10');
  });
});

test.describe('картки', () => {
  test('перевертання, «знав/не знав», результат і складні питання', async ({ page }) => {
    await openApp(page);
    await setCount(page, 3);
    await page.getByTestId('start').click();
    await expect(page.getByTestId('progress')).toHaveText('Відповідей: 0 / 3');

    await expect(page.locator('#card-answer')).toBeHidden();
    await page.getByTestId('flip').click();
    await expect(page.locator('#card-answer')).toBeVisible();

    await page.getByTestId('know').click();
    await page.getByTestId('dont-know').click();
    await expect(page.getByTestId('stat-ok')).toHaveText('✓ 1');
    await expect(page.getByTestId('stat-bad')).toHaveText('✗ 1');
    await page.getByTestId('know').click();

    await expect(page.getByTestId('result-status')).toHaveText('Тест складено');
    await expect(page.getByTestId('result-line')).toContainText('Правильно: 2 · Неправильно: 1');
    await expect(page.locator('.rlist__item')).toHaveCount(1);
    await page.getByTestId('home').click();
    await expect(page.getByTestId('hard')).toHaveText('Складні питання (1)');
  });

  test('кнопки «Не знав» і «Знав» вирівняні: однакова ширина й висота, один рядок', async ({ page }) => {
    await openApp(page);
    await page.getByTestId('start').click();
    const a = (await page.getByTestId('dont-know').boundingBox())!;
    const b = (await page.getByTestId('know').boundingBox())!;
    expect(Math.abs(a.width - b.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(a.height - b.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(1);
    expect(a.x).toBeLessThan(b.x);
  });

  test('пропущені питання показуються в кінці з позначкою', async ({ page }) => {
    await openApp(page);
    await setCount(page, 3);
    await page.getByTestId('start').click();
    const first = (await currentTask(page)).qid;
    await page.getByTestId('skip').click();
    await expect(page.getByText('Пропущено: 1')).toBeVisible();
    await page.getByTestId('know').click();
    await page.getByTestId('know').click();
    expect((await currentTask(page)).qid).toBe(first);
    await expect(page.locator('.tag', { hasText: 'пропущене' })).toBeVisible();
    await page.getByTestId('know').click();
    await expect(page.getByTestId('result-line')).toContainText('Відповідей: 3 з 3');
  });

  test('ліміт помилок: індикатор, вікно, продовження до кінця', async ({ page }) => {
    await openApp(page);
    await setCount(page, 3);
    await setLimit(page, 1);
    await page.getByTestId('start').click();
    await page.getByTestId('dont-know').click();
    await expect(page.getByRole('dialog')).toContainText('Тест не складено');
    await page.getByRole('button', { name: 'Продовжити' }).click();
    await expect(page.getByTestId('fail-badge')).toBeVisible();
    await expect(page.getByTestId('progress')).toHaveText('Відповідей: 1 / 3');
    await page.getByTestId('know').click();
    await page.getByTestId('know').click();
    await expect(page.getByTestId('result-status')).toHaveText('Тест не складено');
  });

  test('ліміт помилок: «Почати заново» скидає тест', async ({ page }) => {
    await openApp(page);
    await setCount(page, 3);
    await setLimit(page, 1);
    await page.getByTestId('start').click();
    await page.getByTestId('dont-know').click();
    await page.getByRole('button', { name: 'Почати заново' }).click();
    await expect(page.getByTestId('progress')).toHaveText('Відповідей: 0 / 3');
    await expect(page.getByTestId('stat-bad')).toHaveText('✗ 0');
  });

  test('клавіатура: пробіл перевертає, → — «знав»', async ({ page, isMobile }) => {
    test.skip(isMobile, 'гарячі клавіші — для десктопа');
    await openApp(page);
    await setCount(page, 2);
    await page.getByTestId('start').click();
    await page.keyboard.press(' ');
    await expect(page.locator('#card-answer')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('stat-ok')).toHaveText('✓ 1');
  });
});

test.describe('вибір варіанту', () => {
  test('усі формати працюють; правильні відповіді — тест складено', async ({ page }) => {
    test.setTimeout(120_000);
    // ?alt=1 — усі питання з альтернативними форматами подаються в них (лише для тесту).
    await openApp(page, '?seed=7&alt=1');
    await page.locator('[data-value=all]').click();
    await page.locator('[data-value=choice]').click();
    await setCount(page, 209);
    await page.getByTestId('start').click();
    const kinds = new Set<string>();
    // Повний «Загальний» раунд: 209 питань мінус 2 дублікати з різних модулів.
    await expect(page.getByTestId('progress')).toHaveText('Відповідей: 0 / 207');
    for (let i = 0; i < 207; i++) {
      const t = await answer(page, true);
      kinds.add(t.kind === 'choice' ? `choice:${t.source}` : t.kind);
    }
    for (const k of ['choice:base', 'choice:term', 'tf', 'multi', 'order']) expect(kinds).toContain(k);
    await expect(page.getByTestId('result-status')).toHaveText('Тест складено');
    await expect(page.getByTestId('result-pct')).toHaveText('100%');
    await expect(page.getByTestId('result-grade')).toContainText('відмінно');
  });

  test('неправильні відповіді: підсвічування, відповідь з файлу, список помилок', async ({ page }) => {
    await openApp(page);
    await page.locator('[data-value=choice]').click();
    await setCount(page, 4);
    await setLimit(page, 10);
    await page.getByTestId('start').click();
    for (let i = 0; i < 4; i++) await answer(page, false);
    await expect(page.getByTestId('result-status')).toHaveText('Тест складено');
    await expect(page.getByTestId('result-line')).toContainText('Неправильно: 4');
    await expect(page.locator('.rlist__item')).toHaveCount(4);
    await expect(page.locator('.rlist__label', { hasText: 'Ваша відповідь' })).toHaveCount(4);
    await page.getByTestId('retry').click();
    await expect(page.getByTestId('progress')).toHaveText('Відповідей: 0 / 4');
  });

  test('ліміт помилок у режимі вибору: вікно, «Продовжити», далі до кінця', async ({ page }) => {
    await openApp(page);
    await page.locator('[data-value=choice]').click();
    await setCount(page, 3);
    await setLimit(page, 1);
    await page.getByTestId('start').click();
    const t = await currentTask(page);
    if (t.kind !== 'choice' && t.kind !== 'tf' && t.kind !== 'multi' && t.kind !== 'order') throw new Error(t.kind);
    // Неправильна відповідь будь-якого формату.
    if (t.kind === 'choice')
      await page
        .getByTestId('option')
        .nth((t.options.findIndex((o) => o.correct) + 1) % t.options.length)
        .click();
    if (t.kind === 'tf') await page.getByTestId(t.correct ? 'tf-no' : 'tf-yes').click();
    if (t.kind === 'multi') {
      await page
        .getByTestId('multi-option')
        .nth(t.options.findIndex((o) => !o.correct))
        .click();
      await page.getByTestId('submit').click();
    }
    if (t.kind === 'order') {
      for (const item of [...t.items].reverse())
        await page.getByTestId('order-option').filter({ hasText: item }).first().click();
      await page.getByTestId('submit').click();
    }
    await expect(page.getByRole('dialog')).toContainText('Тест не складено');
    await page.getByRole('button', { name: 'Продовжити' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('feedback')).toContainText('Неправильно');
    await page.getByTestId('next').click();
    await answer(page, true);
    await answer(page, true);
    await expect(page.getByTestId('result-status')).toHaveText('Тест не складено');
  });

  test('за замовчуванням ~10% питань в іншому форматі, решта — 4 варіанти з файлу', async ({ page }) => {
    await openApp(page);
    await page.locator('[data-value=choice]').click();
    await expect(page.getByTestId('alt-hint')).toContainText('10%');
    await page.getByTestId('start').click();
    const tasks = await allTasks(page);
    expect(tasks).toHaveLength(20);
    expect(new Set(tasks.map((t) => t.qid)).size).toBe(20);
    expect(tasks.filter((t) => !(t.kind === 'choice' && t.source === 'base'))).toHaveLength(2);

    await page.getByRole('button', { name: 'Меню', exact: true }).click();
    await page.locator('[data-value=all]').click();
    await page.getByTestId('start').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Почати' }).click(); // підтвердження: є незавершений тест
    const general = await allTasks(page);
    expect(general).toHaveLength(30);
    expect(new Set(general.map((t) => t.qid)).size).toBe(30);
    expect(general.filter((t) => !(t.kind === 'choice' && t.source === 'base'))).toHaveLength(3);
  });
});

test.describe('збережені питання', () => {
  test('додати зірочкою, переглянути, прибрати', async ({ page }) => {
    await openApp(page);
    await setCount(page, 2);
    await page.getByTestId('start').click();
    const qid = (await currentTask(page)).qid;
    await page.getByRole('button', { name: 'Зберегти питання' }).click();
    await expect(page.getByRole('button', { name: 'Прибрати зі збережених' })).toBeVisible();
    await page.getByRole('button', { name: 'Меню', exact: true }).click();
    await expect(page.getByTestId('saved')).toHaveText('Збережені питання (1)');

    await page.getByTestId('saved').click();
    await expect(page.locator(`[data-qid="${qid}"]`)).toBeVisible();
    await page.locator(`[data-qid="${qid}"] summary`).click();
    await expect(page.locator(`[data-qid="${qid}"] details`)).toHaveAttribute('open', '');

    await page.getByTestId('start-saved').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Почати' }).click(); // підтвердження: є незавершений тест
    await expect(page.getByTestId('progress')).toHaveText('Відповідей: 0 / 1');
    expect((await currentTask(page)).qid).toBe(qid);

    await page.getByRole('button', { name: 'Меню', exact: true }).click();
    await page.getByTestId('saved').click();
    await page.getByTestId('unsave').click();
    await expect(page.getByText('Поки що немає збережених питань.')).toBeVisible();
  });
});

test.describe('налаштування між режимами', () => {
  test('кількість питань (20 / 30) не змінюється при перемиканні режиму', async ({ page }) => {
    await openApp(page);
    for (const mode of ['choice', 'cards', 'choice', 'cards']) {
      await page.locator(`[data-value=${mode}]`).click();
      await expect(page.locator('#count')).toHaveValue('20');
    }
    await page.locator('[data-value=all]').click();
    for (const mode of ['choice', 'cards', 'choice']) {
      await page.locator(`[data-value=${mode}]`).click();
      await expect(page.locator('#count')).toHaveValue('30');
    }
    await page.reload();
    await expect(page.locator('#count')).toHaveValue('30');
    await page.locator('[data-value=m1]').click();
    await expect(page.locator('#count')).toHaveValue('20');
    // І в самому тесті кількість відповідає налаштуванню для обох режимів.
    await page.getByTestId('start').click();
    await expect(page.getByTestId('progress')).toHaveText('Відповідей: 0 / 20');
  });
});

test.describe('тема оформлення', () => {
  const bg = (page: import('@playwright/test').Page) =>
    page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  test('світла / темна / як у системі; вибір запам’ятовується', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await openApp(page);
    await expect(page.locator('[data-theme-value=system]')).toHaveAttribute('aria-checked', 'true');
    expect(await bg(page)).toBe('rgb(18, 20, 24)'); // система — темна

    await page.locator('[data-theme-value=light]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect.poll(() => bg(page)).toBe('rgb(244, 245, 247)');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('[data-theme-value=light]')).toHaveAttribute('aria-checked', 'true');
    await expect.poll(() => bg(page)).toBe('rgb(244, 245, 247)');

    await page.emulateMedia({ colorScheme: 'light' });
    await page.locator('[data-theme-value=dark]').click();
    await expect.poll(() => bg(page)).toBe('rgb(18, 20, 24)');

    await page.locator('[data-theme-value=system]').click();
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
    await expect.poll(() => bg(page)).toBe('rgb(244, 245, 247)');
  });
});

test.describe('анімації, фокус і прокрутка', () => {
  test('усі анімації та переходи в CSS — не довше 0,2 с', async ({ page }) => {
    await openApp(page);
    const durations = await page.evaluate(() => {
      const out: string[] = [];
      const walk = (rules: CSSRuleList) => {
        for (const r of Array.from(rules)) {
          if ('cssRules' in r && (r as CSSGroupingRule).cssRules) walk((r as CSSGroupingRule).cssRules);
          const st = (r as CSSStyleRule).style;
          if (!st) continue;
          for (const v of [st.transitionDuration, st.animationDuration]) if (v) out.push(...v.split(','));
        }
      };
      for (const sheet of Array.from(document.styleSheets)) walk(sheet.cssRules);
      // `auto` / `initial` — це скасування анімації (prefers-reduced-motion), не тривалість.
      return out.map((v) => v.trim()).filter((v) => /^[\d.]+m?s$/.test(v));
    });
    expect(durations.length).toBeGreaterThan(0);
    for (const d of durations) {
      const sec = d.endsWith('ms') ? parseFloat(d) / 1000 : parseFloat(d);
      expect(sec, d).toBeLessThanOrEqual(0.2);
    }
  });

  test('після відповіді — анімація й фокус на правильному варіанті, видно його й вибраний', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 560 });
    await openApp(page, '?alt=0');
    await page.locator('[data-value=choice]').click();
    await page.getByTestId('start').click();
    const t = await currentTask(page);
    if (t.kind !== 'choice') throw new Error(t.kind);
    const right = t.options.findIndex((o) => o.correct);
    const wrong = (right + 1) % 4;
    await page.getByTestId('option').nth(wrong).click();

    await expect(page.locator('main')).toHaveClass(/is-just-answered/);
    const correct = page.getByTestId('option').nth(right);
    await expect(correct).toBeFocused();
    await expect(correct).toHaveClass(/is-right/);
    const anim = await correct.evaluate((el) => getComputedStyle(el).animationName);
    expect(anim).toBe('answer-pop');
    expect(await page.locator('.is-wrong').evaluate((el) => getComputedStyle(el).animationName)).toBe('answer-shake');

    await page.waitForTimeout(260);
    const barBottom = await page.locator('.quizbar').evaluate((el) => el.getBoundingClientRect().bottom);
    const vh = page.viewportSize()!.height;
    const inView = (box: { y: number; height: number }) => box.y >= barBottom - 1 && box.y + box.height <= vh + 1;
    const rightBox = (await correct.boundingBox())!;
    const wrongBox = (await page.getByTestId('option').nth(wrong).boundingBox())!;
    // Правильний варіант (з фокусом) видно завжди; обидва — якщо разом вміщуються.
    expect(inView(rightBox)).toBe(true);
    const top = Math.min(rightBox.y, wrongBox.y);
    const bottom = Math.max(rightBox.y + rightBox.height, wrongBox.y + wrongBox.height);
    if (bottom - top <= vh - barBottom - 24) expect(inView(wrongBox)).toBe(true);
    // Змінити відповідь після вибору не можна.
    await page.getByTestId('option').nth(right).click({ force: true });
    await expect(page.getByTestId('stat-bad')).toHaveText('✗ 1');

    // Enter на сфокусованому варіанті — «Далі»; анімація лише один раз.
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('progress')).toHaveText('Відповідей: 1 / 20');
    await expect(page.locator('main')).not.toHaveClass(/is-just-answered/);
  });

  test('після переходу до наступного питання сторінка прокручується до питання', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 560 });
    await openApp(page, '?alt=0');
    await page.locator('[data-value=choice]').click();
    await page.getByTestId('start').click();
    for (let i = 0; i < 3; i++) {
      await answer(page, false); // з довгими відповідями сторінка прокручується вниз
      await page.waitForTimeout(260);
      const card = await page.locator('.qcard').boundingBox();
      const barBottom = await page.locator('.quizbar').evaluate((el) => el.getBoundingClientRect().bottom);
      expect(card!.y).toBeGreaterThanOrEqual(barBottom - 1);
      expect(card!.y).toBeLessThanOrEqual(barBottom + 24);
      await expect(page.locator('.qcard__text')).toBeInViewport();
    }
  });

  test('панель з лічильниками лишається видимою при прокрутці', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 480 });
    await openApp(page, '?alt=0');
    await page.locator('[data-value=choice]').click();
    await page.getByTestId('start').click();
    await page.mouse.wheel(0, 2000);
    await page.waitForTimeout(100);
    await expect(page.getByTestId('stat-ok')).toBeInViewport();
  });
});

test.describe('незавершений тест', () => {
  test('продовжується після перезавантаження сторінки', async ({ page }) => {
    await openApp(page);
    await setCount(page, 5);
    await page.getByTestId('start').click();
    await page.getByTestId('know').click();
    await page.getByTestId('dont-know').click();
    await page.reload();
    await expect(page.getByTestId('resume')).toHaveText('Продовжити тест (2 з 5)');
    await page.getByTestId('resume').click();
    await expect(page.getByTestId('progress')).toHaveText('Відповідей: 2 / 5');
    await expect(page.getByTestId('stat-bad')).toHaveText('✗ 1');
  });
});
