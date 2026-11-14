import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { validPushEndpoint } from '../apps/api/src/push';

function worker() {
  const handlers: Record<string, (event: unknown) => void> = {};
  const showNotification = vi.fn(async () => {});
  const focus = vi.fn(async () => {});
  const navigate = vi.fn(async () => {});
  const openWindow = vi.fn(async () => {});
  runInNewContext(readFileSync('apps/web/public/push-events.js', 'utf8'), {
    URL,
    self: {
      location: { origin: 'https://gym.example' },
      addEventListener: (name: string, handler: (event: unknown) => void) => {
        handlers[name] = handler;
      },
      registration: { showNotification },
      clients: {
        matchAll: async () => [{ url: 'https://gym.example/', navigate, focus }],
        openWindow,
      },
    },
  });
  return { handlers, showNotification, focus, navigate, openWindow };
}
describe('background push delivery boundaries', () => {
  it('only accepts HTTPS browser-vendor gateways, preventing subscription SSRF', () => {
    for (const url of [
      'https://web.push.apple.com/a',
      'https://fcm.googleapis.com/fcm/send/a',
      'https://updates.push.services.mozilla.com/wpush/a',
    ])
      expect(validPushEndpoint(url)).toBe(true);
    for (const url of [
      'http://web.push.apple.com/a',
      'https://127.0.0.1/a',
      'https://web.push.apple.com.evil.test/a',
      'https://web.push.apple.com:8443/a',
      'https://user:pass@web.push.apple.com/a',
      'https://localhost/a',
    ])
      expect(validPushEndpoint(url)).toBe(false);
  });
  it('shows an audible-system notification entirely inside the worker', async () => {
    const state = worker();
    let pending: Promise<void> | undefined;
    state.handlers.push!({
      data: {
        json: () => ({
          web_push: 8030,
          notification: {
            title: 'Rest complete',
            body: 'Next set: Chest press',
            silent: false,
            data: { url: '/' },
          },
        }),
      },
      waitUntil: (promise: Promise<void>) => {
        pending = promise;
      },
    });
    await pending;
    expect(state.showNotification).toHaveBeenCalledWith(
      'Rest complete',
      expect.objectContaining({
        body: 'Next set: Chest press',
        silent: false,
        tag: 'jj-rest-complete',
      }),
    );
  });
  it('keeps notification clicks inside the app and focuses the workout window', async () => {
    const state = worker();
    let pending: Promise<void> | undefined;
    const close = vi.fn();
    state.handlers.notificationclick!({
      notification: { close, data: { url: 'https://evil.example' } },
      waitUntil: (promise: Promise<void>) => {
        pending = promise;
      },
    });
    await pending;
    expect(close).toHaveBeenCalled();
    expect(state.navigate).toHaveBeenCalledWith('https://gym.example/');
    expect(state.focus).toHaveBeenCalled();
    expect(state.openWindow).not.toHaveBeenCalled();
  });
});
