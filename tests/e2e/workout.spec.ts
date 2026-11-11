import { test, expect, type Page, type BrowserContext } from '@playwright/test';
let sessionCookies: Awaited<ReturnType<BrowserContext['cookies']>> = [];
async function freezeClock(page: Page) {
  const now = Date.now();
  await page.clock.install({ time: now });
  await page.clock.pauseAt(now + 1000);
}
async function signIn(page: Page) {
  if (sessionCookies.length) await page.context().addCookies(sessionCookies);
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
  if (await page.getByLabel('Email address').isVisible()) {
    await page.getByLabel('Email address').fill('e2e@example.test');
    await page.getByLabel('Password', { exact: true }).fill(process.env.E2E_PASSWORD!);
    await page.getByRole('button', { name: 'Sign in' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  sessionCookies = await page.context().cookies();
}
async function confirm(page: Page) {
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
}
test('owner creates a split, logs a set, uses timer and finishes into history', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await signIn(page);
  await page.screenshot({
    path: `docs/screenshots/${testInfo.project.name}-home.png`,
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.goto('/workouts');
  await page.getByRole('button', { name: 'New split', exact: true }).click();
  await page.getByLabel('Split name').fill(`E2E ${testInfo.project.name}`);
  await page.getByRole('button', { name: 'Create split', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Edit split' })).toBeVisible();
  await page.getByLabel('Day 1 name').fill('Push focus');
  await page.getByRole('button', { name: 'Add training day', exact: true }).click();
  await page.getByLabel('Day 2 name').fill('Recovery');
  await page.getByLabel('Rest day', { exact: true }).nth(1).check();
  await page.getByRole('button', { name: 'Add exercise', exact: true }).first().click();
  await page.getByRole('dialog').getByLabel('Search exercises').fill('Incline Dumbbell Press');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /Incline Dumbbell Press/ })
    .click();
  await page.getByText('Incline Dumbbell Press', { exact: true }).click();
  await page.getByLabel('Working sets', { exact: true }).fill('1');
  await page.getByLabel('Rest (minutes)', { exact: true }).fill('0.5');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
  await page.goto('/');
  await page.getByRole('button', { name: 'Start new workout', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Workout split', exact: true })
    .selectOption({ label: `E2E ${testInfo.project.name}` });
  await page.getByRole('button', { name: /Push focus/ }).click();
  await page.getByRole('button', { name: 'Start workout', exact: true }).click();
  await page.getByRole('button', { name: 'Add set', exact: true }).click();
  const editSets = page.getByRole('button', {
    name: 'Edit sets for Incline Dumbbell Press',
    exact: true,
  });
  if (await editSets.isVisible()) await editSets.click();
  await page
    .getByRole('button', { name: 'Remove Incline Dumbbell Press set 2', exact: true })
    .click();
  await expect(page.getByRole('dialog', { name: 'Remove this set?' })).toBeVisible();
  await confirm(page);
  await expect(page.getByLabel('Incline Dumbbell Press set 2 reps', { exact: true })).toHaveCount(
    0,
  );
  const doneEditing = page.getByRole('button', {
    name: 'Done editing Incline Dumbbell Press',
    exact: true,
  });
  if (await doneEditing.isVisible()) await doneEditing.click();
  if (testInfo.project.name.startsWith('mobile')) {
    for (const width of [360, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const inputBounds = await page
        .getByLabel('Incline Dumbbell Press set 1 weight', { exact: true })
        .boundingBox();
      expect(inputBounds!.width).toBeGreaterThanOrEqual(60);
      expect(inputBounds!.height).toBeGreaterThanOrEqual(48);
    }
    await page.setViewportSize({ width: 390, height: 844 });
  }
  const weightInput = page.getByLabel('Incline Dumbbell Press set 1 weight', { exact: true });
  await weightInput.fill('');
  await weightInput.pressSequentially('20', { delay: 20 });
  const repsInput = page.getByLabel('Incline Dumbbell Press set 1 reps', { exact: true });
  await repsInput.fill('');
  await repsInput.pressSequentially('10', { delay: 20 });
  const notesInput = page.getByRole('textbox', { name: /Workout notes/ });
  await notesInput.pressSequentially('Felt strong today.', { delay: 10 });
  await freezeClock(page);
  await page
    .getByRole('button', { name: 'Complete Incline Dumbbell Press set 1', exact: true })
    .click();
  await expect(page.getByRole('timer')).toHaveText('00:30');
  const compactTimer = await page.getByRole('complementary', { name: 'Rest timer' }).boundingBox();
  expect(compactTimer!.height).toBeLessThanOrEqual(90);
  await page.getByRole('button', { name: 'More timer controls', exact: true }).click();
  await page.getByRole('button', { name: 'Add 0.25 minutes', exact: true }).click();
  await expect(page.getByRole('timer')).toHaveText('00:45');
  await page.getByRole('button', { name: 'Subtract 0.25 minutes', exact: true }).click();
  await expect(page.getByRole('timer')).toHaveText('00:30');
  await expect(page.getByRole('combobox', { name: 'Change rest duration' })).toHaveValue('0.5');
  await page.screenshot({
    path: `docs/screenshots/${testInfo.project.name}-timer-expanded.png`,
    fullPage: false,
  });
  await page.getByRole('button', { name: 'Hide timer controls', exact: true }).click();
  await page.clock.fastForward('00:05');
  await expect(page.getByRole('timer')).toHaveText('00:25');
  await page.getByRole('button', { name: 'Pause rest timer', exact: true }).click();
  await page.clock.fastForward('00:10');
  await expect(page.getByRole('timer')).toHaveText('00:25');
  await page.getByRole('button', { name: 'Resume rest timer', exact: true }).click();
  await page.clock.fastForward('00:26');
  await expect(page.getByText('Rest complete', { exact: true })).toBeVisible();
  await page
    .getByRole('alertdialog', { name: 'Rest complete' })
    .getByRole('button', { name: 'Dismiss alarm', exact: true })
    .click();
  await page.clock.resume();
  await expect(
    page.getByRole('button', { name: 'Undo Incline Dumbbell Press set 1', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('progressbar', { name: 'Workout completion' })).toHaveAttribute(
    'aria-valuenow',
    '100',
  );
  await page.screenshot({
    path: `docs/screenshots/${testInfo.project.name}-workout.png`,
    fullPage: true,
  });
  await page
    .locator('.live-exercise')
    .first()
    .evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await page.screenshot({
    path: `docs/screenshots/${testInfo.project.name}-workout-focused.png`,
    fullPage: false,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Finish workout', exact: true }).click();
  await confirm(page);
  await expect(page.getByRole('heading', { name: 'Workout completed' })).toBeVisible();
  await expect(page.getByText('20 kg × 10', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Workout notes', exact: true })).toHaveValue(
    'Felt strong today.',
  );
  await expect(page.getByText('Synced', { exact: true })).toHaveCount(0);
  await expect(page.locator('.app-layout')).toHaveAttribute('data-sync-state', 'synced');
  await page.goto('/history');
  await expect(
    page.getByRole('link', { name: new RegExp(`E2E ${testInfo.project.name}`) }),
  ).toBeVisible();
  await page.goto('/progress');
  await expect(page.getByRole('heading', { name: 'Weight progression' })).toBeVisible();
  await expect(page.getByRole('img', { name: /load:/ })).toBeVisible();
  expect(errors).toEqual([]);
});
test('restores an offline workout after reload and synchronizes it on reconnect', async ({
  page,
  context,
}) => {
  await signIn(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await page.getByRole('button', { name: 'Start new workout', exact: true }).click();
  await page.getByRole('button', { name: /^01 Upper A/ }).click();
  await page.getByRole('button', { name: 'Start workout', exact: true }).click();
  await page.getByLabel('Incline Dumbbell Press set 1 weight', { exact: true }).fill('17.5');
  await page.getByLabel('Incline Dumbbell Press set 1 reps', { exact: true }).fill('12');
  await expect(page.locator('.app-layout')).toHaveAttribute('data-sync-state', 'synced');
  const url = page.url();
  await context.setOffline(true);
  await page
    .getByRole('button', { name: 'Complete Incline Dumbbell Press set 1', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Undo Incline Dumbbell Press set 1', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.getByLabel('Incline Dumbbell Press set 1 weight', { exact: true })).toHaveValue(
    '17.5',
  );
  await expect(page.getByLabel('Incline Dumbbell Press set 1 reps', { exact: true })).toHaveValue(
    '12',
  );
  await expect(
    page.getByRole('button', { name: 'Undo Incline Dumbbell Press set 1', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(page.url()).toBe(url);
  await expect(page.locator('.app-layout')).toHaveAttribute('data-sync-state', 'offline');
  await context.setOffline(false);
  await expect(page.locator('.app-layout')).toHaveAttribute('data-sync-state', 'synced');
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Finish your workout?' })).toBeVisible();
  if ((page.viewportSize()?.width ?? 0) < 700) {
    const sheet = await page.getByRole('dialog', { name: 'Finish your workout?' }).boundingBox();
    expect(Math.round(sheet!.y + sheet!.height)).toBe(page.viewportSize()!.height);
    const confirmButton = await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Confirm', exact: true })
      .boundingBox();
    expect(confirmButton!.height).toBeGreaterThanOrEqual(48);
    await page.screenshot({
      path: 'docs/screenshots/mobile-chromium-finish-sheet.png',
      fullPage: false,
    });
  }
  await confirm(page);
  await expect(page.getByText('17.5 kg × 12', { exact: true })).toBeVisible();
  await expect(page.locator('.app-layout')).toHaveAttribute('data-sync-state', 'synced');
});
test('custom exercise secondary muscles and confirmed archive work', async ({ page }, testInfo) => {
  await signIn(page);
  await page.goto('/workouts/library');
  await page.getByRole('button', { name: 'Custom exercise', exact: true }).click();
  await page
    .getByLabel('Exercise name', { exact: true })
    .fill(`Custom movement ${testInfo.project.name}`);
  await page
    .getByLabel('Secondary muscles (comma-separated)', { exact: true })
    .pressSequentially('Triceps, Shoulders');
  await page.getByRole('button', { name: 'Save exercise', exact: true }).click();
  await page.getByLabel('Search exercise library').fill(`Custom movement ${testInfo.project.name}`);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Secondary muscles (comma-separated)', { exact: true })).toHaveValue(
    'Triceps, Shoulders',
  );
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Archive this exercise?' })).toBeVisible();
  await confirm(page);
  await expect(
    page.getByRole('heading', { name: `Custom movement ${testInfo.project.name}` }),
  ).toHaveCount(0);
});

test('syncs an offline finish before a later active workout regardless of UUID order', async ({
  page,
  context,
}) => {
  await signIn(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start new workout', exact: true }).click();
  await page.getByRole('button', { name: /^01 Upper A/ }).click();
  await page.getByRole('button', { name: 'Start workout', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Upper A', exact: true, level: 1 })).toBeVisible();
  await expect(page.locator('.app-layout')).toHaveAttribute('data-sync-state', 'synced');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Finish workout', exact: true }).click();
  await confirm(page);
  await expect(page.getByRole('heading', { name: 'Workout completed' })).toBeVisible();
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await page.evaluate(() => {
    let sequence = 0;
    const group = innerWidth < 700 ? '0000' : '0001';
    Object.defineProperty(crypto, 'randomUUID', {
      configurable: true,
      value: () => `00000000-${group}-4000-8000-${String(++sequence).padStart(12, '0')}`,
    });
  });
  await page.getByRole('button', { name: 'Start new workout', exact: true }).click();
  await page.getByRole('button', { name: /^02 Lower A/ }).click();
  await page.getByRole('button', { name: 'Start workout', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Lower A + Shoulders', exact: true, level: 1 }),
  ).toBeVisible();
  await context.setOffline(false);
  await expect(page.locator('.app-layout')).toHaveAttribute('data-sync-state', 'synced');
  await expect(page.locator('.app-layout')).not.toHaveAttribute('data-sync-state', 'conflict');
  await page.getByRole('button', { name: 'Finish workout', exact: true }).click();
  await confirm(page);
  await expect(page.getByRole('heading', { name: 'Workout completed' })).toBeVisible();
  await expect(page.locator('.app-layout')).toHaveAttribute('data-sync-state', 'synced');
});

test('mobile routes remain within a 360px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await signIn(page);
  for (const path of [
    '/',
    '/workouts',
    '/workouts/library',
    '/history',
    '/progress',
    '/settings',
  ]) {
    await page.goto(path);
    await expect(page.locator('h1')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `Overflow on ${path}`,
    ).toBe(true);
  }
});

test('header controls and muscle-specific rest between exercises', async ({ page }, testInfo) => {
  await signIn(page);
  const original = (await (await page.request.get('/api/bootstrap')).json()).settings;
  await expect(
    page.locator('.topbar').getByText('All changes synced', { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText('Show up.', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Switch to light mode', exact: true }),
  ).toBeEnabled();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({
    path: `docs/screenshots/${testInfo.project.name}-home-dark.png`,
    fullPage: true,
  });
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByText('SET UP FOR YOU', { exact: true })).toHaveCount(0);
  await page.getByLabel('Use custom rest for Chest', { exact: true }).check();
  await page.getByLabel('Chest set rest minutes', { exact: true }).fill('0.75');
  await page.getByLabel('Chest exercise rest minutes', { exact: true }).fill('1.25');
  await page.getByLabel('Use custom rest for Back', { exact: true }).check();
  await page.getByLabel('Back set rest minutes', { exact: true }).fill('1.5');
  await page.getByLabel('Back exercise rest minutes', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Switch to dark mode', exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel('Chest exercise rest minutes', { exact: true })).toHaveValue('1.25');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Refresh data', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Refresh data', exact: true })).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(page.getByLabel('Back exercise rest minutes', { exact: true })).toHaveValue('2');
  await page.screenshot({
    path: `docs/screenshots/${testInfo.project.name}-settings-clean.png`,
    fullPage: true,
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Start new workout', exact: true }).click();
  await page.getByRole('button', { name: /^01 Upper A/ }).click();
  await page.getByRole('button', { name: 'Start workout', exact: true }).click();
  await expect(
    page.getByLabel('Rest minutes for Incline Dumbbell Press', { exact: true }),
  ).toHaveValue('0.75');
  await expect(
    page.getByLabel('Exercise rest minutes for Incline Dumbbell Press', { exact: true }),
  ).toHaveValue('1.25');
  await freezeClock(page);
  await page
    .getByRole('button', { name: 'Complete Incline Dumbbell Press set 1', exact: true })
    .click();
  await expect(page.locator('[data-timer-kind]')).toHaveAttribute('data-timer-kind', 'set');
  await expect(page.getByRole('timer')).toHaveText('00:45');
  await page
    .getByRole('button', { name: 'Complete Incline Dumbbell Press set 2', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Complete Incline Dumbbell Press set 3', exact: true })
    .click();
  await expect(page.locator('[data-timer-kind]')).toHaveAttribute('data-timer-kind', 'exercise');
  await expect(page.getByRole('timer')).toHaveText('01:15');
  await page.getByRole('button', { name: 'More timer controls', exact: true }).click();
  await page.getByRole('combobox', { name: 'Change rest duration' }).selectOption('1.5');
  await expect(page.locator('[data-timer-kind]')).toHaveAttribute('data-timer-kind', 'exercise');
  await expect(page.getByRole('timer')).toHaveText('01:30');
  await page.getByRole('button', { name: 'Hide timer controls', exact: true }).click();
  await expect(page.getByText('Before next exercise', { exact: true }).last()).toBeVisible();
  await page.getByRole('button', { name: 'Refresh data', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Refresh data', exact: true })).toHaveAttribute(
    'aria-busy',
    'false',
  );
  await expect(
    page.getByRole('button', { name: 'Undo Incline Dumbbell Press set 3', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await page.clock.fastForward('01:31');
  await page.getByRole('button', { name: 'Next exercise', exact: true }).click();
  await expect(page).toHaveURL(/#exercise-/);
  await expect(page.getByLabel('Rest minutes for Pull-ups', { exact: true })).toHaveValue('1.5');
  await expect(page.getByLabel('Exercise rest minutes for Pull-ups', { exact: true })).toHaveValue(
    '2',
  );
  await page.screenshot({
    path: `docs/screenshots/${testInfo.project.name}-exercise-transition.png`,
    fullPage: false,
  });
  await page.clock.resume();
  await page.getByRole('button', { name: 'End session', exact: true }).click();
  await confirm(page);
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await expect(page.locator('.app-layout')).toHaveAttribute('data-sync-state', 'synced');
  await page.evaluate(async (settings) => {
    const { csrfToken } = await (await fetch('/api/auth/me')).json();
    const response = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify(settings),
    });
    if (!response.ok) throw new Error('Cannot restore test preferences');
  }, original);
});
