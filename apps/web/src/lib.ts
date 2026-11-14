import { Dexie, type EntityTable } from 'dexie';
import {
  createId,
  sessionSchema,
  type Bootstrap,
  type Session,
  type ServerSession,
} from '@gym/shared';
export type LocalSession = {
  id: string;
  data: Session;
  serverVersion: number;
  localRevision: number;
  dirty: boolean;
  mutationId: string;
  conflict: string | null;
  acknowledgedAt?: number;
};
class GymDB extends Dexie {
  sessions!: EntityTable<LocalSession, 'id'>;
  meta!: EntityTable<{ key: string; value: Bootstrap }, 'key'>;
  constructor() {
    super('gym-with-jj');
    this.version(1).stores({ sessions: 'id', meta: 'key' });
  }
}
export const db = new GymDB();
let csrf = '';
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  // Cached screens mount before the authentication query completes on reload.
  // Obtain CSRF first for automatic timer writes as well as user actions.
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(options.method ?? 'GET') &&
    path !== '/auth/login' &&
    !csrf
  )
    await authenticate();
  const res = await fetch(`/api${path}`, {
    ...options,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const data = (await res
      .json()
      .catch(() => ({ error: 'The server is unavailable. Try again.' }))) as {
      error?: string;
      issues?: { message: string }[];
    };
    throw new ApiError(res.status, data.issues?.[0]?.message ?? data.error ?? 'Request failed');
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
export async function authenticate() {
  const auth = await api<{ csrfToken: string }>('/auth/me');
  csrf = auth.csrfToken;
}
export async function login(email: string, password: string) {
  const auth = await api<{ csrfToken: string }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  csrf = auth.csrfToken;
}
export async function refreshData() {
  const requestedAt = Date.now();
  const data = await api<Bootstrap>('/bootstrap');
  const pendingTheme = localStorage.getItem(`jj-theme:${data.owner.id}`);
  if (pendingTheme === 'light' || pendingTheme === 'dark') {
    data.settings.theme = pendingTheme;
    try {
      await api('/settings', { method: 'PUT', body: JSON.stringify(data.settings) });
      localStorage.removeItem(`jj-theme:${data.owner.id}`);
    } catch {
      /* Keep the local choice until reconnecting. */
    }
  }
  await db.transaction('rw', db.meta, db.sessions, async () => {
    const cached = await db.meta.get('bootstrap');
    if (cached && cached.value.owner.id !== data.owner.id) await db.sessions.clear();
    await db.meta.put({ key: 'bootstrap', value: data });
    const ids = new Set(data.sessions.map((s) => s.id));
    for (const row of await db.sessions.toArray())
      if (!row.dirty && !ids.has(row.id) && (row.acknowledgedAt ?? 0) <= requestedAt)
        await db.sessions.delete(row.id);
    for (const raw of data.sessions) {
      const existing = await db.sessions.get(raw.id);
      if (!existing?.dirty && (!existing || existing.serverVersion <= raw.version))
        await db.sessions.put({
          id: raw.id,
          data: sessionSchema.parse(raw),
          serverVersion: raw.version,
          localRevision: 0,
          dirty: false,
          mutationId: createId(),
          conflict: null,
          acknowledgedAt: requestedAt,
        });
    }
  });
  return data;
}
export async function createLocal(data: Session) {
  sessionSchema.parse(data);
  await db.transaction('rw', db.sessions, async () => {
    const rows = await db.sessions.toArray();
    if (rows.some((s) => ['active', 'paused'].includes(s.data.status)))
      throw new Error('Resume or end your current workout first.');
    await db.sessions.add({
      id: data.id,
      data,
      serverVersion: 0,
      localRevision: 1,
      dirty: true,
      mutationId: createId(),
      conflict: null,
    });
  });
}
export async function updateLocal(id: string, change: (s: Session) => Session) {
  return db.transaction('rw', db.sessions, async () => {
    const row = await db.sessions.get(id);
    if (!row) throw new Error('Workout not found on this device');
    const data = sessionSchema.parse(change(structuredClone(row.data)));
    await db.sessions.put({
      ...row,
      data,
      localRevision: row.localRevision + 1,
      mutationId: createId(),
      dirty: true,
    });
    return data;
  });
}
let syncing: Promise<void> | null = null;
export function syncAll(): Promise<void> {
  if (syncing) return syncing;
  const perform = async () => {
    if (!navigator.onLine) return;
    await authenticate();
    for (let pass = 0; pass < 10; pass++) {
      const pending = (await db.sessions.toArray())
        .filter((r) => r.dirty && !r.conflict)
        .sort((a, b) => {
          // Finalize the previous server workout before opening a later offline
          // workout. UUID ordering must not cause a spurious active-session conflict.
          const active = (r: LocalSession) =>
            Number(r.data.status === 'active' || r.data.status === 'paused');
          return active(a) - active(b) || a.data.startedAt.localeCompare(b.data.startedAt);
        });
      if (!pending.length) break;
      for (const row of pending) {
        try {
          const saved = await api<ServerSession>('/sessions/sync', {
            method: 'POST',
            body: JSON.stringify({
              mutationId: row.mutationId,
              baseVersion: row.serverVersion,
              session: row.data,
            }),
          });
          await db.transaction('rw', db.sessions, async () => {
            const current = await db.sessions.get(row.id);
            if (current)
              await db.sessions.put({
                ...current,
                serverVersion: saved.version,
                dirty: current.localRevision !== row.localRevision,
                acknowledgedAt: Date.now(),
              });
          });
        } catch (err) {
          if (err instanceof ApiError && err.status === 409) {
            await db.sessions.update(row.id, { conflict: err.message });
            continue;
          }
          throw err;
        }
      }
    }
  };
  const task = (navigator.locks ? navigator.locks.request('gym-with-jj-sync', perform) : perform())
    .then(() => undefined)
    .finally(() => {
      syncing = null;
    });
  syncing = task;
  return task;
}
export async function logout() {
  await api('/auth/logout', {
    method: 'POST',
    body: JSON.stringify({
      pushSubscriptionId: localStorage.getItem('jj-push-subscription') ?? undefined,
    }),
  });
  csrf = '';
  await db.transaction('rw', db.meta, db.sessions, async () => {
    await db.meta.clear();
    await db.sessions.clear();
  });
  localStorage.removeItem('jj-timer');
  localStorage.removeItem('jj-push-subscription');
}
export function download(name: string, data: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const duration = (ms: number) => {
  const secs = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(secs / 60)
    .toString()
    .padStart(2, '0')}:${(secs % 60).toString().padStart(2, '0')}`;
};
export const displayDate = (
  date: string,
  timezone = 'Asia/Manila',
  options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' },
) => new Intl.DateTimeFormat('en-PH', { ...options, timeZone: timezone }).format(new Date(date));
export const localDay = (date: string, timezone = 'Asia/Manila') =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(date));
