import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, settingsSchema, sessionSchema, type Bootstrap } from '@gym/shared';
import { db, authenticate, login, refreshData, syncAll, ApiError, type LocalSession } from './lib';
import { Button } from './components/ui/button';
import { BrandBackground } from './components/brand-background';
import { Dumbbell, WifiOff } from 'lucide-react';
import type { z } from 'zod';
import { ZodError } from 'zod';
type AppContext = {
  data: Bootstrap;
  rows: LocalSession[];
  online: boolean;
  syncError: string;
  notice: (s: string) => void;
  refresh: () => Promise<unknown>;
  run: (fn: () => Promise<unknown>) => Promise<boolean>;
  setTheme: (theme: 'light' | 'dark') => Promise<void>;
};
const Context = createContext<AppContext | null>(null);
export const useApp = () => {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('Missing app context');
  return ctx;
};
export function AppProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const cached = useLiveQuery(async () => {
    const cached = await db.meta.get('bootstrap');
    if (cached) cached.value.settings = settingsSchema.parse(cached.value.settings);
    return cached;
  });
  const rows = useLiveQuery(
    async () =>
      (await db.sessions.toArray()).map((row) => ({ ...row, data: sessionSchema.parse(row.data) })),
    [],
    [],
  );
  const [online, setOnline] = useState(navigator.onLine);
  const [toast, setToast] = useState('');
  const [syncError, setSyncError] = useState('');
  const auth = useQuery({
    queryKey: ['auth'],
    queryFn: async () => {
      await authenticate();
      return true;
    },
    retry: false,
    enabled: online,
    refetchOnWindowFocus: true,
  });
  const bootstrap = useQuery({
    queryKey: ['bootstrap'],
    queryFn: refreshData,
    retry: 1,
    enabled:
      online &&
      auth.data === true &&
      !(auth.error instanceof ApiError && auth.error.status === 401),
  });
  const notice = useCallback((s: string) => setToast(s), []);
  const setTheme = useCallback(async (theme: 'light' | 'dark') => {
    const cached = await db.meta.get('bootstrap');
    if (!cached) return;
    localStorage.setItem(`jj-theme:${cached.value.owner.id}`, theme);
    document.documentElement.dataset.theme = theme;
    await db.meta.put({
      key: 'bootstrap',
      value: { ...cached.value, settings: { ...cached.value.settings, theme } },
    });
    if (navigator.onLine) await refreshData();
  }, []);
  const refresh = useCallback(
    () => client.fetchQuery({ queryKey: ['bootstrap'], queryFn: refreshData, staleTime: 0 }),
    [client],
  );
  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        return true;
      } catch (e) {
        notice(
          e instanceof ZodError
            ? (e.issues[0]?.message ?? 'Please check the entered values')
            : e instanceof Error
              ? e.message
              : 'Something went wrong',
        );
        return false;
      }
    },
    [notice],
  );
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  const dirty = rows
    .filter((r) => r.dirty && !r.conflict)
    .map((r) => `${r.id}:${r.localRevision}`)
    .join(',');
  useEffect(() => {
    if (!online || !auth.data || auth.error) return;
    let disposed = false;
    const sync = () => {
      void syncAll()
        .then(() => {
          if (!disposed) setSyncError('');
        })
        .catch((e) => {
          if (!disposed) {
            setSyncError(e instanceof Error ? e.message : 'Sync is waiting');
            if (e instanceof ApiError && e.status === 401)
              void client.invalidateQueries({ queryKey: ['auth'] });
          }
        });
    };
    const t = setTimeout(sync, 500);
    const interval = setInterval(sync, 15000);
    return () => {
      disposed = true;
      clearTimeout(t);
      clearInterval(interval);
    };
  }, [dirty, online, auth.data, auth.error, client]);
  useEffect(() => {
    document.documentElement.dataset.theme = cached?.value.settings.theme ?? 'light';
  }, [cached?.value.settings.theme]);
  if (online && auth.error instanceof ApiError && auth.error.status === 401)
    return (
      <Login
        onLogin={async () => {
          await client.invalidateQueries({ queryKey: ['auth'] });
          await refresh();
        }}
      />
    );
  if (!cached) {
    if ((online && auth.isPending) || bootstrap.isFetching)
      return (
        <div className="loading-screen">
          <Dumbbell size={40} />
          <p>Getting your gym ready…</p>
        </div>
      );
    return (
      <div className="loading-screen">
        <WifiOff size={40} />
        <h1>Your gym is taking a moment.</h1>
        <p>
          {bootstrap.error?.message ??
            auth.error?.message ??
            'Connect to the internet and sign in on this device first.'}
        </p>
        <Button onClick={() => location.reload()}>Try again</Button>
      </div>
    );
  }
  return (
    <Context.Provider
      value={{ data: cached.value, rows, online, syncError, notice, refresh, run, setTheme }}
    >
      {children}
      {toast && (
        <div role="status" className="toast" onClick={() => setToast('')}>
          {toast}
        </div>
      )}
    </Context.Provider>
  );
}
function Login({ onLogin }: { onLogin: () => Promise<void> }) {
  const [error, setError] = useState('');
  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });
  return (
    <main className="login-layout plain-login">
      <BrandBackground />
      <section className="login-panel">
        <div className="brand">
          <div className="brand-icon">
            <Dumbbell />
          </div>
          <span>
            GYM WITH JJ<span className="brand-dot">.</span>
          </span>
        </div>
        <h1>Sign in</h1>{' '}
        <form
          onSubmit={form.handleSubmit(async (values) => {
            setError('');
            try {
              await login(values.email, values.password);
              await onLogin();
            } catch (e) {
              setError((e as Error).message);
            }
          })}
        >
          <label>
            Email address
            <input
              type="email"
              autoComplete="username"
              placeholder="you@example.com"
              {...form.register('email')}
            />
          </label>
          {form.formState.errors.email && (
            <p className="field-error">{form.formState.errors.email.message}</p>
          )}
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Your password"
              {...form.register('password')}
            />
          </label>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          <Button type="submit" disabled={form.formState.isSubmitting} className="w-full">
            {form.formState.isSubmitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <p className="small muted">Owner account only. For initial setup, see the README.</p>
      </section>
    </main>
  );
}
