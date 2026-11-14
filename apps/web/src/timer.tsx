import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { Pause, Play, SkipForward, ChevronUp, X, Minus, Plus } from 'lucide-react';
import {
  startTimer,
  pauseTimer,
  resumeTimer,
  timerRemaining,
  timerSchema,
  type TimerState,
} from '@gym/shared';
import { duration } from './lib';
import { useApp } from './context';
import { useNavigate, useLocation } from 'react-router-dom';
import { restMinutes } from './rest';
import { TimerSound, vibrateAlert } from './timer-alerts';
import { Dialog } from './components/ui/dialog';
import { pushChangeEvent, pushSubscriptionId, syncRestPush } from './push';
import { Button } from './components/ui/button';
type TimerContext = {
  start: (
    seconds: number,
    name: string,
    kind?: TimerState['kind'],
    nextExerciseId?: string | null,
  ) => void;
  clear: () => void;
  unlock: () => void;
  testSound: () => Promise<boolean>;
};
const Context = createContext<TimerContext | null>(null);
export const useTimer = () => {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('Missing timer');
  return ctx;
};
export function Ring({
  percent,
  size = 100,
  children,
}: {
  percent: number;
  size?: number;
  children: ReactNode;
}) {
  return (
    <div className="progress-ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle className="ring-track" cx="50" cy="50" r="43" />
        <circle
          className="ring-value"
          cx="50"
          cy="50"
          r="43"
          strokeDasharray={`${Math.max(0, Math.min(100, percent)) * 2.702} 270.2`}
        />
      </svg>
      <div>{children}</div>
    </div>
  );
}
export function TimerProvider({ children }: { children: ReactNode }) {
  const { data, rows, online, notice } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const continueExercise = () => {
    const active = rows.find((r) => ['active', 'paused'].includes(r.data.status));
    if (active && timer?.nextExerciseId)
      navigate(`/session/${active.id}#exercise-${timer.nextExerciseId}`);
    alertSound.stop();
    setTimer(null);
  };
  const [timer, setTimer] = useState<TimerState | null>(() => {
    try {
      const saved = timerSchema.safeParse(JSON.parse(localStorage.getItem('jj-timer') ?? 'null'));
      return saved.success ? saved.data : null;
    } catch {
      return null;
    }
  });
  const [now, setNow] = useState(Date.now());
  const [expanded, setExpanded] = useState(false);
  const [pushVersion, setPushVersion] = useState(0);
  const [pushState, setPushState] = useState<'off' | 'saving' | 'ready' | 'error'>('off');
  const activeSessionId = rows.find((row) => ['active', 'paused'].includes(row.data.status))?.id;
  useEffect(() => {
    const update = () => setPushVersion((value) => value + 1);
    window.addEventListener(pushChangeEvent, update);
    window.addEventListener('online', update);
    const visible = () => {
      if (document.visibilityState === 'visible') update();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener(pushChangeEvent, update);
      window.removeEventListener('online', update);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);
  useEffect(() => {
    // Resuming a suspended page must neither cancel a due alert nor schedule a
    // second one for a rest that has already ended.
    if (timer?.done || (timer?.endAt != null && timer.endAt <= Date.now())) return;
    if (!pushSubscriptionId()) {
      setPushState('off');
      return;
    }
    let disposed = false;
    const running = data.settings.notifications && timer?.endAt != null;
    if (running && (!('Notification' in window) || Notification.permission !== 'granted')) {
      setPushState('error');
      void syncRestPush(null, data.settings.sound, '/').catch(() => {});
      notice(
        'Allow notifications for GYM WITH JJ in your phone Settings to receive Lock Screen alerts.',
      );
      return;
    }
    setPushState('saving');
    void syncRestPush(
      running ? timer : null,
      data.settings.sound,
      activeSessionId ? `/session/${activeSessionId}` : '/',
    )
      .then((scheduled) => {
        if (!disposed) setPushState(scheduled ? 'ready' : 'off');
      })
      .catch(() => {
        if (disposed) return;
        setPushState('error');
        notice(
          running
            ? 'Lock Screen alert could not be scheduled. Keep the app open and check your connection.'
            : 'Could not cancel the Lock Screen alert. It may still arrive; reconnect to clear it.',
        );
      });
    return () => {
      disposed = true;
    };
  }, [
    timer?.endAt,
    timer?.done,
    timer?.exerciseName,
    timer?.kind,
    data.settings.notifications,
    data.settings.sound,
    activeSessionId,
    online,
    pushVersion,
    notice,
  ]);
  const dismissAlarm = () => {
    alertSound.stop();
    setTimer(null);
  };
  const timerElement = useRef<HTMLElement | null>(null);
  const hasTimer = timer !== null && !timer.done && location.pathname.startsWith('/session/');
  useEffect(() => {
    const element = timerElement.current;
    if (!element) return;
    const measure = () =>
      document.documentElement.style.setProperty(
        '--rest-timer-height',
        `${element.getBoundingClientRect().height}px`,
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty('--rest-timer-height');
    };
  }, [hasTimer]);
  const [alertSound] = useState(() => new TimerSound());
  const [soundReady, setSoundReady] = useState(false);
  const unlock = useCallback(() => {
    if (data.settings.sound)
      void alertSound.unlock().then((ready) => {
        if (ready) setSoundReady(true);
      });
  }, [alertSound, data.settings.sound]);
  const playSound = useCallback(
    async (repeat = false) => {
      try {
        await alertSound.play(repeat);
        setSoundReady(true);
        return true;
      } catch {
        setSoundReady(false);
        notice('Timer sound was blocked. Tap Play sound to enable it.');
        return false;
      }
    },
    [alertSound, notice],
  );
  useEffect(() => {
    // Also restore playback permission after a page reload or Safari interruption.
    document.addEventListener('click', unlock);
    document.addEventListener('keydown', unlock);
    return () => {
      document.removeEventListener('click', unlock);
      document.removeEventListener('keydown', unlock);
    };
  }, [unlock]);
  useEffect(() => {
    if (!data.settings.sound) alertSound.stop();
  }, [alertSound, data.settings.sound]);
  useEffect(() => () => alertSound.stop(), [alertSound]);
  useEffect(() => {
    if (timer) localStorage.setItem('jj-timer', JSON.stringify(timer));
    else localStorage.removeItem('jj-timer');
  }, [timer]);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key !== 'jj-timer') return;
      // A dismissal/replacement in another tab must stop this tab's alarm too.
      alertSound.stop();
      try {
        const parsed = timerSchema.safeParse(JSON.parse(event.newValue ?? 'null'));
        setTimer(parsed.success ? parsed.data : null);
      } catch {
        setTimer(null);
      }
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [alertSound]);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const t = setInterval(update, 250);
    document.addEventListener('visibilitychange', update);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  const remaining = timer ? timerRemaining(timer, now) : 0;
  useEffect(() => {
    if (!timer || timer.done || timer.endAt === null || remaining > 0) return;
    setTimer((t) => (t ? { ...t, done: true, endAt: null, remainingMs: 0 } : null));
    const alertId = String(timer.endAt);
    if (localStorage.getItem('jj-timer-alert') === alertId) return;
    localStorage.setItem('jj-timer-alert', alertId);
    // One unsupported channel must never prevent the other alert from firing.
    if (data.settings.vibration) vibrateAlert();
    if (data.settings.sound) void playSound(true);
  }, [remaining, timer, data.settings, playSound, notice]);
  const adjust = (delta: number) =>
    setTimer((t) => {
      if (!t) return null;
      const ms = Math.max(0, timerRemaining(t) + delta * 1000);
      return {
        ...t,
        remainingMs: ms,
        endAt: t.endAt === null ? null : Date.now() + ms,
        durationMs: Math.max(ms, t.durationMs + delta * 1000, 0),
        done: false,
      };
    });
  return (
    <Context.Provider
      value={{
        start: (seconds, name, kind = 'set', nextExerciseId = null) => {
          alertSound.stop();
          unlock();
          setNow(Date.now());
          setTimer(startTimer(seconds, name, Date.now(), kind, nextExerciseId));
          setExpanded(false);
        },
        clear: () => {
          alertSound.stop();
          setTimer(null);
        },
        unlock,
        testSound: () => playSound(),
      }}
    >
      {children}
      <Dialog
        open={Boolean(timer?.done)}
        onOpenChange={(open) => {
          if (!open) dismissAlarm();
        }}
        role="alertdialog"
        className="timer-alarm-dialog"
        dismissOnOutside={false}
        title="Rest complete"
        description={
          timer?.kind === 'exercise' ? 'Your next exercise is ready.' : 'Time for your next set.'
        }
      >
        <div className="timer-alarm-zero" aria-hidden="true">
          00:00
        </div>
        <p className="timer-alarm-exercise">{timer?.exerciseName}</p>
        {data.settings.sound && !soundReady && (
          <Button variant="secondary" onClick={() => void playSound(true)}>
            Play sound
          </Button>
        )}
        <div className="timer-alarm-actions">
          {timer?.kind === 'exercise' && timer.nextExerciseId && (
            <Button onClick={continueExercise}>Next exercise</Button>
          )}
          <Button
            variant={timer?.kind === 'exercise' ? 'secondary' : 'default'}
            onClick={dismissAlarm}
          >
            Dismiss alarm
          </Button>
        </div>
      </Dialog>
      {timer && hasTimer && (
        <aside
          ref={timerElement}
          className={`rest-timer ${timer.done ? 'rest-done' : ''} ${expanded && !timer.done ? 'timer-expanded' : ''}`}
          aria-label="Rest timer"
        >
          <div className="timer-compact-row" data-timer-kind={timer.kind}>
            <Ring
              percent={
                timer.done ? 100 : timer.durationMs ? (remaining / timer.durationMs) * 100 : 0
              }
              size={56}
            >
              <span className="timer-time" role="timer">
                {timer.done ? '✓' : duration(Math.ceil(remaining / 1000) * 1000)}
              </span>
            </Ring>
            <div className="timer-title">
              <strong role={timer.done ? 'status' : undefined}>
                {timer.done
                  ? 'Rest complete'
                  : timer.kind === 'exercise'
                    ? 'Before next exercise'
                    : 'Set rest'}
              </strong>
              <span title={timer.exerciseName}>
                {timer.endAt === null && !timer.done ? 'Paused · ' : ''}
                {timer.exerciseName}
              </span>
            </div>
            {timer.done ? (
              timer.kind === 'exercise' && timer.nextExerciseId ? (
                <button className="timer-continue-button" onClick={continueExercise}>
                  Next exercise
                </button>
              ) : (
                <button
                  className="icon-button"
                  aria-label="Dismiss timer"
                  onClick={() => {
                    alertSound.stop();
                    setTimer(null);
                  }}
                >
                  <X size={20} />
                </button>
              )
            ) : (
              <>
                <button
                  className="icon-button timer-pause-button"
                  aria-label={timer.endAt === null ? 'Resume rest timer' : 'Pause rest timer'}
                  onClick={() => {
                    unlock();
                    setTimer((t) =>
                      t ? (t.endAt === null ? resumeTimer(t) : pauseTimer(t)) : null,
                    );
                  }}
                >
                  {timer.endAt === null ? <Play size={20} /> : <Pause size={20} />}
                </button>
                <button
                  className="icon-button timer-expand-button"
                  aria-label={expanded ? 'Hide timer controls' : 'More timer controls'}
                  aria-expanded={expanded}
                  aria-controls="rest-timer-controls"
                  onClick={() => setExpanded((v) => !v)}
                >
                  <ChevronUp size={21} />
                </button>
              </>
            )}
          </div>
          {data.settings.notifications && !timer.done && (
            <p className="timer-push-status" role="status">
              {pushState === 'error'
                ? 'Lock Screen alert unavailable · check connection'
                : pushState === 'saving'
                  ? 'Updating Lock Screen alert…'
                  : timer.endAt === null
                    ? 'Lock Screen alert paused'
                    : pushState === 'ready'
                      ? 'Lock Screen alert ready'
                      : 'Enable Lock Screen alerts in Settings'}
            </p>
          )}
          {data.settings.sound && !soundReady && (
            <button className="timer-audio-recovery" onClick={() => void playSound()}>
              {timer.done ? 'Play sound' : 'Enable timer sound'}
            </button>
          )}
          {expanded && !timer.done && (
            <div id="rest-timer-controls" className="timer-expanded-panel">
              <div className="timer-controls">
                <button
                  className="icon-button"
                  aria-label="Subtract 0.25 minutes"
                  onClick={() => adjust(-15)}
                >
                  <Minus size={18} />
                  <span>0.25m</span>
                </button>
                <button
                  className="icon-button"
                  aria-label="Add 0.25 minutes"
                  onClick={() => adjust(15)}
                >
                  <Plus size={18} />
                  <span>0.25m</span>
                </button>
                <button
                  className="icon-button timer-skip-button"
                  aria-label="Skip rest"
                  onClick={() => (timer.kind === 'exercise' ? continueExercise() : setTimer(null))}
                >
                  <SkipForward size={18} />
                  <span>Skip rest</span>
                </button>
              </div>
              <label className="timer-duration-field">
                <span>Restart rest timer</span>
                <select
                  aria-label="Change rest duration"
                  value={restMinutes(Math.round(timer.durationMs / 1000))}
                  onChange={(e) => {
                    unlock();
                    const s = Math.round(Number(e.target.value) * 60);
                    setNow(Date.now());
                    setTimer(
                      startTimer(
                        s,
                        timer.exerciseName,
                        Date.now(),
                        timer.kind,
                        timer.nextExerciseId,
                      ),
                    );
                  }}
                >
                  {[...new Set([30, 45, 60, 90, 120, 180, Math.round(timer.durationMs / 1000)])]
                    .sort((a, b) => a - b)
                    .map((s) => (
                      <option key={s} value={restMinutes(s)}>
                        {restMinutes(s)} min
                      </option>
                    ))}
                </select>
              </label>
            </div>
          )}
        </aside>
      )}
    </Context.Provider>
  );
}
