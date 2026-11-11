import { test, expect } from '@playwright/test';

test('treadmill finisher can be completed, undone and saved into history', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.getByLabel('Email address').fill('e2e@example.test');
  await page.getByLabel('Password', { exact: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start new workout', exact: true }).click();
  await page.getByRole('button', { name: /^01 Upper A/ }).click();
  await page.getByRole('button', { name: 'Start workout', exact: true }).click();
  const complete = page.getByRole('checkbox', { name: 'Finisher complete', exact: true });
  await complete.click();
  await expect(complete).toBeChecked();
  await expect(page.locator('.app-layout')).toHaveAttribute('data-sync-state', 'synced');
  await page.reload();
  await expect(complete).toBeChecked();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start new workout', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Resume workout', exact: true }).click();
  await expect(complete).toBeChecked();
  const bootstrap = await (await page.request.get('/api/bootstrap')).json();
  const session = bootstrap.sessions.find(
    (session: { status: string }) => session.status === 'active',
  );
  expect(session.cardio[0].completed).toBe(true);
  await complete.click();
  await expect(complete).not.toBeChecked();
  await expect(page.locator('.app-layout')).toHaveAttribute('data-sync-state', 'synced');
  await page.reload();
  await expect(complete).not.toBeChecked();
  await complete.click();
  await expect(complete).toBeChecked();
  await page.getByRole('button', { name: 'Pause session', exact: true }).click();
  await expect(complete).toBeDisabled();
  await page.getByRole('button', { name: 'Resume session', exact: true }).click();
  await expect(complete).toBeEnabled();
  await complete.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `docs/screenshots/${testInfo.project.name}-treadmill-complete.png`,
  });
  await page.getByRole('button', { name: 'Finish workout', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Workout completed', exact: true })).toBeVisible();
  await expect(page.locator('.app-layout')).toHaveAttribute('data-sync-state', 'synced');
  await expect(
    page.locator('.detail-cardio').getByText('Completed', { exact: true }),
  ).toBeVisible();
  await page.goto('/');
  await page.getByRole('link', { name: 'View Upper A workout', exact: true }).click();
  await expect(page).toHaveURL(/\/history\//);
  await expect(
    page.locator('.detail-cardio').getByText('Completed', { exact: true }),
  ).toBeVisible();
});
