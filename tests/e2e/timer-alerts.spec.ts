import { test, expect } from '@playwright/test';

test('plays timer audio, recovers after reload and reports browser capabilities', async ({
  page,
  browserName,
}, testInfo) => {
  await page.addInitScript(() => {
    const stats = {
      played: 0,
      audible: 0,
      failed: 0,
      duration: 0,
      vibration: 0,
      blockSound: false,
      active: false,
      loop: false,
    };
    const observed = new WeakSet<HTMLMediaElement>();
    Object.assign(window, { alarmStats: stats });
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (!this.src.endsWith('/rest-alarm-v2.wav')) return play.call(this);
      if (!observed.has(this)) {
        observed.add(this);
        this.addEventListener('pause', () => {
          stats.active = false;
        });
        this.addEventListener('timeupdate', () => {
          if (!this.paused && !this.muted && this.currentTime > 0.2) stats.audible++;
        });
      }
      if (stats.blockSound) {
        stats.failed++;
        return Promise.reject(new DOMException('Blocked for test', 'NotAllowedError'));
      }
      // Real browser decoding/playback. Count successful native play promises.
      return play.call(this).then(() => {
        stats.played++;
        stats.duration = this.duration;
        stats.active = !this.paused;
        stats.loop = this.loop;
      });
    };
    if (typeof navigator.vibrate === 'function') {
      Object.defineProperty(navigator, 'vibrate', {
        value: () => {
          stats.vibration++;
          return true;
        },
        configurable: true,
      });
    }
  });
  const stats = () =>
    page.evaluate(
      () =>
        (
          window as unknown as {
            alarmStats: {
              played: number;
              audible: number;
              failed: number;
              duration: number;
              vibration: number;
              active: boolean;
              loop: boolean;
            };
          }
        ).alarmStats,
    );
  await page.goto('/');
  await page.getByLabel('Email address').fill('e2e@example.test');
  await page.getByLabel('Password', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  const original = (await (await page.request.get('/api/bootstrap')).json()).settings;
  await page.evaluate(async (settings) => {
    const { csrfToken } = await (await fetch('/api/auth/me')).json();
    const response = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ ...settings, sound: true, vibration: true }),
    });
    if (!response.ok) throw new Error('Cannot configure test alerts');
  }, original);
  await page.goto('/settings');
  if (browserName === 'webkit') {
    await expect(page.getByRole('switch', { name: 'Vibration', exact: true })).toBeDisabled();
    await expect(page.getByRole('switch', { name: 'Vibration', exact: true })).not.toBeChecked();
    await expect(page.getByText('Unavailable in this browser. Use sound alerts.')).toBeVisible();
  }
  await page.getByRole('button', { name: 'Test sound', exact: true }).click();
  await expect.poll(async () => (await stats()).played).toBeGreaterThan(0);
  await expect.poll(async () => (await stats()).audible).toBeGreaterThan(0);
  expect((await stats()).duration).toBeCloseTo(2.8, 1);
  expect((await stats()).loop).toBe(false);
  await page.getByRole('link', { name: 'Home', exact: true }).last().click();
  await page.getByRole('button', { name: 'Start new workout', exact: true }).click();
  await page.getByRole('button', { name: /^01 Upper A/ }).click();
  await page.getByRole('button', { name: 'Start workout', exact: true }).click();
  const rest = page.getByLabel('Rest minutes for Incline Dumbbell Press', { exact: true });
  await rest.fill('0.05');
  const playedBefore = (await stats()).played;
  const audibleBefore = (await stats()).audible;
  await page
    .getByRole('button', { name: 'Start rest for Incline Dumbbell Press', exact: true })
    .click();
  await expect(page.getByText('Rest complete', { exact: true })).toBeVisible();
  await expect.poll(async () => (await stats()).played).toBeGreaterThan(playedBefore);
  await expect.poll(async () => (await stats()).audible).toBeGreaterThan(audibleBefore);
  const alarm = page.getByRole('alertdialog', { name: 'Rest complete' });
  await expect(alarm).toBeVisible();
  expect((await stats()).loop).toBe(true);
  await page.screenshot({ path: `docs/screenshots/${testInfo.project.name}-timer-popup.png` });
  const otherTab = await page.context().newPage();
  await otherTab.goto('/');
  await otherTab
    .getByRole('alertdialog', { name: 'Rest complete' })
    .getByRole('button', { name: 'Dismiss alarm', exact: true })
    .click();
  await expect(alarm).toHaveCount(0);
  await expect.poll(async () => (await stats()).active).toBe(false);
  await otherTab.close();
  if (browserName !== 'webkit') expect((await stats()).vibration).toBeGreaterThan(0);

  // Reload during a running break. A new document must reacquire sound permission.
  await rest.fill('0.1');
  await page
    .getByRole('button', { name: 'Start rest for Incline Dumbbell Press', exact: true })
    .click();
  await expect(page.getByRole('timer')).not.toHaveText('✓');
  await page.reload();
  await page.getByRole('button', { name: 'Enable timer sound', exact: true }).click();
  await expect.poll(async () => (await stats()).played).toBeGreaterThan(0);
  const reloadedPlays = (await stats()).played;
  await expect(page.getByText('Rest complete', { exact: true })).toBeVisible();
  await expect.poll(async () => (await stats()).played).toBeGreaterThan(reloadedPlays);
  await alarm.getByRole('button', { name: 'Dismiss alarm', exact: true }).click();

  // A rejected play must show an actionable retry, not silently skip the alarm.
  await page.evaluate(() => {
    (window as unknown as { alarmStats: { blockSound: boolean } }).alarmStats.blockSound = true;
  });
  await page.getByLabel('Rest minutes for Incline Dumbbell Press', { exact: true }).fill('0.05');
  await page
    .getByRole('button', { name: 'Start rest for Incline Dumbbell Press', exact: true })
    .click();
  await expect(page.getByRole('button', { name: 'Play sound', exact: true })).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { alarmStats: { blockSound: boolean } }).alarmStats.blockSound = false;
  });
  const beforeRetry = (await stats()).played;
  await page.getByRole('button', { name: 'Play sound', exact: true }).click();
  await expect.poll(async () => (await stats()).played).toBeGreaterThan(beforeRetry);
  await expect(page.getByRole('button', { name: 'Play sound', exact: true })).toHaveCount(0);
  await page.screenshot({ path: `docs/screenshots/${testInfo.project.name}-timer-alert.png` });
  await alarm.getByRole('button', { name: 'Dismiss alarm', exact: true }).click();
  await expect.poll(async () => (await stats()).active).toBe(false);

  // Visual alarms also work with both alert channels muted, across routes and reloads.
  const sessionUrl = page.url();
  await page.evaluate(async (settings) => {
    const { csrfToken } = await (await fetch('/api/auth/me')).json();
    const response = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ ...settings, sound: false, vibration: false }),
    });
    if (!response.ok) throw new Error('Cannot mute test alerts');
  }, original);
  await page.goto('/settings');
  await expect(
    page.getByRole('switch', { name: 'Rest timer sound', exact: true }),
  ).not.toBeChecked();
  await page.goto(sessionUrl);
  await page.getByLabel('Rest minutes for Incline Dumbbell Press', { exact: true }).fill('0.05');
  await page
    .getByRole('button', { name: 'Start rest for Incline Dumbbell Press', exact: true })
    .click();
  await page.getByRole('link', { name: 'Home', exact: true }).last().click();
  await expect(alarm).toBeVisible();
  expect((await stats()).played).toBe(0);
  await page.reload();
  await expect(alarm).toBeVisible();
  await alarm.getByRole('button', { name: 'Dismiss alarm', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await expect(alarm).toHaveCount(0);
  await page.goto(sessionUrl);
  await page.getByRole('button', { name: 'End session', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
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
