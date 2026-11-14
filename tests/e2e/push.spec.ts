import { test, expect, type Page } from '@playwright/test';

async function signIn(page: Page) {
  await page.context().addCookies([
    {
      name: 'gym_session',
      value: process.env.E2E_SESSION_TOKEN!,
      url: process.env.E2E_BASE_URL ?? 'http://localhost:4173',
      httpOnly: true,
      sameSite: 'Strict',
    },
  ]);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
}
test('explains Home Screen installation in iPhone Safari', async ({ page, browserName }) => {
  test.skip(
    browserName !== 'webkit',
    'The iPhone Safari project exercises the installation guidance.',
  );
  await signIn(page);
  await page.goto('/settings');
  await expect(
    page.getByText(
      'On iPhone: open this site in Safari, tap Share → Add to Home Screen, then open GYM WITH JJ from its icon.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Enable Lock Screen alerts', exact: true }),
  ).toBeDisabled();
});
test('synchronizes enabled rest alerts across start, pause, resume, skip and reload', async ({
  page,
}) => {
  const requests: Array<{ delayMs: number | null; revision: number }> = [];
  await page.exposeFunction(
    'recordPushRequest',
    (input: { delayMs: number | null; revision: number }) => {
      requests.push(input);
    },
  );
  await page.addInitScript(() => {
    const fetchOriginal = window.fetch.bind(window);
    window.fetch = async (input, options) => {
      const path = new URL(
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        location.origin,
      ).pathname;
      if (path === '/api/push/subscriptions')
        return new Response(JSON.stringify({ id: '00000000-0000-4000-8000-000000000001' }), {
          headers: { 'Content-Type': 'application/json' },
        });
      if (/^\/api\/push\/subscriptions\/[^/]+\/timer$/.test(path)) {
        const body = JSON.parse(String(options?.body));
        await (
          window as unknown as { recordPushRequest: (input: unknown) => Promise<void> }
        ).recordPushRequest(body);
        return new Response(
          JSON.stringify({ scheduled: body.delayMs !== null, superseded: false }),
          { headers: { 'Content-Type': 'application/json' } },
        );
      }
      return fetchOriginal(input, options);
    };
    const subscription = {
      options: {},
      unsubscribe: async () => true,
      toJSON: () => ({
        endpoint: 'https://web.push.apple.com/test',
        keys: { p256dh: 'test', auth: 'test' },
      }),
    };
    Object.defineProperty(window, 'PushManager', { configurable: true, value: class {} });
    Object.defineProperty(ServiceWorkerRegistration.prototype, 'pushManager', {
      configurable: true,
      get: () => ({
        getSubscription: async () => subscription,
        subscribe: async () => subscription,
      }),
    });
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: class {
        static permission = 'granted';
        static requestPermission = async () => 'granted';
      },
    });
    // Simulate a Home Screen install; Safari's real permission UI needs a phone.
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
  });
  await signIn(page);
  const original = (await (await page.request.get('/api/bootstrap')).json()).settings;
  try {
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Enable Lock Screen alerts', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Test in 10 seconds', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Test in 10 seconds', exact: true }).click();
    await expect
      .poll(() =>
        requests.some(
          (request) =>
            request.delayMs !== null && request.delayMs > 9000 && request.delayMs <= 10000,
        ),
      )
      .toBe(true);
    await page.evaluate(() =>
      localStorage.setItem(
        'jj-timer',
        JSON.stringify({
          endAt: Date.now() + 90000,
          durationMs: 90000,
          remainingMs: 90000,
          exerciseName: 'Chest press',
          done: false,
          kind: 'set',
          nextExerciseId: null,
        }),
      ),
    );
    await page.goto('/session/00000000-0000-4000-8000-000000000002');
    await expect(page.getByText('Lock Screen alert ready', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Pause rest timer', exact: true }).click();
    await expect.poll(() => requests.at(-1)?.delayMs).toBeNull();
    await expect(page.getByText('Lock Screen alert paused', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Resume rest timer', exact: true }).click();
    await expect(page.getByText('Lock Screen alert ready', { exact: true })).toBeVisible();
    await expect.poll(() => requests.at(-1)?.delayMs ?? 0).toBeGreaterThan(80000);
    await page.getByRole('button', { name: 'More timer controls', exact: true }).click();
    await page.getByRole('button', { name: 'Add 0.25 minutes', exact: true }).click();
    await expect.poll(() => requests.at(-1)?.delayMs ?? 0).toBeGreaterThan(95000);
    await page.getByRole('button', { name: 'Skip rest', exact: true }).click();
    await expect.poll(() => requests.at(-1)?.delayMs).toBeNull();
    // Reducing a running rest to zero replaces the old deadline immediately.
    await page.evaluate(() =>
      localStorage.setItem(
        'jj-timer',
        JSON.stringify({
          endAt: Date.now() + 10000,
          durationMs: 10000,
          remainingMs: 10000,
          exerciseName: 'Chest press',
          done: false,
          kind: 'set',
          nextExerciseId: null,
        }),
      ),
    );
    await page.reload();
    await expect(page.getByText('Lock Screen alert ready', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'More timer controls', exact: true }).click();
    await page.getByRole('button', { name: 'Subtract 0.25 minutes', exact: true }).click();
    await expect(
      page.getByRole('alertdialog', { name: 'Rest complete', exact: true }),
    ).toBeVisible();
    await expect.poll(() => requests.at(-1)?.delayMs).toBe(0);
    await page.getByRole('button', { name: 'Dismiss alarm', exact: true }).click();
    await expect.poll(() => requests.at(-1)?.delayMs).toBeNull();
    // Expiry on reopening must not schedule a duplicate background alert.
    const count = requests.length;
    await page.evaluate(() =>
      localStorage.setItem(
        'jj-timer',
        JSON.stringify({
          endAt: Date.now() - 2000,
          durationMs: 1000,
          remainingMs: 1000,
          exerciseName: 'Chest press',
          done: false,
          kind: 'set',
          nextExerciseId: null,
        }),
      ),
    );
    await page.reload();
    await expect(
      page.getByRole('alertdialog', { name: 'Rest complete', exact: true }),
    ).toBeVisible();
    expect(requests).toHaveLength(count);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await page.evaluate(async (settings) => {
      localStorage.removeItem('jj-timer');
      localStorage.removeItem('jj-push-subscription');
      const { csrfToken } = await (await fetch('/api/auth/me')).json();
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify(settings),
      });
    }, original);
  }
});

