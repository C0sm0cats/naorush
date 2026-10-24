import { expect as baseExpect, test } from '@playwright/test';

// SwiftShader WebGL is slow, more so on a busy machine: be generous.
const expect = baseExpect.configure({ timeout: 30000 });
test.describe.configure({ timeout: 300000 });

test('loads to the title, starts stage 1 and reaches play', async ({ page }) => {
  /** @type {string[]} */
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'title', { timeout: 120000 });
  await page.locator('#play').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'talk', { timeout: 120000 });
  // Skip the intro dialogue: each press completes, then advances a line.
  await expect(async () => {
    await page.keyboard.press('Enter');
    expect(await page.locator('body').getAttribute('data-screen')).toBe('play');
  }).toPass({ timeout: 150000 });
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'play');
  await expect(page.locator('#hearts .heart')).not.toHaveCount(0);
  expect(errors).toEqual([]);
});

test('options open from the title and remember settings', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'title', { timeout: 120000 });
  await page.locator('#optionsBtn').click();
  await expect(page.locator('#options')).toBeVisible();
  await page.locator('#optContrast').check();
  await expect(page.locator('body')).toHaveClass(/contrast/);
  await page.locator('#optionsClose').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'title');
  await page.reload();
  await expect(page.locator('body')).toHaveClass(/contrast/, { timeout: 120000 });
});

test('the title offers the daily challenge and the trophies', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'title', { timeout: 120000 });
  await expect(page.locator('#dailyBtn')).toContainText('Défi du jour :');
  await page.locator('#trophiesBtn').click();
  await expect(page.locator('#trophyList li')).toHaveCount(16);
  await page.locator('#trophiesClose').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'title');
});

test('menus work with the keyboard alone', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'title', { timeout: 120000 });
  // Play → Défi du jour → Options → Trophées.
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
  await expect(page.locator('#trophiesBtn')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'trophies');
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'title');
});
