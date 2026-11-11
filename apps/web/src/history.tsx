import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
} from 'recharts';
import {
  History,
  Search,
  ArrowLeft,
  Timer,
  Dumbbell,
  TrendingUp,
  Trophy,
  CalendarDays,
  Check,
  Footprints,
  Trash2,
} from 'lucide-react';
import {
  elapsedMs,
  volume,
  workoutProgress,
  toDisplayWeight,
  personalRecord,
  type Session,
} from '@gym/shared';
import { useApp } from './context';
import { api, displayDate, localDay, db } from './lib';
import { Button } from './components/ui/button';
import { PageHeading, Empty, Confirm, Field } from './components/common';
import { restMinutes } from './rest';
export function WorkoutHistory() {
  const { rows, data } = useApp();
  const [search, setSearch] = useState('');
  const [split, setSplit] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const all = rows
    .filter((r) => r.data.status === 'completed')
    .sort((a, b) => b.data.startedAt.localeCompare(a.data.startedAt));
  const filtered = all.filter(({ data: s }) => {
    const day = localDay(s.startedAt, data.settings.timezone);
    return (
      `${s.dayName} ${s.splitName} ${s.notes}`.toLowerCase().includes(search.toLowerCase()) &&
      (!split || s.splitName === split) &&
      (!from || day >= from) &&
      (!to || day <= to)
    );
  });
  return (
    <>
      <PageHeading title="History" />
      <div className="filter-bar history-filters">
        <label className="search-input">
          <Search size={18} />
          <input
            aria-label="Search workout history"
            placeholder="Search workouts or notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Filter history by split"
          value={split}
          onChange={(e) => setSplit(e.target.value)}
        >
          <option value="">All splits</option>
          {[...new Set(all.map((r) => r.data.splitName))].map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
        <Field label="From">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      <div className="history-count">
        {filtered.length} completed workout{filtered.length === 1 ? '' : 's'}
      </div>
      {filtered.length ? (
        <div className="history-list">
          {filtered.map(({ data: s, dirty }) => (
            <Link className="card history-card" key={s.id} to={`/history/${s.id}`}>
              <div className="history-date">
                <strong>
                  {displayDate(s.startedAt, data.settings.timezone, { day: '2-digit' })}
                </strong>
                <span>{displayDate(s.startedAt, data.settings.timezone, { month: 'short' })}</span>
              </div>
              <div className="history-card-content">
                <span className="eyebrow">{s.splitName}</span>
                <h2>{s.dayName}</h2>
                <div className="history-metrics">
                  <span>
                    <Timer size={15} />
                    {Math.round(elapsedMs(s) / 60000)} min
                  </span>
                  <span>
                    <Dumbbell size={15} />
                    {
                      s.exercises.filter(
                        (e) => !e.skipped && e.sets.some((s) => s.completed && !s.warmup),
                      ).length
                    }{' '}
                    exercises
                  </span>
                  <span>{workoutProgress(s).completed} sets</span>
                  <span>
                    {toDisplayWeight(volume(s), data.settings.unit).toLocaleString()}{' '}
                    {data.settings.unit} volume
                  </span>
                </div>
                {dirty && <small className="coral">Saved locally · waiting to sync</small>}
              </div>
              <span className="history-arrow"></span>
            </Link>
          ))}
        </div>
      ) : (
        <Empty
          icon={<History size={30} />}
          title={all.length ? 'No matching workouts' : 'No completed workouts'}
          action={
            <Button asChild>
              <Link to="/workouts">Explore your workouts</Link>
            </Button>
          }
        >
          {all.length ? 'Try another filter or date range.' : 'Complete a workout to add it here.'}
        </Empty>
      )}
    </>
  );
}
export function SessionDetail() {
  const { id } = useParams();
  const { rows } = useApp();
  const row = rows.find((r) => r.id === id && r.data.status === 'completed');
  return row ? (
    <Detail
      key={`${row.id}:${row.serverVersion}`}
      session={row.data}
      dirty={row.dirty}
      version={row.serverVersion}
    />
  ) : (
    <Empty
      icon={<History />}
      title="Workout not found"
      action={
        <Button asChild>
          <Link to="/history">Back to history</Link>
        </Button>
      }
    >
      This session may have been deleted or may still be active.
    </Empty>
  );
}
function Detail({
  session: s,
  dirty,
  version,
}: {
  session: Session;
  dirty: boolean;
  version: number;
}) {
  const { data, rows, online, run, refresh, notice } = useApp();
  const [params] = useSearchParams();
  const [notes, setNotes] = useState(s.notes);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const previous = rows
    .map((r) => r.data)
    .filter((w) => w.status === 'completed' && w.startedAt < s.startedAt)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return (
    <>
      <Link className="back-link" to="/history">
        <ArrowLeft size={16} />
        All workout history
      </Link>
      {params.has('finished') && (
        <div className="completion-notice" role="status">
          <h2>Workout completed</h2>
        </div>
      )}
      <PageHeading title={s.dayName} />
      <div className="stats-grid">
        <Stat
          icon={<Timer />}
          value={`${Math.round(elapsedMs(s) / 60000)}`}
          label="minutes trained"
        />
        <Stat icon={<Check />} value={String(workoutProgress(s).completed)} label="working sets" />
        <Stat
          icon={<Dumbbell />}
          value={String(
            s.exercises.filter((e) => !e.skipped && e.sets.some((s) => s.completed)).length,
          )}
          label="exercises logged"
        />
        <Stat
          icon={<TrendingUp />}
          value={toDisplayWeight(volume(s), s.unit).toLocaleString()}
          label={`${s.unit} external volume`}
        />
      </div>
      <p className="muted small">
        {displayDate(s.startedAt, data.settings.timezone)} ? {s.splitName}
        <br />
        Started{' '}
        {displayDate(s.startedAt, data.settings.timezone, { hour: '2-digit', minute: '2-digit' })} ·
        Finished{' '}
        {displayDate(s.finishedAt!, data.settings.timezone, { hour: '2-digit', minute: '2-digit' })}{' '}
        · {s.unit} · {data.settings.timezone}
        {dirty ? ' · Saved locally, pending sync' : ''}
      </p>
      <div className="detail-exercises">
        {s.exercises.map((e, i) => {
          const prev = previous
            .flatMap((w) => w.exercises)
            .find((p) => p.exerciseId === e.exerciseId && p.loadMode === e.loadMode && !p.skipped);
          return (
            <section className="card detail-exercise" key={e.id}>
              <div className="exercise-heading">
                <span className="exercise-number">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <span className="eyebrow">
                    {e.primaryMuscle} · {e.equipment}
                  </span>
                  <h2>{e.name}</h2>
                  <p>
                    {e.repMin}–{e.repMax} target reps · {restMinutes(e.restSeconds)} min set rest ·{' '}
                    {restMinutes(e.exerciseRestSeconds)} min exercise rest{' '}
                    {e.skipped ? '· Skipped' : ''}
                  </p>
                </div>
              </div>
              <div className="detail-sets">
                <div className="detail-set-heading">
                  <span>SET</span>
                  <span>ACTUAL</span>
                  <span>PREVIOUS</span>
                  <span>STATUS</span>
                </div>
                {e.sets.map((set, index) => {
                  const prevSet = prev?.sets.filter((x) => x.warmup === set.warmup && x.completed)[
                    e.sets.slice(0, index).filter((x) => x.warmup === set.warmup).length
                  ];
                  return (
                    <div key={set.id}>
                      <span>
                        {set.warmup
                          ? 'Warm-up'
                          : e.sets.slice(0, index + 1).filter((x) => !x.warmup).length}
                      </span>
                      <strong>
                        {toDisplayWeight(set.weightKg, s.unit)} {s.unit} × {set.reps}
                      </strong>
                      <span>
                        {prevSet
                          ? `${toDisplayWeight(prevSet.weightKg, s.unit)} × ${prevSet.reps}`
                          : '—'}
                      </span>
                      <span className={set.completed ? 'completed-label' : 'muted'}>
                        {set.completed ? (
                          <>
                            <Check size={14} />
                            Done
                          </>
                        ) : (
                          'Not logged'
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
              {e.notes && <p className="exercise-note">{e.notes}</p>}
            </section>
          );
        })}
      </div>
      {s.cardio.map((c) => (
        <section className="card detail-cardio" key={c.id}>
          <Footprints size={24} />
          <div>
            <h3>Treadmill finisher</h3>
            <p>
              {c.durationMinutes} min · {c.speedKph} km/h · {c.incline}% incline
            </p>
          </div>
          <span className="pill neutral-pill">{c.completed ? 'Completed' : 'Not completed'}</span>
        </section>
      ))}
      <section className="card workout-notes">
        <Field label="Workout notes">
          <textarea
            maxLength={4000}
            value={notes}
            disabled={!online || dirty}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        <Button
          variant="secondary"
          disabled={!online || dirty || busy || notes === s.notes}
          onClick={async () => {
            setBusy(true);
            await run(async () => {
              await api(`/sessions/${s.id}/notes`, {
                method: 'PATCH',
                body: JSON.stringify({ notes, version }),
              });
              await refresh();
              notice('Notes saved');
            });
            setBusy(false);
          }}
        >
          {busy ? 'Saving…' : 'Save notes'}
        </Button>
        {dirty && <p className="small muted">Notes can be edited after this workout syncs.</p>}
      </section>
      <div className="finish-actions">
        <Confirm
          disabled={!online || dirty}
          title="Delete this workout?"
          description="This permanently hides the session from your history and analytics. Stale devices cannot recreate it."
          onConfirm={async () => {
            await api(`/sessions/${s.id}`, { method: 'DELETE', body: JSON.stringify({ version }) });
            await db.sessions.delete(s.id);
            await refresh();
            navigate('/history');
          }}
        >
          <Trash2 size={17} />
          Delete workout
        </Confirm>
        <Button asChild variant="secondary">
          <Link to="/progress">See your progress</Link>
        </Button>
      </div>
    </>
  );
}
function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="card stat-card">
      <span className="icon-soft">{icon}</span>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
export function Progress() {
  const { rows, data } = useApp();
  const [params] = useSearchParams();
  const [selected, setSelected] = useState(params.get('exercise') ?? '');
  const history = rows
    .map((r) => r.data)
    .filter((s) => s.status === 'completed')
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const exerciseOptions = [
    ...new Map(
      history
        .flatMap((s) => s.exercises)
        .map((e) => [
          `${e.exerciseId}:${e.loadMode}`,
          { id: e.exerciseId, name: e.name, mode: e.loadMode },
        ]),
    ).values(),
  ];
  const exercise =
    exerciseOptions.find((e) => `${e.id}:${e.mode}` === selected || e.id === selected) ??
    exerciseOptions[0];
  const mode = exercise?.mode;
  const unit = data.settings.unit;
  const points = exercise
    ? history.flatMap((s) => {
        const exercises = s.exercises.filter(
          (e) => e.exerciseId === exercise.id && e.loadMode === exercise.mode && !e.skipped,
        );
        const record = personalRecord(exercises);
        if (!record) return [];
        const e1rm = Math.max(
          0,
          ...exercises.flatMap((e) =>
            e.sets
              .filter((s) => s.completed && !s.warmup && s.reps <= 12)
              .map((s) => s.weightKg * (1 + s.reps / 30)),
          ),
        );
        return [
          {
            date: displayDate(s.startedAt, data.settings.timezone, {
              month: 'short',
              day: 'numeric',
            }),
            load: mode === 'bodyweight' ? record.reps : toDisplayWeight(record.weightKg, unit),
            volume: toDisplayWeight(volume({ exercises }), unit),
            estimated1RM: mode === 'external' && e1rm ? toDisplayWeight(e1rm, unit) : null,
          },
        ];
      })
    : [];
  const record = exercise
    ? personalRecord(
        history
          .flatMap((s) => s.exercises)
          .filter((e) => e.exerciseId === exercise.id && e.loadMode === exercise.mode),
      )
    : null;
  const today = Date.parse(
    `${localDay(new Date().toISOString(), data.settings.timezone)}T00:00:00Z`,
  );
  const weekday = (new Date(today).getUTCDay() + 6) % 7;
  const weekStart = today - weekday * 86400000;
  const frequency = Array.from({ length: 8 }, (_, i) => {
    const start = weekStart - (7 - i) * 7 * 86400000;
    return {
      date: displayDate(new Date(start).toISOString(), 'UTC', { month: 'short', day: 'numeric' }),
      workouts: history.filter((s) => {
        const d = Date.parse(`${localDay(s.startedAt, data.settings.timezone)}T00:00:00Z`);
        return d >= start && d < start + 7 * 86400000;
      }).length,
    };
  });
  const activeWeeks = frequency.slice(-4).filter((w) => w.workouts > 0).length;
  return (
    <>
      <PageHeading title="Progress" />
      <div className="stats-grid">
        <Stat icon={<Dumbbell />} value={String(history.length)} label="total workouts" />
        <Stat
          icon={<CalendarDays />}
          value={String(frequency.at(-1)?.workouts ?? 0)}
          label="workouts this week"
        />
        <Stat icon={<TrendingUp />} value={`${activeWeeks}/4`} label="recent weeks with activity" />
        <Stat
          icon={<Trophy />}
          value={String(
            new Set(
              history.flatMap((s) =>
                s.exercises
                  .filter((e) => e.sets.some((s) => s.completed && !s.warmup))
                  .map((e) => e.exerciseId),
              ),
            ).size,
          )}
          label="exercises with logged sets"
        />
      </div>
      {history.length === 0 ? (
        <Empty
          icon={<TrendingUp size={32} />}
          title="No progress data"
          action={
            <Button asChild>
              <Link to="/workouts">Let’s train</Link>
            </Button>
          }
        >
          Complete a workout to view your progress.
        </Empty>
      ) : (
        <>
          <section className="card progress-selector">
            <div>
              <h2>Exercise performance</h2>
            </div>
            <select
              aria-label="Choose progress exercise"
              value={exercise ? `${exercise.id}:${exercise.mode}` : ''}
              onChange={(e) => setSelected(e.target.value)}
            >
              {exerciseOptions.map((e) => (
                <option key={`${e.id}:${e.mode}`} value={`${e.id}:${e.mode}`}>
                  {e.name} · {e.mode.replaceAll('-', ' ')}
                </option>
              ))}
            </select>
          </section>
          {record && (
            <div className="pr-banner">
              <span className="icon-tile peach">
                <Trophy size={25} />
              </span>
              <div>
                <span className="eyebrow">
                  {mode === 'assistance'
                    ? 'LEAST ASSISTANCE'
                    : mode === 'bodyweight'
                      ? 'MOST REPS'
                      : 'BEST COMPLETED SET'}
                </span>
                <h3>
                  {mode === 'bodyweight'
                    ? `${record.reps} reps`
                    : `${toDisplayWeight(record.weightKg, unit)} ${unit} × ${record.reps} reps`}
                </h3>
              </div>
              <span className="small muted">Working sets only</span>
            </div>
          )}
          <div className="charts-grid">
            <section className="card chart-card">
              <h2>
                {mode === 'assistance'
                  ? 'Assistance trend'
                  : mode === 'bodyweight'
                    ? 'Rep progression'
                    : 'Weight progression'}
              </h2>
              <p>
                {mode === 'assistance'
                  ? 'Less assistance means stronger.'
                  : mode === 'bodyweight'
                    ? 'Best completed reps each session.'
                    : mode === 'weighted-bodyweight'
                      ? `Added external load only (${unit}).`
                      : `Best completed load each session (${unit}).`}
              </p>
              <Chart points={points} field="load" label={mode === 'bodyweight' ? 'reps' : unit} />
            </section>
            {mode === 'external' && (
              <section className="card chart-card">
                <h2>Estimated 1RM</h2>
                <p>Epley estimate from sets of 1–12 reps. Not a tested 1RM.</p>
                <Chart points={points} field="estimated1RM" label={unit} />
              </section>
            )}
            {(mode === 'external' || mode === 'weighted-bodyweight') && (
              <section className="card chart-card">
                <h2>Training volume</h2>
                <p>Completed external load × reps ({unit}). Warm-ups excluded.</p>
                <Chart points={points} field="volume" label={unit} />
              </section>
            )}
            <section className="card chart-card">
              <h2>Showing up, week by week</h2>
              <p>Your workout frequency over the last eight weeks.</p>
              <div
                className="chart-container"
                role="img"
                aria-label={`Weekly workouts: ${frequency.map((w) => `${w.date}: ${w.workouts}`).join(', ')}`}
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={frequency} margin={{ left: -24, right: 12, top: 10 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 5" stroke="#e9e4df" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip />
                    <Bar dataKey="workouts" fill="#F16244" radius={[6, 6, 0, 0]} maxBarSize={30} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
          </div>
          <p className="analytics-note">
            PRs use greatest load (ties: most reps), most reps for bodyweight, and least assistance
            (ties: most reps) for assisted movements. Comparisons stay within an exercise and load
            mode. Machine loads depend on the machine; keep your setup consistent. Four-week
            consistency is weeks with at least one workout, including the current week.
          </p>
        </>
      )}
    </>
  );
}
function Chart({
  points,
  field,
  label,
}: {
  points: Record<string, unknown>[];
  field: string;
  label: string;
}) {
  if (!points.length || points.every((p) => p[field] === null))
    return <div className="chart-empty">No eligible completed sets yet.</div>;
  return (
    <div
      className="chart-container"
      role="img"
      aria-label={`${field}: ${points.map((p) => `${p.date}: ${p[field] ?? 'no estimate'} ${label}`).join(', ')}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ left: -16, right: 18, top: 15 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 5" stroke="#e9e4df" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip
            formatter={(v) => [
              `${v} ${label}`,
              field === 'estimated1RM'
                ? 'Estimated 1RM'
                : field === 'volume'
                  ? 'Volume'
                  : 'Best set',
            ]}
          />
          <Line
            type="monotone"
            dataKey={field}
            stroke="#F16244"
            strokeWidth={3}
            dot={{ r: 4, fill: '#F16244', stroke: '#fff', strokeWidth: 2 }}
            activeDot={{ r: 6 }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
