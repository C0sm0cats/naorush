import { expect, test } from '@playwright/test';

test('loads to the title, starts stage 1 and reaches play', async ({ page }) => {
  /** @type {string[]} */
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'title', { timeout: 60000 });
  await page.locator('#play').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'talk', { timeout: 30000 });
  // Skip the intro dialogue: each press completes, then advances a line.
  await expect(async () => {
    await page.keyboard.press('Enter');
    expect(await page.locator('body').getAttribute('data-screen')).toBe('play');
  }).toPass({ timeout: 30000 });
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'play');
  await expect(page.locator('#hearts .heart')).not.toHaveCount(0);
  expect(errors).toEqual([]);
});

test('options open from the title and remember settings', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'title', { timeout: 60000 });
  await page.locator('#optionsBtn').click();
  await expect(page.locator('#options')).toBeVisible();
  await page.locator('#optContrast').check();
  await expect(page.locator('body')).toHaveClass(/contrast/);
  await page.locator('#optionsClose').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'title');
  await page.reload();
  await expect(page.locator('body')).toHaveClass(/contrast/, { timeout: 60000 });
});
