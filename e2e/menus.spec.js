import { expect as baseExpect, test } from '@playwright/test';

// SwiftShader WebGL is slow, more so on a busy machine: be generous.
const expect = baseExpect.configure({ timeout: 30000 });
test.describe.configure({ timeout: 300000 });

/** @typedef {import('@playwright/test').Page} Page */

/** @param {Page} page */
async function toTitle(page) {
  await page.goto('./');
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'title', { timeout: 120000 });
}

/** @param {Page} page */
async function toPlay(page) {
  await toTitle(page);
  await page.locator('#play').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'talk', { timeout: 120000 });
  // Clicking the dialogue advances it at once, without waiting for a frame.
  await expect(async () => {
    await page.locator('#talk').dispatchEvent('click');
    expect(await page.locator('body').getAttribute('data-screen')).toBe('play');
  }).toPass({ timeout: 120000 });
}

/** @param {Page} page */
async function openOptions(page) {
  await page.locator('#optionsBtn').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'options');
}

/** @param {Page} page */
const jumpKey = (page) => page.locator('#keyList .keyrow', { hasText: 'Sauter' }).locator('kbd');

test('the intro dialogue advances line by line until play', async ({ page, isMobile }) => {
  await toTitle(page);
  await page.locator('#play').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'talk', { timeout: 120000 });
  await expect(page.locator('#talk')).toBeVisible();
  await expect(page.locator('#talkName')).not.toBeEmpty({ timeout: 15000 });
  await expect(async () => {
    if (isMobile) await page.locator('#talk').dispatchEvent('click');
    else await page.keyboard.press('Enter');
    expect(await page.locator('body').getAttribute('data-screen')).toBe('play');
  }).toPass({ timeout: 150000 });
  await expect(page.locator('#talk')).toBeHidden();
});

test('pause and resume with the HUD button', async ({ page }) => {
  await toPlay(page);
  await page.locator('#pauseBtn').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'pause');
  await expect(page.locator('#pause')).toBeVisible();
  await expect(page.locator('#pauseInfo')).toContainText('tickets');
  await page.locator('#resume').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'play');
  await expect(page.locator('#pause')).toBeHidden();
});

test('pause and resume with Escape', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard only');
  await toPlay(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'pause');
  await expect(page.locator('#resume')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'play');
});

test('pause offers options and the main menu', async ({ page }) => {
  await toPlay(page);
  await page.locator('#pauseBtn').click();
  await page.locator('#pauseOptions').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'options');
  await page.locator('#optionsClose').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'pause');
  await page.locator('#quit').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'title', { timeout: 120000 });
});

test('speed and relaxed mode persist across reload', async ({ page }) => {
  await toTitle(page);
  await openOptions(page);
  await expect(page.locator('#optSpeed')).toHaveValue('1');
  await expect(page.locator('#optAssist')).not.toBeChecked();
  await page.locator('#optSpeed').selectOption('0.8');
  await page.locator('#optAssist').check();
  await page.locator('#optionsClose').click();
  const prefs = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('naorush.prefs') ?? '{}'),
  );
  expect(prefs).toMatchObject({ speed: 0.8, assist: true });
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'title', { timeout: 120000 });
  await openOptions(page);
  await expect(page.locator('#optSpeed')).toHaveValue('0.8');
  await expect(page.locator('#optAssist')).toBeChecked();
});

test('Jump can be rebound, persists, and resets', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard only');
  await toTitle(page);
  await openOptions(page);
  await expect(page.locator('#keyList .keyrow')).toHaveCount(7);
  await expect(jumpKey(page)).toHaveText('Espace');
  await page.locator('#keyList .keyrow', { hasText: 'Sauter' }).click();
  await expect(jumpKey(page)).toHaveText('…');
  await page.keyboard.press('KeyL');
  await expect(jumpKey(page)).toHaveText('L');
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'title', { timeout: 120000 });
  await openOptions(page);
  await expect(jumpKey(page)).toHaveText('L');
  await page.locator('#keysReset').click();
  await expect(jumpKey(page)).toHaveText('Espace');
});

test('Escape cancels a pending rebind', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard only');
  await toTitle(page);
  await openOptions(page);
  await page.locator('#keyList .keyrow', { hasText: 'Sauter' }).click();
  await expect(jumpKey(page)).toHaveText('…');
  await page.keyboard.press('Escape');
  await expect(jumpKey(page)).toHaveText('Espace');
  // The Escape went to the rebind, not to closing the options.
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'options');
  const keys = await page.evaluate(() => localStorage.getItem('naorush.keys') ?? '');
  expect(keys).not.toContain('Escape');
});

test('the cast lists 7 characters', async ({ page }) => {
  await toTitle(page);
  await page.locator('#castBtn').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'cast');
  await expect(page.locator('#castList li')).toHaveCount(7);
  await expect(page.locator('#castList li').first()).toContainText('Kévin');
  await page.locator('#castClose').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'title');
});

test('title keyboard navigation reaches Distribution', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard only');
  await toTitle(page);
  // Jouer → Défi du jour → Options → Trophées → Distribution.
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
  await expect(page.locator('#castBtn')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'cast');
  await expect(page.locator('#castClose')).toBeFocused();
});

test('poster gallery navigates and wraps', async ({ page, isMobile }) => {
  await toTitle(page);
  await page.locator('#castBtn').click();
  await page.locator('#postersBtn').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'posters');
  const caption = page.locator('#posterCaption');
  await expect(caption).toHaveText(/ 1 \/ 32$/);
  await expect(page.locator('#posterImg')).toHaveAttribute('src', /^data:image/);
  await page.locator('#posterNext').click();
  await expect(caption).toHaveText(/ 2 \/ 32$/);
  await page.locator('#posterPrev').click();
  await expect(caption).toHaveText(/ 1 \/ 32$/);
  await page.locator('#posterPrev').click();
  await expect(caption).toHaveText(/ 32 \/ 32$/);
  if (isMobile) {
    await page.locator('#postersClose').click();
    await expect(page.locator('body')).toHaveAttribute('data-screen', 'cast');
    await page.locator('#castClose').click();
    await expect(page.locator('body')).toHaveAttribute('data-screen', 'title');
    return;
  }
  await page.keyboard.press('ArrowRight');
  await expect(caption).toHaveText(/ 1 \/ 32$/);
  await page.keyboard.press('ArrowRight');
  await expect(caption).toHaveText(/ 2 \/ 32$/);
  await page.keyboard.press('ArrowLeft');
  await expect(caption).toHaveText(/ 1 \/ 32$/);
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'cast');
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'title');
});
