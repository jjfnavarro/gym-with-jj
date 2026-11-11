import { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Dumbbell,
  Plus,
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Layers,
  Copy,
  Archive,
  Trash2,
  Search,
  Sun,
  Check,
  Save,
  BookOpen,
  ChevronDown,
} from 'lucide-react';
import {
  exerciseSchema,
  createId,
  splitSchema,
  equipment,
  loadModes,
  type Split,
  type SplitDay,
  type Exercise,
  type Prescription,
} from '@gym/shared';
import { useApp } from './context';
import { api } from './lib';
import { Button } from './components/ui/button';
import { Dialog } from './components/ui/dialog';
import { PageHeading, Empty, Confirm, Field } from './components/common';
import { RestMinutesInput } from './components/autosave-input';
import { restMinutes } from './rest';
const move = <T,>(array: T[], index: number, direction: number) => {
  const result = [...array];
  const other = index + direction;
  if (other < 0 || other >= array.length) return result;
  [result[index], result[other]] = [result[other]!, result[index]!];
  return result;
};
export function Workouts({ onStart }: { onStart: () => void }) {
  const { data, online, run, refresh, notice } = useApp();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState(false);
  const save = async (split: Split) => {
    await api(`/splits/${split.id}`, { method: 'PUT', body: JSON.stringify(split) });
    await refresh();
  };
  return (
    <>
      <PageHeading
        title="Workouts"
        action={
          <Button disabled={!online} onClick={() => setCreating(true)}>
            <Plus size={18} />
            New split
          </Button>
        }
      />
      <div className="toolbar">
        <Button variant="secondary" asChild>
          <Link to="/workouts/library">
            <BookOpen size={18} />
            Exercise library
          </Link>
        </Button>
        <label className="check-label">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
      </div>
      {!online && (
        <p className="info-banner">
          Templates are available offline. Connect to edit your routine.
        </p>
      )}
      <div className="split-grid">
        {data.splits
          .filter((s) => showArchived || !s.archived)
          .map((s) => (
            <article key={s.id} className="card split-card">
              <div className="section-heading">
                <span className="icon-tile">
                  <Layers size={25} />
                </span>
                {data.settings.activeSplitId === s.id ? (
                  <span className="pill">
                    <span className="status-dot" />
                    Active split
                  </span>
                ) : s.archived ? (
                  <span className="pill neutral-pill">Archived</span>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!online}
                    onClick={() =>
                      void run(async () => {
                        await api('/settings', {
                          method: 'PUT',
                          body: JSON.stringify({ ...data.settings, activeSplitId: s.id }),
                        });
                        await refresh();
                      })
                    }
                  >
                    Set active
                  </Button>
                )}
              </div>
              <h2>{s.name}</h2>
              <p>
                {s.days.filter((d) => !d.isRest).length} training days · {s.days.length}-day cycle
              </p>
              <div className="split-day-list">
                {s.days.map((d, i) => (
                  <div key={d.id}>
                    <span className="day-index">{String(i + 1).padStart(2, '0')}</span>
                    <span>
                      <strong>{d.name}</strong>
                      <small>
                        {d.isRest
                          ? 'Recovery is part of the plan'
                          : `${d.exercises.length} exercises · ${d.exercises.reduce((n, e) => n + e.sets, 0)} sets`}
                      </small>
                    </span>
                    {d.isRest ? <Sun size={18} /> : <Dumbbell size={18} />}
                  </div>
                ))}
              </div>
              <div className="split-actions">
                <Button variant="secondary" asChild>
                  <Link to={`/workouts/${s.id}/edit`}>Edit split</Link>
                </Button>
                <Button
                  variant="ghost"
                  disabled={!online}
                  aria-label={`Duplicate ${s.name}`}
                  onClick={() =>
                    void run(async () => {
                      const copy = {
                        ...structuredClone(s),
                        id: createId(),
                        name: `${s.name.slice(0, 110)} (copy)`,
                        archived: false,
                        days: s.days.map((d) => ({
                          ...d,
                          id: createId(),
                          exercises: d.exercises.map((e) => ({ ...e, id: createId() })),
                        })),
                      };
                      await save(copy);
                      notice('Split duplicated');
                    })
                  }
                >
                  <Copy size={18} />
                </Button>
                <Confirm
                  disabled={!online}
                  variant="ghost"
                  title={s.archived ? 'Restore this split?' : 'Archive this split?'}
                  description="Your workout history will stay intact."
                  onConfirm={async () => {
                    if (!s.archived && data.settings.activeSplitId === s.id)
                      await api('/settings', {
                        method: 'PUT',
                        body: JSON.stringify({ ...data.settings, activeSplitId: null }),
                      });
                    await save({ ...s, archived: !s.archived });
                  }}
                >
                  <Archive size={18} />
                  <span className="sr-only">Archive or restore {s.name}</span>
                </Confirm>
                <Confirm
                  disabled={!online}
                  variant="ghost"
                  title="Delete this split?"
                  description="This deletes its template and training days. Completed workout history stays intact."
                  onConfirm={async () => {
                    await api(`/splits/${s.id}`, { method: 'DELETE' });
                    await refresh();
                  }}
                >
                  <Trash2 size={18} />
                  <span className="sr-only">Delete {s.name}</span>
                </Confirm>
              </div>
            </article>
          ))}
      </div>
      {!data.splits.length && (
        <Empty
          icon={<Layers />}
          title="No workout splits"
          action={<Button onClick={() => setCreating(true)}>Create a split</Button>}
        >
          Build a routine around the way you like to train.
        </Empty>
      )}
      <Dialog
        open={creating}
        onOpenChange={setCreating}
        title="New split"
        description="Choose a name. Add as many training and rest days as you need."
      >
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            void run(async () => {
              const split = splitSchema.parse({
                id: createId(),
                name,
                days: [
                  {
                    id: createId(),
                    name: 'Day 1',
                    isRest: false,
                    cardioMinutes: 0,
                    exercises: [],
                  },
                ],
              });
              await save(split);
              setCreating(false);
              navigate(`/workouts/${split.id}/edit`);
            }).finally(() => setBusy(false));
          }}
        >
          <Field label="Split name">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              required
              placeholder="e.g. My 3-day strength plan"
            />
          </Field>
          <Button type="submit" disabled={busy || !online}>
            {busy ? 'Creating…' : 'Create split'}
            <Plus size={18} />
          </Button>
        </form>
      </Dialog>
    </>
  );
}
export function SplitEditor() {
  const { id } = useParams();
  const { data, online } = useApp();
  const source = data.splits.find((s) => s.id === id);
  return source ? (
    <Editor key={id} initial={source} online={online} />
  ) : (
    <Empty
      icon={<Layers />}
      title="Split not found"
      action={
        <Button asChild>
          <Link to="/workouts">Back to workouts</Link>
        </Button>
      }
    >
      This template may have been deleted.
    </Empty>
  );
}
function Editor({ initial, online }: { initial: Split; online: boolean }) {
  const { data, run, refresh, notice } = useApp();
  const [split, setSplit] = useState(() => structuredClone(initial));
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [addTo, setAddTo] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  useEffect(() => {
    if (!dirty) return;
    const before = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, [dirty]);
  const update = (fn: (s: Split) => Split) => {
    setDirty(true);
    setSplit((s) => fn(s));
  };
  const dayUpdate = (dayId: string, fn: (d: SplitDay) => SplitDay) =>
    update((s) => ({ ...s, days: s.days.map((d) => (d.id === dayId ? fn(d) : d)) }));
  const prescription = (dayId: string, eid: string, patch: Partial<Prescription>) =>
    dayUpdate(dayId, (d) => ({
      ...d,
      exercises: d.exercises.map((e) => (e.id === eid ? { ...e, ...patch } : e)),
    }));
  return (
    <>
      <Link className="back-link" to="/workouts">
        <ArrowLeft size={16} />
        All workout splits
      </Link>
      <PageHeading
        title="Edit split"
        action={
          <Button
            disabled={!online || busy || !dirty}
            onClick={async () => {
              setBusy(true);
              await run(async () => {
                const value = splitSchema.parse(split);
                await api(`/splits/${split.id}`, { method: 'PUT', body: JSON.stringify(value) });
                await refresh();
                setDirty(false);
                notice('Your split is saved');
              });
              setBusy(false);
            }}
          >
            <Save size={18} />
            {busy ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
          </Button>
        }
      />
      {dirty && (
        <p className="info-banner">
          You have unsaved template changes. Save before starting a workout.
        </p>
      )}
      <fieldset disabled={!online || busy} className="editor-fieldset">
        <div className="card editor-name">
          <Field label="Split name">
            <input
              value={split.name}
              maxLength={120}
              onChange={(e) => update((s) => ({ ...s, name: e.target.value }))}
            />
          </Field>
        </div>
        <div className="editor-days">
          {split.days.map((d, index) => (
            <section className="card editor-day" key={d.id}>
              <div className="day-edit-heading">
                <span className="day-index">{String(index + 1).padStart(2, '0')}</span>
                <Field label={`Day ${index + 1} name`}>
                  <input
                    value={d.name}
                    maxLength={120}
                    onChange={(e) => dayUpdate(d.id, (d) => ({ ...d, name: e.target.value }))}
                  />
                </Field>
                <div className="reorder-controls">
                  <button
                    aria-label={`Move ${d.name} up`}
                    className="icon-button"
                    disabled={index === 0}
                    onClick={() => update((s) => ({ ...s, days: move(s.days, index, -1) }))}
                  >
                    <ArrowUp size={17} />
                  </button>
                  <button
                    aria-label={`Move ${d.name} down`}
                    className="icon-button"
                    disabled={index === split.days.length - 1}
                    onClick={() => update((s) => ({ ...s, days: move(s.days, index, 1) }))}
                  >
                    <ArrowDown size={17} />
                  </button>
                  <Confirm
                    variant="ghost"
                    disabled={split.days.length === 1}
                    title={`Remove ${d.name}?`}
                    description="The day is removed when you save this split. Workout history stays intact."
                    onConfirm={async () => {
                      update((s) => ({ ...s, days: s.days.filter((x) => x.id !== d.id) }));
                    }}
                  >
                    <Trash2 size={17} />
                    <span className="sr-only">Remove {d.name}</span>
                  </Confirm>
                </div>
              </div>
              <div className="day-options">
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={d.isRest}
                    onChange={(e) => dayUpdate(d.id, (d) => ({ ...d, isRest: e.target.checked }))}
                  />
                  Rest day
                </label>
                {!d.isRest && (
                  <Field label="Optional treadmill target (min)">
                    <input
                      type="number"
                      min="0"
                      max="180"
                      inputMode="numeric"
                      value={d.cardioMinutes}
                      onChange={(e) =>
                        dayUpdate(d.id, (d) => ({ ...d, cardioMinutes: Number(e.target.value) }))
                      }
                    />
                  </Field>
                )}
              </div>
              {d.isRest ? (
                <p className="rest-day-note">
                  <Sun size={19} />
                  Take a breath. Recovery builds strength.{' '}
                  {d.exercises.length > 0
                    ? 'Your exercises are preserved if you switch this back.'
                    : ''}
                </p>
              ) : (
                <>
                  <div className="prescriptions">
                    {d.exercises.map((p, i) => {
                      const exercise = data.exercises.find((e) => e.id === p.exerciseId);
                      return (
                        <details className="prescription" key={p.id}>
                          <summary>
                            <span className="prescription-number">{i + 1}</span>
                            <span>
                              <strong>{exercise?.name ?? 'Unavailable exercise'}</strong>
                              <small>
                                {p.sets} × {p.repMin}–{p.repMax} · {restMinutes(p.restSeconds)} min
                                rest
                              </small>
                            </span>
                            <ChevronDown size={18} />
                          </summary>
                          <div className="prescription-body">
                            <div className="form-grid">
                              <Field label="Working sets">
                                <input
                                  type="number"
                                  min="1"
                                  max="30"
                                  value={p.sets}
                                  onChange={(e) =>
                                    prescription(d.id, p.id, { sets: Number(e.target.value) })
                                  }
                                />
                              </Field>
                              <Field label="Minimum reps">
                                <input
                                  type="number"
                                  min="1"
                                  max="200"
                                  value={p.repMin}
                                  onChange={(e) =>
                                    prescription(d.id, p.id, { repMin: Number(e.target.value) })
                                  }
                                />
                              </Field>
                              <Field label="Maximum reps">
                                <input
                                  type="number"
                                  min="1"
                                  max="200"
                                  value={p.repMax}
                                  onChange={(e) =>
                                    prescription(d.id, p.id, { repMax: Number(e.target.value) })
                                  }
                                />
                              </Field>
                              <Field label="Rest (minutes)">
                                <RestMinutesInput
                                  seconds={p.restSeconds}
                                  onSecondsChange={(seconds) =>
                                    prescription(d.id, p.id, {
                                      restSeconds: seconds,
                                    })
                                  }
                                />
                              </Field>
                              <Field label="Warm-up sets">
                                <input
                                  type="number"
                                  min="0"
                                  max="10"
                                  value={p.warmupSets}
                                  onChange={(e) =>
                                    prescription(d.id, p.id, { warmupSets: Number(e.target.value) })
                                  }
                                />
                              </Field>
                              <Field label="Alternative exercise">
                                <input
                                  value={p.alternative}
                                  maxLength={120}
                                  onChange={(e) =>
                                    prescription(d.id, p.id, { alternative: e.target.value })
                                  }
                                />
                              </Field>
                              <Field label="Alternative rep range">
                                <input
                                  value={p.alternativeReps}
                                  maxLength={40}
                                  onChange={(e) =>
                                    prescription(d.id, p.id, { alternativeReps: e.target.value })
                                  }
                                />
                              </Field>
                            </div>
                            <Field label="Day-specific notes">
                              <textarea
                                value={p.notes}
                                maxLength={4000}
                                onChange={(e) =>
                                  prescription(d.id, p.id, { notes: e.target.value })
                                }
                              />
                            </Field>
                            <div className="row-actions">
                              <Button
                                variant="ghost"
                                disabled={i === 0}
                                onClick={() =>
                                  dayUpdate(d.id, (d) => ({
                                    ...d,
                                    exercises: move(d.exercises, i, -1),
                                  }))
                                }
                              >
                                <ArrowUp size={16} />
                                Up
                              </Button>
                              <Button
                                variant="ghost"
                                disabled={i === d.exercises.length - 1}
                                onClick={() =>
                                  dayUpdate(d.id, (d) => ({
                                    ...d,
                                    exercises: move(d.exercises, i, 1),
                                  }))
                                }
                              >
                                <ArrowDown size={16} />
                                Down
                              </Button>
                              <Confirm
                                variant="ghost"
                                title="Remove exercise?"
                                description="This only removes it from this training day when saved."
                                onConfirm={async () => {
                                  dayUpdate(d.id, (d) => ({
                                    ...d,
                                    exercises: d.exercises.filter((e) => e.id !== p.id),
                                  }));
                                }}
                              >
                                <Trash2 size={16} />
                                Remove
                              </Confirm>
                            </div>
                          </div>
                        </details>
                      );
                    })}
                  </div>
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => {
                      setSearch('');
                      setAddTo(d.id);
                    }}
                  >
                    <Plus size={18} />
                    Add exercise
                  </Button>
                </>
              )}
            </section>
          ))}
        </div>
        <Button
          variant="secondary"
          className="add-day"
          onClick={() =>
            update((s) => ({
              ...s,
              days: [
                ...s.days,
                {
                  id: createId(),
                  name: `Day ${s.days.length + 1}`,
                  isRest: false,
                  cardioMinutes: 0,
                  exercises: [],
                },
              ],
            }))
          }
        >
          <Plus size={18} />
          Add training day
        </Button>
      </fieldset>
      <Dialog
        open={Boolean(addTo)}
        onOpenChange={(v) => {
          if (!v) setAddTo(null);
        }}
        title="Add exercise"
        description="Prescriptions belong to this day. Your exercise library stays independent."
      >
        <label className="search-input">
          <Search size={18} />
          <input
            aria-label="Search exercises"
            placeholder="Search exercise or muscle…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="library-picker">
          {data.exercises
            .filter(
              (e) =>
                !e.archived &&
                `${e.name} ${e.primaryMuscle}`.toLowerCase().includes(search.toLowerCase()),
            )
            .map((e) => (
              <button
                key={e.id}
                onClick={() => {
                  if (addTo)
                    dayUpdate(addTo, (d) => ({
                      ...d,
                      exercises: [
                        ...d.exercises,
                        {
                          id: createId(),
                          exerciseId: e.id,
                          sets: 3,
                          repMin: 8,
                          repMax: 12,
                          restSeconds: data.settings.restSeconds,
                          warmupSets: 0,
                          notes: '',
                          alternative: '',
                          alternativeReps: '',
                        },
                      ],
                    }));
                  setAddTo(null);
                }}
              >
                <span className="icon-tile small-tile">
                  <Dumbbell size={18} />
                </span>
                <span>
                  <strong>{e.name}</strong>
                  <small>
                    {e.primaryMuscle} · {e.equipment}
                  </small>
                </span>
                <Plus size={18} />
              </button>
            ))}
        </div>
        <Button variant="secondary" asChild>
          <Link to="/workouts/library" onClick={() => setAddTo(null)}>
            Manage exercise library
          </Link>
        </Button>
      </Dialog>
    </>
  );
}
export function Library() {
  const { data, online, run, refresh, notice } = useApp();
  const [search, setSearch] = useState('');
  const [muscle, setMuscle] = useState('');
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [secondaryText, setSecondaryText] = useState('');
  const openExercise = (exercise: Exercise) => {
    setEditing(exercise);
    setSecondaryText(exercise.secondaryMuscles.join(', '));
  };
  const [busy, setBusy] = useState(false);
  const filtered = data.exercises.filter(
    (e) =>
      !e.archived &&
      (!muscle || e.primaryMuscle === muscle) &&
      e.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <Link className="back-link" to="/workouts">
        <ArrowLeft size={16} />
        Your workouts
      </Link>
      <PageHeading
        title="Exercise library"
        action={
          <Button
            disabled={!online}
            onClick={() =>
              openExercise({
                id: createId(),
                name: '',
                primaryMuscle: 'Chest',
                secondaryMuscles: [],
                equipment: 'Dumbbell',
                loadMode: 'external',
                notes: '',
                archived: false,
              })
            }
          >
            <Plus size={18} />
            Custom exercise
          </Button>
        }
      />
      <div className="filter-bar">
        <label className="search-input">
          <Search size={18} />
          <input
            aria-label="Search exercise library"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find an exercise…"
          />
        </label>
        <select
          aria-label="Filter muscle group"
          value={muscle}
          onChange={(e) => setMuscle(e.target.value)}
        >
          <option value="">All muscle groups</option>
          {[...new Set(data.exercises.map((e) => e.primaryMuscle))].sort().map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </div>
      <div className="exercise-library">
        {filtered.map((e) => (
          <article className="card library-card" key={e.id}>
            <div className="icon-tile">
              <Dumbbell size={24} />
            </div>
            <div>
              <span className="eyebrow">{e.primaryMuscle}</span>
              <h3>{e.name}</h3>
              <p>
                {e.equipment} · {e.loadMode.replaceAll('-', ' ')}
              </p>
              {e.notes && <p>{e.notes}</p>}
            </div>
            <Button
              variant="secondary"
              disabled={!online}
              onClick={() => openExercise(structuredClone(e))}
            >
              Edit
            </Button>
          </article>
        ))}
      </div>
      {!filtered.length && (
        <Empty icon={<Search />} title="No exercises found">
          Try another name or muscle group.
        </Empty>
      )}
      <Dialog
        open={Boolean(editing)}
        onOpenChange={(v) => {
          if (!v) setEditing(null);
        }}
        title={editing?.name || 'Custom exercise'}
        description="Changes to this definition do not rewrite past workouts."
      >
        {editing && (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              setBusy(true);
              void run(async () => {
                const value = exerciseSchema.parse({
                  ...editing,
                  secondaryMuscles: secondaryText
                    .split(',')
                    .map((v) => v.trim())
                    .filter(Boolean),
                });
                await api(`/exercises/${editing.id}`, {
                  method: 'PUT',
                  body: JSON.stringify(value),
                });
                await refresh();
                setEditing(null);
                notice('Exercise saved');
              }).finally(() => setBusy(false));
            }}
          >
            <Field label="Exercise name">
              <input
                autoFocus
                required
                maxLength={120}
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </Field>
            <div className="form-grid">
              <Field label="Primary muscle">
                <input
                  required
                  maxLength={120}
                  value={editing.primaryMuscle}
                  onChange={(e) => setEditing({ ...editing, primaryMuscle: e.target.value })}
                />
              </Field>
              <Field label="Equipment">
                <select
                  value={editing.equipment}
                  onChange={(e) =>
                    setEditing({ ...editing, equipment: e.target.value as Exercise['equipment'] })
                  }
                >
                  {equipment.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Secondary muscles (comma-separated)">
              <input value={secondaryText} onChange={(e) => setSecondaryText(e.target.value)} />
            </Field>
            <Field
              label="How load is tracked"
              hint="Assistance: less weight means stronger. Bodyweight: compare reps. Weighted bodyweight: added external load."
            >
              <select
                value={editing.loadMode}
                onChange={(e) =>
                  setEditing({ ...editing, loadMode: e.target.value as Exercise['loadMode'] })
                }
              >
                {loadModes.map((m) => (
                  <option key={m} value={m}>
                    {m.replaceAll('-', ' ')}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Exercise notes">
              <textarea
                maxLength={4000}
                value={editing.notes}
                onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
              />
            </Field>
            <div className="dialog-actions">
              <Confirm
                variant="ghost"
                disabled={!data.exercises.some((e) => e.id === editing.id)}
                title="Archive this exercise?"
                description="Existing templates and history keep their references. The exercise is hidden from the add-exercise picker."
                onConfirm={async () => {
                  await api(`/exercises/${editing.id}`, { method: 'DELETE' });
                  await refresh();
                  setEditing(null);
                }}
              >
                <Archive size={17} />
                Archive
              </Confirm>
              <Button type="submit" disabled={busy || !online}>
                {busy ? 'Saving…' : 'Save exercise'}
                <Check size={18} />
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
