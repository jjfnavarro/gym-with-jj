import { useState, lazy, Suspense } from 'react';
import { Routes, Route, NavLink, Link, useNavigate } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import {
  Dumbbell,
  House,
  Layers,
  History,
  ChartNoAxesCombined,
  Settings,
  ArrowRight,
  Check,
  ChevronRight,
  Sun,
  Play,
  Moon,
  RefreshCw,
} from 'lucide-react';
import { newSession, workoutProgress } from '@gym/shared';
import { useApp } from './context';
import { createLocal, displayDate, localDay, syncAll } from './lib';
import { Button } from './components/ui/button';
import { Dialog } from './components/ui/dialog';
import { PageHeading, Empty } from './components/common';
import { BrandBackground } from './components/brand-background';

const Workouts = lazy(() => import('./workouts').then((m) => ({ default: m.Workouts })));
const SplitEditor = lazy(() => import('./workouts').then((m) => ({ default: m.SplitEditor })));
const Library = lazy(() => import('./workouts').then((m) => ({ default: m.Library })));
const LiveWorkout = lazy(() => import('./workout').then((m) => ({ default: m.LiveWorkout })));
const WorkoutHistory = lazy(() => import('./history').then((m) => ({ default: m.WorkoutHistory })));
const SessionDetail = lazy(() => import('./history').then((m) => ({ default: m.SessionDetail })));
const Progress = lazy(() => import('./history').then((m) => ({ default: m.Progress })));
const SettingsPage = lazy(() => import('./settings').then((m) => ({ default: m.SettingsPage })));
const navigation = [
  { to: '/', label: 'Home', icon: House },
  { to: '/workouts', label: 'Workouts', icon: Layers },
  { to: '/history', label: 'History', icon: History },
  { to: '/progress', label: 'Progress', icon: ChartNoAxesCombined },
  { to: '/settings', label: 'Settings', icon: Settings },
];
export function App() {
  const { data, online, rows, syncError, setTheme, refresh, run } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const [themeBusy, setThemeBusy] = useState(false);
  const queued = rows.filter((r) => r.dirty).length;
  const conflicts = rows.some((r) => r.conflict);
  const [start, setStart] = useState(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  return (
    <div
      className="app-layout"
      data-sync-state={
        !online
          ? 'offline'
          : conflicts
            ? 'conflict'
            : syncError
              ? 'error'
              : queued
                ? 'pending'
                : 'synced'
      }
    >
      <aside className="sidebar">
        <Link to="/" className="brand">
          <div className="brand-icon">
            <Dumbbell size={23} />
          </div>
          <span>
            GYM WITH JJ<span className="brand-dot">.</span>
          </span>
        </Link>
        <nav aria-label="Main navigation">
          {navigation.map(({ to, label, icon: Icon }) => (
            <NavLink end={to === '/'} key={to} to={to}>
              <Icon size={21} />
              <span>{label}</span>
              <ChevronRight className="nav-chevron" size={16} />
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-profile">
          <span className="avatar">{data.owner.name.slice(0, 2).toUpperCase()}</span>
          <div>
            <strong>{data.owner.name}</strong>
            <span>Owner</span>
          </div>
        </div>
      </aside>
      <div className="main-wrapper">
        <BrandBackground />
        <div className="topbar">
          <Link to="/" className="mobile-brand">
            <Dumbbell size={22} />
            GYM WITH JJ<span className="coral">.</span>
          </Link>
          <div className="header-actions">
            <button
              className="header-control"
              aria-label={
                data.settings.theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'
              }
              title={data.settings.theme === 'light' ? 'Dark mode' : 'Light mode'}
              disabled={themeBusy}
              onClick={async () => {
                setThemeBusy(true);
                await run(() => setTheme(data.settings.theme === 'light' ? 'dark' : 'light'));
                setThemeBusy(false);
              }}
            >
              {data.settings.theme === 'light' ? <Moon size={23} /> : <Sun size={23} />}
            </button>
            <button
              className="header-control"
              aria-label="Refresh data"
              title="Refresh"
              disabled={refreshing || !online}
              aria-busy={refreshing}
              onClick={async () => {
                setRefreshing(true);
                await run(async () => {
                  await syncAll();
                  await refresh();
                });
                setRefreshing(false);
              }}
            >
              <RefreshCw size={22} className={refreshing ? 'is-spinning' : ''} />
            </button>
          </div>
        </div>
        {!online && (
          <div className="connection-banner" role="status">
            Offline. Workout changes are saved on this device.
          </div>
        )}
        {needRefresh && (
          <div className="update-banner">
            A fresh version is ready.{' '}
            {queued || rows.some((r) => ['active', 'paused'].includes(r.data.status)) ? (
              'Finish and sync your workout before updating.'
            ) : (
              <Button size="sm" onClick={() => void updateServiceWorker(true)}>
                Update app
              </Button>
            )}
          </div>
        )}
        {(conflicts || syncError) && (
          <Link className="sync-banner" to="/settings">
            {conflicts ? 'A local workout needs your review. Both copies are safe.' : syncError}{' '}
            <ArrowRight size={16} />
          </Link>
        )}
        <main className="page-content">
          <Suspense
            fallback={
              <div className="route-loading" role="status">
                Loading...
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<Home onStart={() => setStart(true)} />} />
              <Route path="/workouts" element={<Workouts onStart={() => setStart(true)} />} />
              <Route path="/workouts/library" element={<Library />} />
              <Route path="/workouts/:id/edit" element={<SplitEditor />} />
              <Route path="/session/:id" element={<LiveWorkout />} />
              <Route path="/history" element={<WorkoutHistory />} />
              <Route path="/history/:id" element={<SessionDetail />} />
              <Route path="/progress" element={<Progress />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route
                path="*"
                element={
                  <Empty
                    icon={<Dumbbell />}
                    title="Let’s get you back on track."
                    action={
                      <Button asChild>
                        <Link to="/">Go home</Link>
                      </Button>
                    }
                  >
                    This page doesn’t exist.
                  </Empty>
                }
              />
            </Routes>
          </Suspense>
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {navigation.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'}>
            <Icon size={21} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
      <StartDialog open={start} onOpenChange={setStart} />
    </div>
  );
}
export function StartDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data, rows, run } = useApp();
  const navigate = useNavigate();
  const [splitId, setSplitId] = useState('');
  const [dayId, setDayId] = useState('');
  const [busy, setBusy] = useState(false);
  const available = data.splits.filter((s) => !s.archived);
  const split =
    available.find((s) => s.id === (splitId || data.settings.activeSplitId)) ?? available[0];
  const day = split?.days.find((d) => d.id === dayId);
  const active = rows.find((r) => ['active', 'paused'].includes(r.data.status));
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Start workout"
      description="Pick any training day. Your workout starts when you’re ready."
    >
      {active ? (
        <div className="stack">
          <p>You have an unfinished {active.data.dayName} workout.</p>
          <Button
            onClick={() => {
              onOpenChange(false);
              navigate(`/session/${active.id}`);
            }}
          >
            Resume workout <Play size={17} />
          </Button>
        </div>
      ) : !split ? (
        <Empty
          icon={<Layers />}
          title="Build your first split"
          action={
            <Button
              onClick={() => {
                onOpenChange(false);
                navigate('/workouts');
              }}
            >
              Manage splits
            </Button>
          }
        >
          Add a training day to get started.
        </Empty>
      ) : (
        <div className="stack">
          <label>
            Workout split
            <select
              value={split.id}
              onChange={(e) => {
                setSplitId(e.target.value);
                setDayId('');
              }}
            >
              {available.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <div className="day-picker">
            {split.days.map((d, i) => (
              <button
                key={d.id}
                disabled={d.isRest}
                className={`day-choice ${dayId === d.id ? 'selected' : ''}`}
                onClick={() => setDayId(d.id)}
              >
                <span className="day-index">{String(i + 1).padStart(2, '0')}</span>
                <span>
                  <strong>{d.name}</strong>
                  <small>
                    {d.isRest
                      ? 'Rest & recover'
                      : `${d.exercises.length} exercises · ${d.exercises.reduce((n, e) => n + e.sets, 0)} working sets`}
                  </small>
                </span>
                {dayId === d.id ? (
                  <Check size={19} />
                ) : d.isRest ? (
                  <Sun size={19} />
                ) : (
                  <ChevronRight size={19} />
                )}
              </button>
            ))}
          </div>
          <Button
            disabled={!day || busy}
            onClick={async () => {
              if (!day) return;
              setBusy(true);
              await run(async () => {
                const session = newSession(
                  split,
                  day,
                  data.exercises,
                  rows.map((r) => r.data),
                  data.settings.unit,
                  data.settings,
                );
                await createLocal(session);
                onOpenChange(false);
                navigate(`/session/${session.id}`);
              });
              setBusy(false);
            }}
          >
            {busy ? 'Starting…' : 'Start workout'}
          </Button>
        </div>
      )}
    </Dialog>
  );
}
function Home({ onStart }: { onStart: () => void }) {
  const { data, rows } = useApp();
  const history = rows
    .map((r) => r.data)
    .filter((s) => s.status === 'completed')
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const active = rows.find((r) => ['active', 'paused'].includes(r.data.status));
  const progress = active ? workoutProgress(active.data) : null;
  const latest = history[0];
  const today = localDay(new Date().toISOString(), data.settings.timezone);
  const ordinal = Date.parse(`${today}T00:00:00Z`);
  const weekStart = ordinal - ((new Date(ordinal).getUTCDay() + 6) % 7) * 86400000;
  const workoutsByDay = new Map<string, number>();
  for (const session of history) {
    const key = localDay(session.startedAt, data.settings.timezone);
    workoutsByDay.set(key, (workoutsByDay.get(key) ?? 0) + 1);
  }
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart + index * 86400000);
    const key = date.toISOString().slice(0, 10);
    return {
      key,
      date: date.getUTCDate(),
      day: date.toLocaleDateString('en', { weekday: 'short', timeZone: 'UTC' }),
      label: date.toLocaleDateString('en', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      }),
      count: workoutsByDay.get(key) ?? 0,
    };
  });
  const weekCount = weekDays.reduce((total, day) => total + day.count, 0);
  return (
    <div className="home-overview">
      <PageHeading title="Home" />
      <div className="home-actions">
        <Button className="start-workout-button" onClick={onStart}>
          Start new workout
        </Button>
      </div>
      {active && progress && (
        <section className="card home-resume" aria-label="Current workout">
          <div className="home-resume-heading">
            <h2>{active.data.dayName}</h2>
            <span>
              {progress.completed} / {progress.total} sets
            </span>
          </div>
          <div
            className="home-resume-progress"
            role="progressbar"
            aria-label="Current workout progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
          >
            <span style={{ width: `${progress.percent}%` }} />
          </div>
          <Button asChild>
            <Link to={`/session/${active.id}`}>Resume workout</Link>
          </Button>
        </section>
      )}
      <section className="card home-week" aria-labelledby="home-week-heading">
        <div className="home-week-heading">
          <h2 id="home-week-heading">This week</h2>
          <span>
            <strong>{weekCount}</strong> {weekCount === 1 ? 'workout' : 'workouts'}
          </span>
        </div>
        <ol className="home-week-days">
          {weekDays.map((day) => (
            <li
              key={day.key}
              data-trained={day.count > 0}
              data-today={day.key === today}
              title={`${day.label}: ${day.count} ${day.count === 1 ? 'workout' : 'workouts'}`}
            >
              <span className="home-weekday">{day.day}</span>
              <time dateTime={day.key} aria-current={day.key === today ? 'date' : undefined}>
                {day.date}
              </time>
              <span className="sr-only">
                {day.count} {day.count === 1 ? 'workout' : 'workouts'}
              </span>
            </li>
          ))}
        </ol>
      </section>
      {latest && (
        <section className="home-last" aria-labelledby="home-last-heading">
          <h2 id="home-last-heading">Last workout</h2>
          <Link to={`/history/${latest.id}`} aria-label={`View ${latest.dayName} workout`}>
            <strong>{latest.dayName}</strong>
            <time dateTime={latest.startedAt}>
              {displayDate(latest.startedAt, data.settings.timezone, {
                month: 'short',
                day: 'numeric',
              })}
            </time>
          </Link>
        </section>
      )}
    </div>
  );
}
