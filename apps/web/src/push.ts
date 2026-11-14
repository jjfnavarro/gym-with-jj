import { api } from './lib';
import type { TimerState } from '@gym/shared';

const storageKey = 'jj-push-subscription';
export const pushChangeEvent = 'jj-push-change';
export function pushSupport() {
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone =
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (ios && !standalone) return 'install';
  return window.isSecureContext &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
    ? 'supported'
    : 'unsupported';
}
export const pushSubscriptionId = () => localStorage.getItem(storageKey);
function changed() {
  window.dispatchEvent(new Event(pushChangeEvent));
}
async function registration() {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Update the app, then try enabling alerts again.')),
          15000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}
export async function pushEnrolled() {
  if (
    pushSupport() !== 'supported' ||
    Notification.permission !== 'granted' ||
    !pushSubscriptionId()
  )
    return false;
  return Boolean(await (await registration()).pushManager.getSubscription());
}
export async function enableRestPush() {
  const support = pushSupport();
  if (support === 'install')
    throw new Error(
      'In Safari, use Share → Add to Home Screen, then open the app from its icon to enable alerts.',
    );
  if (support !== 'supported')
    throw new Error(
      'Lock Screen alerts need the installed app on HTTPS and a browser that supports push.',
    );
  // Request immediately in the tap handler, before network or worker awaits.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted')
    throw new Error(
      'Allow notifications for GYM WITH JJ in your iPhone or browser Settings, then try again.',
    );
  const { publicKey } = await api<{ publicKey: string }>('/push/config');
  const worker = await registration();
  let subscription = await worker.pushManager.getSubscription();
  const bytes = Uint8Array.from(
    atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')),
    (character) => character.charCodeAt(0),
  );
  if (
    subscription?.options.applicationServerKey &&
    new Uint8Array(subscription.options.applicationServerKey).toString() !== bytes.toString()
  ) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await worker.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: bytes,
  });
  const saved = await api<{ id: string }>('/push/subscriptions', {
    method: 'POST',
    body: JSON.stringify(subscription.toJSON()),
  });
  localStorage.setItem(storageKey, saved.id);
  changed();
}
export async function disableRestPush() {
  const id = pushSubscriptionId();
  if (id) await api(`/push/subscriptions/${id}`, { method: 'DELETE', keepalive: true });
  localStorage.removeItem(storageKey);
  if ('serviceWorker' in navigator) {
    const worker = await navigator.serviceWorker.getRegistration();
    await (await worker?.pushManager.getSubscription())?.unsubscribe();
    for (const notification of (await worker?.getNotifications({ tag: 'jj-rest-complete' })) ?? [])
      notification.close();
  }
  changed();
}
export async function syncRestPush(
  timer: TimerState | null,
  sound: boolean,
  path: string,
  test = false,
) {
  const id = pushSubscriptionId();
  if (!id) return false;
  const revision = Math.max(Date.now(), Number(localStorage.getItem('jj-push-revision') || 0) + 1);
  localStorage.setItem('jj-push-revision', String(revision));
  const result = await api<{ scheduled: boolean; superseded: boolean }>(
    `/push/subscriptions/${id}/timer`,
    {
      method: 'PUT',
      keepalive: true,
      body: JSON.stringify({
        revision,
        delayMs:
          timer?.endAt == null || timer.done
            ? null
            : Math.max(0, Math.round(timer.endAt - Date.now())),
        exerciseName: timer?.exerciseName ?? '',
        kind: timer?.kind ?? 'set',
        sound,
        path,
        test,
      }),
    },
  );
  return !result.superseded && result.scheduled;
}