test('dispatches a background push to the notification channel after the workout page is closed', async ({
  page,
  context,
  browserName,
  baseURL,
}) => {
  test.skip(
    browserName !== 'chromium',
    'CDP push injection is Chromium-only; physical iPhone validation is separate.',
  );
  await context.grantPermissions(['notifications'], { origin: baseURL });
  await signIn(page);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  const worker = context.serviceWorkers()[0]!;
  await worker.evaluate(() => {
    const global = self as unknown as {
      pushResult?: unknown;
      registration: ServiceWorkerRegistration;
    };
    // Headless browser permissions cannot verify the physical OS channel.
    // Capture that boundary while exercising real service-worker push dispatch.
    global.registration.showNotification = async (title, options) => {
      global.pushResult = { title, body: options?.body, silent: options?.silent };
    };
  });
  const observer = await context.newPage();
  await observer.goto('/api/health');
  const cdp = await context.newCDPSession(observer);
  let registrationId = '';
  cdp.on('ServiceWorker.workerRegistrationUpdated', ({ registrations }) => {
    registrationId =
      registrations.find(
        (registration: { scopeURL: string; isDeleted: boolean }) =>
          registration.scopeURL === `${baseURL}/` && !registration.isDeleted,
      )?.registrationId ?? registrationId;
  });
  await cdp.send('ServiceWorker.enable');
  await expect.poll(() => registrationId).not.toBe('');
  await page.close();
  await cdp.send('ServiceWorker.deliverPushMessage', {
    origin: baseURL,
    registrationId,
    data: JSON.stringify({
      web_push: 8030,
      notification: {
        title: 'Rest complete',
        body: 'Next set: Chest press',
        silent: false,
        data: { url: '/' },
      },
    }),
  });
  await expect
    .poll(() => worker.evaluate(() => (self as unknown as { pushResult?: unknown }).pushResult))
    .toEqual({ title: 'Rest complete', body: 'Next set: Chest press', silent: false });
});
