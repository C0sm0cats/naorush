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
  await expect(page.locator('#pauseInfo')).toContainText('ticket');
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

test('after clicking mute, Space stays a game key', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard only');
  await toPlay(page);
  await page.locator('#muteBtn').click();
  await expect(page.locator('#muteBtn')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#muteBtn')).not.toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.locator('#muteBtn')).toHaveAttribute('aria-pressed', 'true');
});

test('options open focused, and up/down move past a list without changing it', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'keyboard only');
  await toTitle(page);
  await openOptions(page);
  await expect(page.locator('#volMusic')).toBeFocused();
  const speed = page.locator('#optSpeed');
  const before = await speed.inputValue();
  await speed.focus();
  await page.keyboard.press('ArrowDown');
  await expect(speed).not.toBeFocused();
  expect(await speed.inputValue()).toBe(before);
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'title');
});

test('the hero cards behave as a radio group', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard only');
  await toTitle(page);
  const kevin = page.locator('.hero-card[data-hero="kevin"]');
  const charline = page.locator('.hero-card[data-hero="charline"]');
  await expect(charline).toHaveAttribute('tabindex', '-1');
  await kevin.focus();
  await page.keyboard.press('ArrowRight');
  await expect(charline).toHaveAttribute('aria-checked', 'true');
  await expect(charline).toBeFocused();
  await expect(kevin).toHaveAttribute('tabindex', '-1');
  await page.keyboard.press('ArrowLeft');
  await expect(kevin).toHaveAttribute('aria-checked', 'true');
});

test('landscape phones keep every close button on screen', async ({ page }) => {
  await page.setViewportSize({ width: 863, height: 360 });
  await toTitle(page);
  /** @param {string} id */
  const inView = async (id) => {
    const box = await page.locator(id).boundingBox();
    expect(box && box.y >= 0 && box.y + box.height <= 360).toBe(true);
  };
  await openOptions(page);
  await inView('#optionsClose');
  await page.locator('#optionsClose').click();
  await page.locator('#trophiesBtn').click();
  await expect(page.locator('#trophiesClose')).toBeFocused();
  await inView('#trophiesClose');
  await page.locator('#trophiesClose').click();
  await page.locator('#castBtn').click();
  await page.locator('#postersBtn').click();
  await expect(page.locator('#posterImg')).toHaveAttribute('src', /^data:image/);
  for (const id of ['#posterPrev', '#postersClose', '#posterNext']) await inView(id);
});

test('Chapitres lists the cleared stages and plays one in « Sans filet » after the credits', async ({
  page,
}) => {
  // A finished game: the envelope is signed, Kévin has a gold on the parking.
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('naorush.stage', '0');
    localStorage.setItem('naorush.best', JSON.stringify({ 'parking:kevin': 21.3 }));
    localStorage.setItem(
      'naorush.medals',
      JSON.stringify({ 'parking:kevin': { tier: 'gold', star: true } }),
    );
    localStorage.setItem('naorush.trophies', JSON.stringify({ got: { nao: true } }));
  });
  await toTitle(page);
  await page.locator('#chaptersBtn').click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'chapters');
  await expect(page.locator('#chapterList > li')).toHaveCount(8);
  await expect(page.locator('#chapterList .chapter-hero')).toHaveCount(16);
  await expect(page.locator('#chapterList .chapter-hero.kevin').first()).toHaveAttribute(
    'aria-label',
    /Médaille : Or, sans retour au badge/,
  );
  await page.locator('#chapterModes [data-mode="sansFilet"]').click();
  await expect(page.locator('#chapterModes [data-mode="sansFilet"]')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.locator('#chapterList .chapter-hero.charline').first().click();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'talk', { timeout: 120000 });
  await expect(page.locator('#stageNum')).toHaveText('Étape 1 sur 5 · Sans filet');
  await expect(page.locator('.hero-card[data-hero="charline"]')).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test('Chapitres stays hidden on a fresh save and opens once a stage is cleared', async ({
  page,
}) => {
  await toTitle(page);
  await expect(page.locator('#chaptersBtn')).toBeHidden();
  await page.evaluate(() => localStorage.setItem('naorush.stage', '2'));
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'title', { timeout: 120000 });
  await page.locator('#chaptersBtn').click();
  await expect(page.locator('#chapterList > li:not(.locked)')).toHaveCount(2);
  await expect(page.locator('#chapterModes')).toContainText('après le générique');
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).toHaveAttribute('data-screen', 'title');
});
