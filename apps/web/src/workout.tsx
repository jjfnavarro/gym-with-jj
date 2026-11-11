import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Pause,
  Play,
  Plus,
  Trash2,
  Timer,
  SkipForward,
  Dumbbell,
  Flag,
  CloudCheck,
  CloudUpload,
  Footprints,
  Undo2,
  SlidersHorizontal,
} from 'lucide-react';
import {
  workoutProgress,
  createId,
  restAfterSet,
  elapsedMs,
  toDisplayWeight,
  toKg,
  type Session,
  type SessionExercise,
  type WorkoutSet,
} from '@gym/shared';
import { useApp } from './context';
import { updateLocal, duration, displayDate } from './lib';
import { useTimer, Ring } from './timer';
import { Button } from './components/ui/button';
import { Confirm, Empty, Field } from './components/common';
import { NumberInput, RestMinutesInput, AutosaveTextarea } from './components/autosave-input';
import { restMinutes } from './rest';
export function LiveWorkout() {
  const { id } = useParams();
  const { rows, data, run, notice } = useApp();
  const row = rows.find((r) => r.id === id);
  const navigate = useNavigate();
  const { hash } = useLocation();
  useEffect(() => {
    if (hash && row)
      document.getElementById(hash.slice(1))?.scrollIntoView({
        block: 'start',
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
  }, [hash, row?.id]);
  const timer = useTimer();
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const [editingSets, setEditingSets] = useState<Set<string>>(() => new Set());
  const setLocks = useRef(new Set<string>());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!row)
    return (
      <Empty
        icon={<Dumbbell />}
        title="Workout not found"
        action={
          <Button asChild>
            <Link to="/">Back home</Link>
          </Button>
        }
      >
        This workout isn’t saved on this device yet.
      </Empty>
    );
  const session = row.data;
  if (session.status === 'completed' || session.status === 'abandoned')
    return (
      <Empty
        icon={<Check />}
        title={session.status === 'completed' ? 'Workout completed' : 'Workout ended'}
        action={
          <Button asChild>
            <Link to={session.status === 'completed' ? `/history/${session.id}` : '/'}>
              View {session.status === 'completed' ? 'summary' : 'home'}
            </Link>
          </Button>
        }
      >
        View the saved workout or return Home.
      </Empty>
    );
  const progress = workoutProgress(session);
  const finishDescription = `You logged ${progress.completed} of ${progress.total} working sets. ${progress.completed < progress.total ? 'Incomplete sets stay incomplete. ' : ''}Your results and notes will be saved to history.`;
  const edit = (fn: (s: Session) => Session) => run(() => updateLocal(session.id, fn));
  const editExercise = (eid: string, fn: (e: SessionExercise) => SessionExercise) =>
    edit((s) => ({ ...s, exercises: s.exercises.map((e) => (e.id === eid ? fn(e) : e)) }));
  const editSet = (eid: string, sid: string, patch: Partial<WorkoutSet>) =>
    editExercise(eid, (e) => ({
      ...e,
      sets: e.sets.map((s) => (s.id === sid ? { ...s, ...patch } : s)),
    }));
  const finish = async () => {
    await updateLocal(session.id, (s) => ({
      ...s,
      status: 'completed',
      finishedAt: new Date().toISOString(),
      pausedAt: null,
      pausedMs: s.pausedMs + (s.pausedAt ? Date.now() - Date.parse(s.pausedAt) : 0),
    }));
    timer.clear();
    navigate(`/history/${session.id}?finished=1`);
  };
  const previousFor = (exercise: SessionExercise) =>
    rows
      .map((r) => r.data)
      .filter((s) => s.status === 'completed' && s.startedAt < session.startedAt)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .flatMap((s) => s.exercises)
      .find(
        (e) =>
          e.exerciseId === exercise.exerciseId && e.loadMode === exercise.loadMode && !e.skipped,
      );
  return (
    <>
      <Link className="back-link" to="/">
        <ArrowLeft size={16} />
        Home
      </Link>
      <section className="workout-header">
        <div>
          <h1>{session.dayName}</h1>
          <p>{session.splitName}</p>
          <div className="workout-meta">
            <span>
              <Timer size={16} />
              <time>{duration(elapsedMs(session, now))}</time>
            </span>
            <span>
              Started{' '}
              {displayDate(session.startedAt, data.settings.timezone, {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            <span>
              {row.dirty ? <CloudUpload size={16} /> : <CloudCheck size={16} />}{' '}
              {row.dirty ? 'Saved locally' : 'Synced'}
            </span>
          </div>
        </div>
        <Ring percent={progress.percent} size={112}>
          <strong className="big-percent">
            {progress.percent}
            <small>%</small>
          </strong>
          <span className="ring-caption">COMPLETE</span>
        </Ring>
      </section>
      <div className="live-toolbar">
        <div className="live-progress-info">
          <span>
            <strong>{progress.completed}</strong> of {progress.total} working sets
          </span>
          <div
            className="live-progress-track"
            role="progressbar"
            aria-label="Workout completion"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.percent}
          >
            <span style={{ width: `${progress.percent}%` }} />
          </div>
        </div>
        <div className="live-toolbar-actions">
          <Button
            variant="secondary"
            className="session-pause-button"
            aria-label={session.status === 'paused' ? 'Resume session' : 'Pause session'}
            onClick={() =>
              void edit((s) =>
                s.status === 'paused'
                  ? {
                      ...s,
                      status: 'active',
                      pausedMs: s.pausedMs + Date.now() - Date.parse(s.pausedAt!),
                      pausedAt: null,
                    }
                  : { ...s, status: 'paused', pausedAt: new Date().toISOString() },
              )
            }
          >
            {session.status === 'paused' ? <Play size={17} /> : <Pause size={17} />}{' '}
            <span>{session.status === 'paused' ? 'Resume session' : 'Pause session'}</span>
          </Button>
          <Confirm
            className="live-finish-button"
            variant="default"
            title="Finish your workout?"
            description={finishDescription}
            onConfirm={finish}
          >
            <Flag size={17} />
            <span>Finish</span>
          </Confirm>
        </div>
      </div>
      {session.status === 'paused' && (
        <div className="info-banner">
          Workout paused. Resume to continue logging sets. Your rest timer is controlled separately.
        </div>
      )}
      {error && (
        <p role="alert" className="field-error error-banner">
          {error}
        </p>
      )}
      {progress.percent === 100 && (
        <div className="success-banner">
          <Check size={20} />
          All working sets completed.
        </div>
      )}
      <div className="live-exercises">
        {session.exercises.map((exercise, index) => {
          const previous = previousFor(exercise);
          const done =
            exercise.sets.filter((s) => !s.warmup).every((s) => s.completed) &&
            exercise.sets.some((s) => !s.warmup);
          let workingIndex = 0;
          return (
            <section
              key={exercise.id}
              id={`exercise-${exercise.id}`}
              className={`card live-exercise ${exercise.skipped ? 'skipped' : ''} ${done ? 'exercise-done' : ''}`}
              data-editing-sets={editingSets.has(exercise.id)}
            >
              <div className="exercise-heading">
                <span className={`exercise-number ${done ? 'done' : ''}`}>
                  {done ? <Check size={20} /> : String(index + 1).padStart(2, '0')}
                </span>
                <div>
                  <span className="eyebrow">
                    {exercise.primaryMuscle} · {exercise.equipment}
                  </span>
                  <h2>{exercise.name}</h2>
                  <p>
                    Target: {exercise.sets.filter((s) => !s.warmup).length} sets × {exercise.repMin}
                    –{exercise.repMax} reps{' '}
                    <span className="target-rest">
                      <Timer size={13} />
                      {restMinutes(exercise.restSeconds)} min rest
                    </span>
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={session.status === 'paused'}
                  aria-label={
                    exercise.skipped ? `Restore ${exercise.name}` : `Skip ${exercise.name}`
                  }
                  onClick={() =>
                    void editExercise(exercise.id, (e) => ({ ...e, skipped: !e.skipped }))
                  }
                >
                  {exercise.skipped ? <Undo2 size={19} /> : <SkipForward size={19} />}
                </Button>
              </div>
              {exercise.notes && <p className="exercise-note">{exercise.notes}</p>}
              {exercise.alternative && (
                <p className="exercise-alternative">Alternative: {exercise.alternative}</p>
              )}
              {exercise.loadMode !== 'external' && (
                <p className="load-mode-note">
                  {exercise.loadMode === 'assistance'
                    ? 'Log assistance weight. Less assistance = stronger.'
                    : exercise.loadMode === 'weighted-bodyweight'
                      ? 'Log added external load only. Bodyweight is not included.'
                      : 'Bodyweight movement. Track reps; external load stays at zero.'}
                </p>
              )}
              {exercise.skipped ? (
                <div className="skipped-note">
                  Skipped. Restore to include it in workout progress.
                </div>
              ) : (
                <>
                  <div className="set-table" role="group" aria-label={`${exercise.name} sets`}>
                    <div className="set-table-heading">
                      <span>SET</span>
                      <span>PREVIOUS</span>
                      <span>
                        {exercise.loadMode === 'assistance' ? 'ASSIST' : 'WEIGHT'} (
                        {session.unit.toUpperCase()})
                      </span>
                      <span>REPS</span>
                      <span>DONE</span>
                      <span />
                    </div>
                    {exercise.sets.map((set, setIndex) => {
                      const previousSet = previous?.sets.filter((s) => !s.warmup && s.completed)[
                        workingIndex
                      ];
                      const label = set.warmup ? 'W' : String(++workingIndex);
                      return (
                        <div
                          className={`set-row ${set.completed ? 'set-completed' : ''}`}
                          key={set.id}
                        >
                          <span
                            className="set-label"
                            title={set.warmup ? 'Warm-up set' : `Working set ${label}`}
                          >
                            {label}
                          </span>
                          <span className="previous-value">
                            {previousSet
                              ? `${toDisplayWeight(previousSet.weightKg, session.unit)} × ${previousSet.reps}`
                              : '—'}
                          </span>
                          <NumberInput
                            type="number"
                            inputMode="decimal"
                            step="0.1"
                            min="0"
                            max={toDisplayWeight(2000, session.unit)}
                            aria-label={`${exercise.name} set ${setIndex + 1} weight`}
                            disabled={
                              session.status === 'paused' || exercise.loadMode === 'bodyweight'
                            }
                            value={toDisplayWeight(set.weightKg, session.unit)}
                            placeholder="0"
                            onValueChange={(value) =>
                              void editSet(exercise.id, set.id, {
                                weightKg: toKg(value, session.unit),
                              })
                            }
                          />
                          <NumberInput
                            type="number"
                            inputMode="numeric"
                            min="0"
                            max="500"
                            step="1"
                            aria-label={`${exercise.name} set ${setIndex + 1} reps`}
                            disabled={session.status === 'paused'}
                            value={set.reps}
                            placeholder="0"
                            onValueChange={(value) =>
                              void editSet(exercise.id, set.id, { reps: value })
                            }
                          />
                          <button
                            className={`set-check ${set.completed ? 'checked' : ''}`}
                            disabled={session.status === 'paused'}
                            aria-label={`${set.completed ? 'Undo' : 'Complete'} ${exercise.name} set ${setIndex + 1}`}
                            aria-pressed={set.completed}
                            onClick={async () => {
                              if (setLocks.current.has(set.id)) return;
                              setLocks.current.add(set.id);
                              timer.unlock();
                              try {
                                setError('');
                                const completing = !set.completed;
                                const saved = await updateLocal(session.id, (s) => ({
                                  ...s,
                                  exercises: s.exercises.map((e) =>
                                    e.id === exercise.id
                                      ? {
                                          ...e,
                                          sets: e.sets.map((x) =>
                                            x.id === set.id ? { ...x, completed: completing } : x,
                                          ),
                                        }
                                      : e,
                                  ),
                                }));
                                if (completing) {
                                  const rest = restAfterSet(saved, exercise.id, set.id);
                                  if (rest)
                                    timer.start(
                                      rest.seconds,
                                      rest.name,
                                      rest.kind,
                                      rest.nextExerciseId,
                                    );
                                } else timer.clear();
                              } catch (e) {
                                setError(
                                  (e as Error).message.includes('reps')
                                    ? 'Enter at least one rep before completing this set.'
                                    : (e as Error).message,
                                );
                              } finally {
                                setLocks.current.delete(set.id);
                              }
                            }}
                          >
                            <Check size={22} />
                          </button>
                          <Confirm
                            className="remove-set"
                            variant="ghost"
                            title="Remove this set?"
                            description="This removes the set and its entered values, and updates workout progress. Completed sets must be undone first."
                            disabled={set.completed || session.status === 'paused'}
                            onConfirm={() =>
                              updateLocal(session.id, (s) => ({
                                ...s,
                                exercises: s.exercises.map((e) =>
                                  e.id === exercise.id
                                    ? { ...e, sets: e.sets.filter((x) => x.id !== set.id) }
                                    : e,
                                ),
                              }))
                            }
                          >
                            <Trash2 size={15} />
                            <span className="sr-only">{`Remove ${exercise.name} set ${setIndex + 1}`}</span>
                          </Confirm>
                        </div>
                      );
                    })}
                  </div>
                  <div className="exercise-bottom">
                    <div className="add-set-buttons">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="add-working-set-button"
                        disabled={session.status === 'paused' || exercise.sets.length >= 50}
                        onClick={() =>
                          void editExercise(exercise.id, (e) => ({
                            ...e,
                            sets: [
                              ...e.sets,
                              {
                                id: createId(),
                                weightKg: e.sets.at(-1)?.weightKg ?? 0,
                                reps: exercise.repMin,
                                completed: false,
                                warmup: false,
                              },
                            ],
                          }))
                        }
                      >
                        <Plus size={16} />
                        Add set
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="warmup-set-button"
                        disabled={session.status === 'paused' || exercise.sets.length >= 50}
                        onClick={() =>
                          void editExercise(exercise.id, (e) => ({
                            ...e,
                            sets: [
                              ...e.sets,
                              {
                                id: createId(),
                                weightKg: 0,
                                reps: exercise.repMin,
                                completed: false,
                                warmup: true,
                              },
                            ],
                          }))
                        }
                      >
                        <Plus size={15} />
                        Warm-up
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="manage-sets-button"
                        aria-label={`${editingSets.has(exercise.id) ? 'Done editing' : 'Edit sets for'} ${exercise.name}`}
                        aria-pressed={editingSets.has(exercise.id)}
                        onClick={() =>
                          setEditingSets((current) => {
                            const next = new Set(current);
                            if (next.has(exercise.id)) next.delete(exercise.id);
                            else next.add(exercise.id);
                            return next;
                          })
                        }
                      >
                        <SlidersHorizontal size={16} />
                        <span>{editingSets.has(exercise.id) ? 'Done editing' : 'Edit sets'}</span>
                      </Button>
                    </div>
                    <label className="inline-rest">
                      <Timer size={15} />
                      <span className="inline-rest-label">Between sets</span>
                      <RestMinutesInput
                        aria-label={`Rest minutes for ${exercise.name}`}
                        disabled={session.status === 'paused'}
                        seconds={exercise.restSeconds}
                        onSecondsChange={(value) =>
                          void editExercise(exercise.id, (x) => ({
                            ...x,
                            restSeconds: value,
                          }))
                        }
                      />
                      min{' '}
                      <button
                        className="icon-button"
                        aria-label={`Start rest for ${exercise.name}`}
                        onClick={() => timer.start(exercise.restSeconds, exercise.name)}
                      >
                        <Play size={15} />
                      </button>
                    </label>
                    <label className="inline-rest">
                      <span className="inline-rest-label">Before next exercise</span>
                      <RestMinutesInput
                        aria-label={`Exercise rest minutes for ${exercise.name}`}
                        disabled={session.status === 'paused'}
                        seconds={exercise.exerciseRestSeconds}
                        onSecondsChange={(value) =>
                          void editExercise(exercise.id, (e) => ({
                            ...e,
                            exerciseRestSeconds: value,
                          }))
                        }
                      />
                      min
                    </label>
                  </div>
                </>
              )}
            </section>
          );
        })}
      </div>
      {session.exercises.length === 0 && (
        <Empty icon={<Dumbbell />} title="An open training day">
          You can finish this workout, or end it and add exercises to your split.
        </Empty>
      )}
      {session.cardio.map((cardio) => (
        <section className="card cardio-card" key={cardio.id}>
          <div className="section-heading">
            <div className="section-title">
              <span className="icon-tile peach">
                <Footprints size={23} />
              </span>
              <div>
                <h2>Treadmill time</h2>
              </div>
            </div>
            <span className="pill neutral-pill">Separate from sets</span>
          </div>
          <div className="form-grid cardio-fields">
            <Field label="Duration (min)">
              <NumberInput
                type="number"
                inputMode="decimal"
                min="0"
                max="600"
                value={cardio.durationMinutes}
                disabled={session.status === 'paused'}
                onValueChange={(value) =>
                  void edit((s) => ({
                    ...s,
                    cardio: s.cardio.map((c) =>
                      c.id === cardio.id ? { ...c, durationMinutes: value } : c,
                    ),
                  }))
                }
              />
            </Field>
            <Field label="Speed (km/h)">
              <NumberInput
                type="number"
                inputMode="decimal"
                min="0"
                max="40"
                step="0.1"
                value={cardio.speedKph}
                disabled={session.status === 'paused'}
                onValueChange={(value) =>
                  void edit((s) => ({
                    ...s,
                    cardio: s.cardio.map((c) =>
                      c.id === cardio.id ? { ...c, speedKph: value } : c,
                    ),
                  }))
                }
              />
            </Field>
            <Field label="Incline (%)">
              <NumberInput
                type="number"
                inputMode="decimal"
                min="0"
                max="50"
                step="0.5"
                value={cardio.incline}
                disabled={session.status === 'paused'}
                onValueChange={(value) =>
                  void edit((s) => ({
                    ...s,
                    cardio: s.cardio.map((c) =>
                      c.id === cardio.id ? { ...c, incline: value } : c,
                    ),
                  }))
                }
              />
            </Field>
          </div>
          <label className="check-label finisher-complete">
            <input
              type="checkbox"
              checked={cardio.completed}
              disabled={session.status === 'paused'}
              onChange={(event) => {
                // React restores controlled inputs before the asynchronous DB
                // transaction runs. Capture the user's choice during the tap.
                const completed = event.currentTarget.checked;
                void edit((s) => ({
                  ...s,
                  cardio: s.cardio.map((c) => (c.id === cardio.id ? { ...c, completed } : c)),
                }));
              }}
            />
            Finisher complete
          </label>
        </section>
      ))}
      {session.cardio.length === 0 && (
        <Button
          variant="secondary"
          className="add-day"
          disabled={session.status === 'paused'}
          onClick={() =>
            void edit((s) => ({
              ...s,
              cardio: [
                {
                  id: createId(),
                  durationMinutes: data.settings.treadmillMinutes,
                  speedKph: data.settings.treadmillSpeed,
                  incline: data.settings.treadmillIncline,
                  completed: false,
                },
              ],
            }))
          }
        >
          <Plus size={18} />
          Add optional treadmill finisher
        </Button>
      )}
      <section className="card workout-notes">
        <Field label="Workout notes" hint="Saved automatically.">
          <AutosaveTextarea
            value={session.notes}
            maxLength={4000}
            placeholder="Notes about this workout"
            onValueChange={(value) => void edit((s) => ({ ...s, notes: value }))}
          />
        </Field>
      </section>
      <div className="finish-actions">
        <Confirm
          variant="ghost"
          title="End without finishing?"
          description="This workout will be marked abandoned and won’t appear in completed history. This cannot be undone."
          onConfirm={async () => {
            await updateLocal(session.id, (s) => ({ ...s, status: 'abandoned', pausedAt: null }));
            timer.clear();
            navigate('/');
          }}
        >
          End session
        </Confirm>
        <Confirm
          variant="default"
          title="Finish your workout?"
          description={finishDescription}
          onConfirm={finish}
        >
          <Flag size={18} />
          Finish workout
        </Confirm>
      </div>
      <p className="workout-guidance">
        Warm-up and skipped exercises don’t count toward progress. Undo a completed set before
        removing it. Keep the app in the foreground for reliable timer alerts.
      </p>
    </>
  );
}
