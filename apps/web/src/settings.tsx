import { useEffect, useState, useRef } from 'react';
import {
  Download,
  Upload,
  LogOut,
  Volume2,
  Vibrate,
  Bell,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Check,
} from 'lucide-react';
import { backupSchema, settingsSchema, type Settings } from '@gym/shared';
import { useApp } from './context';
import { api, db, download, logout, syncAll } from './lib';
import { Button } from './components/ui/button';
import { Dialog } from './components/ui/dialog';
import { PageHeading, Confirm, Field } from './components/common';
import { RestMinutesInput } from './components/autosave-input';
import { restMinutes } from './rest';
import { useTimer } from './timer';
import { vibrationAvailable, vibrateAlert } from './timer-alerts';
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
const settingsKey = (settings: Settings) =>
  JSON.stringify({
    ...settings,
    restByMuscle: Object.fromEntries(
      Object.entries(settings.restByMuscle).sort(([a], [b]) => a.localeCompare(b)),
    ),
  });
export function SettingsPage() {
  const { data, rows, online, refresh, run, notice } = useApp();
  const { testSound } = useTimer();
  const canVibrate = vibrationAvailable();
  const [settings, setSettings] = useState<Settings>(data.settings);
  const [busy, setBusy] = useState(false);
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [installHelp, setInstallHelp] = useState(false);
  const [backup, setBackup] = useState<ReturnType<typeof backupSchema.parse> | null>(null);
  const previousSettings = useRef(data.settings);
  useEffect(() => {
    const previous = previousSettings.current;
    setSettings((current) =>
      settingsKey(current) === settingsKey(previous)
        ? data.settings
        : { ...current, theme: data.settings.theme },
    );
    previousSettings.current = data.settings;
  }, [data.settings]);
  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setInstall(event as InstallEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);
  const change = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));
  const dirty = settingsKey(settings) !== settingsKey(data.settings);
  const save = async () => {
    setBusy(true);
    await run(async () => {
      await api('/settings', {
        method: 'PUT',
        body: JSON.stringify(settingsSchema.parse(settings)),
      });
      await refresh();
      notice('Preferences saved');
    });
    setBusy(false);
  };
  const exported = () =>
    backupSchema.parse({
      format: 'gym-with-jj',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: data.settings,
      exercises: data.exercises,
      splits: data.splits,
      sessions: rows
        .map((r) => r.data)
        .filter((s) => s.status === 'completed' || s.status === 'abandoned'),
    });
  const exportCSV = () => {
    const cells = (v: unknown) => {
      let text = String(v ?? '');
      if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
      return `"${text.replaceAll('"', '""')}"`;
    };
    const lines = [
      [
        'session_id',
        'started_at_utc',
        'split',
        'day',
        'exercise',
        'load_mode',
        'set',
        'weight_kg',
        'reps',
        'warmup',
        'completed',
        'notes',
      ],
      ...rows
        .filter((r) => r.data.status === 'completed')
        .flatMap((r) =>
          r.data.exercises.flatMap((e) =>
            e.sets.map((s, i) => [
              r.id,
              r.data.startedAt,
              r.data.splitName,
              r.data.dayName,
              e.name,
              e.loadMode,
              i + 1,
              s.weightKg,
              s.reps,
              s.warmup,
              s.completed,
              r.data.notes,
            ]),
          ),
        ),
    ];
    download(
      'gym-with-jj-history.csv',
      '\uFEFF' + lines.map((row) => row.map(cells).join(',')).join('\r\n'),
      'text/csv;charset=utf-8',
    );
  };
  const conflicts = rows.filter((r) => r.conflict);
  const muscles = [
    ...new Set([
      ...data.exercises.map((e) => e.primaryMuscle),
      ...Object.keys(settings.restByMuscle),
    ]),
  ].sort();
  return (
    <>
      <PageHeading
        title="Settings"
        action={
          <Button disabled={!online || !dirty || busy} onClick={() => void save()}>
            <Check size={18} />
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        }
      />
      {!online && (
        <div className="info-banner">
          Preferences and imports need a connection. Workouts still autosave offline.
        </div>
      )}
      <div className="settings-grid">
        <section className="card settings-card">
          <div className="section-title">
            <div>
              <h2>Workout preferences</h2>
            </div>
          </div>
          <fieldset disabled={!online || busy} className="editor-fieldset stack">
            <div className="form-grid">
              <Field label="Weight unit">
                <select
                  value={settings.unit}
                  onChange={(e) => change('unit', e.target.value as Settings['unit'])}
                >
                  <option value="kg">Kilograms (kg)</option>
                  <option value="lb">Pounds (lb)</option>
                </select>
              </Field>
              <Field label="Default set rest (minutes)">
                <RestMinutesInput
                  seconds={settings.restSeconds}
                  onSecondsChange={(seconds) => change('restSeconds', seconds)}
                />
              </Field>
            </div>
            <Field label="Default exercise rest (minutes)">
              <RestMinutesInput
                seconds={settings.exerciseRestSeconds}
                onSecondsChange={(seconds) => change('exerciseRestSeconds', seconds)}
              />
            </Field>
            <Field label="Display timezone">
              <select
                value={settings.timezone}
                onChange={(e) => change('timezone', e.target.value)}
              >
                {[
                  ...new Set([
                    'Asia/Manila',
                    'UTC',
                    Intl.DateTimeFormat().resolvedOptions().timeZone,
                    settings.timezone,
                  ]),
                ].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <div className="setting-toggle">
              <div>
                <Volume2 size={20} />
                <span>
                  <strong>Rest timer sound</strong>
                  <small>Repeat the alarm until dismissed</small>
                </span>
              </div>
              <input
                aria-label="Rest timer sound"
                type="checkbox"
                role="switch"
                checked={settings.sound}
                onChange={(e) => change('sound', e.target.checked)}
              />
            </div>
            <Button
              variant="secondary"
              disabled={!settings.sound}
              onClick={() =>
                void testSound().then((played) => {
                  if (played) notice('Test sound started. If silent, turn up your media volume.');
                })
              }
            >
              Test sound
            </Button>
            <div className="setting-toggle">
              <div>
                <Vibrate size={20} />
                <span>
                  <strong>Vibration</strong>
                  <small>
                    {canVibrate
                      ? 'Vibrate when rest ends'
                      : 'Unavailable in this browser. Use sound alerts.'}
                  </small>
                </span>
              </div>
              <input
                type="checkbox"
                role="switch"
                aria-label="Vibration"
                disabled={!canVibrate}
                checked={canVibrate && settings.vibration}
                onChange={(e) => change('vibration', e.target.checked)}
              />
            </div>
            {canVibrate && (
              <Button
                variant="secondary"
                disabled={!settings.vibration}
                onClick={() => {
                  if (!vibrateAlert()) notice('Vibration was blocked by your browser or device.');
                }}
              >
                Test vibration
              </Button>
            )}
          </fieldset>
        </section>
        <section className="card settings-card settings-wide muscle-rest-settings">
          <h2>Rest by muscle group</h2>
          <p>Overrides apply to new workouts. Exercise rest follows the muscle you just trained.</p>
          <fieldset className="editor-fieldset muscle-rest-list" disabled={!online || busy}>
            {muscles.map((muscle) => {
              const override = settings.restByMuscle[muscle];
              return (
                <div className="muscle-rest-row" key={muscle}>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={Boolean(override)}
                      aria-label={`Use custom rest for ${muscle}`}
                      onChange={(e) => {
                        const next = { ...settings.restByMuscle };
                        if (e.target.checked)
                          next[muscle] = {
                            setSeconds: settings.restSeconds,
                            exerciseSeconds: settings.exerciseRestSeconds,
                          };
                        else delete next[muscle];
                        change('restByMuscle', next);
                      }}
                    />
                    {muscle}
                  </label>
                  {override ? (
                    <div className="muscle-rest-fields">
                      <Field label="Between sets (min)">
                        <RestMinutesInput
                          aria-label={`${muscle} set rest minutes`}
                          seconds={override.setSeconds}
                          onSecondsChange={(seconds) =>
                            change('restByMuscle', {
                              ...settings.restByMuscle,
                              [muscle]: { ...override, setSeconds: seconds },
                            })
                          }
                        />
                      </Field>
                      <Field label="Before next exercise (min)">
                        <RestMinutesInput
                          aria-label={`${muscle} exercise rest minutes`}
                          seconds={override.exerciseSeconds}
                          onSecondsChange={(seconds) =>
                            change('restByMuscle', {
                              ...settings.restByMuscle,
                              [muscle]: { ...override, exerciseSeconds: seconds },
                            })
                          }
                        />
                      </Field>
                    </div>
                  ) : (
                    <span className="muted small">
                      Exercise targets / {restMinutes(settings.exerciseRestSeconds)} min exercise
                      rest
                    </span>
                  )}
                </div>
              );
            })}
          </fieldset>
        </section>
        <section className="card settings-card">
          <div className="section-title">
            <div>
              <h2>Treadmill defaults</h2>
            </div>
          </div>
          <p>
            Used as speed and incline defaults when a day includes a finisher. Training-day duration
            targets take priority.
          </p>
          <fieldset disabled={!online || busy} className="editor-fieldset form-grid">
            <Field label="Duration (minutes)">
              <input
                type="number"
                min="0"
                max="180"
                value={settings.treadmillMinutes}
                onChange={(e) => change('treadmillMinutes', Number(e.target.value))}
              />
            </Field>
            <Field label="Speed (km/h)">
              <input
                type="number"
                min="0"
                max="30"
                step="0.1"
                value={settings.treadmillSpeed}
                onChange={(e) => change('treadmillSpeed', Number(e.target.value))}
              />
            </Field>
            <Field label="Incline (%)">
              <input
                type="number"
                min="0"
                max="40"
                step="0.5"
                value={settings.treadmillIncline}
                onChange={(e) => change('treadmillIncline', Number(e.target.value))}
              />
            </Field>
          </fieldset>
          <div className="settings-tip">
            Cardio is logged separately and doesn’t affect strength-set progress.
          </div>
        </section>
        <section className="card settings-card">
          <div className="section-title">
            <div>
              <h2>Timer & notifications</h2>
            </div>
          </div>
          <p>
            Keep the app in the foreground for reliable timer sounds. Locked phones and suspended
            browsers may delay alerts.
          </p>
          <div className="row-actions">
            <Button
              variant="secondary"
              disabled={!online}
              onClick={() =>
                void run(async () => {
                  if (!('Notification' in window))
                    throw new Error('Notifications are not supported in this browser.');
                  const permission = await Notification.requestPermission();
                  if (permission !== 'granted')
                    throw new Error(
                      'Notifications were not enabled. You can change permission in your browser settings.',
                    );
                  const next = { ...settings, notifications: true };
                  await api('/settings', {
                    method: 'PUT',
                    body: JSON.stringify(settingsSchema.parse(next)),
                  });
                  setSettings(next);
                  await refresh();
                  notice('Rest notifications enabled');
                })
              }
            >
              <Bell size={17} />
              {settings.notifications ? 'Notifications enabled' : 'Enable notifications'}
            </Button>
            {settings.notifications && (
              <Button variant="ghost" onClick={() => change('notifications', false)}>
                Disable
              </Button>
            )}
          </div>
          <p className="small muted">
            Notification permission is requested only when you press the button. Alerts are best
            effort; this app cannot guarantee a background alarm.
          </p>
        </section>
        <section className="card settings-card">
          <div className="section-title">
            <div>
              <h2>Install GYM WITH JJ</h2>
            </div>
          </div>
          <p>Add the app to your home screen.</p>
          <Button
            variant="secondary"
            onClick={() => {
              if (install)
                void install
                  .prompt()
                  .then(() => install.userChoice)
                  .then(() => setInstall(null));
              else setInstallHelp(true);
            }}
          >
            <Download size={17} />
            Install app
          </Button>
          <div className="settings-tip">
            <ShieldCheck size={17} />
            Only app assets are cached. Your API data is never cached by the service worker.
          </div>
        </section>
        <section className="card settings-card settings-wide">
          <div className="section-title">
            <div>
              <h2>Data & backups</h2>
            </div>
          </div>
          <p>
            Export completed and abandoned history to JSON, or strength set history to CSV. Imports
            merge new records and preserve existing records and settings. Active workouts remain on
            this device.
          </p>
          <div className="row-actions">
            <Button
              variant="secondary"
              onClick={() =>
                download('gym-with-jj-backup.json', JSON.stringify(exported(), null, 2))
              }
            >
              <Download size={17} />
              Export JSON
            </Button>
            <Button variant="secondary" onClick={exportCSV}>
              <Download size={17} />
              Export CSV
            </Button>
            <label className={`btn btn-secondary import-button ${!online ? 'disabled' : ''}`}>
              <Upload size={17} />
              Import backup
              <input
                type="file"
                accept=".json,application/json"
                disabled={!online}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file)
                    void run(async () => {
                      if (file.size > 15 * 1024 * 1024)
                        throw new Error('Backup must be smaller than 15 MB');
                      const value = backupSchema.parse(JSON.parse(await file.text()));
                      if (
                        value.sessions.some((s) => s.status === 'active' || s.status === 'paused')
                      )
                        throw new Error('Finish active workouts before importing a backup.');
                      setBackup(value);
                    });
                }}
              />
            </label>
            <Button
              variant="ghost"
              disabled={!online}
              onClick={() =>
                void run(async () => {
                  await syncAll();
                  await refresh();
                  notice('Synchronization checked');
                })
              }
            >
              <RefreshCw size={17} />
              Sync now
            </Button>
          </div>
          <p className="small muted">
            For privacy, store backup files securely. Backups include personal workout notes.
            Completed server sets are protected against stale overwrites.
          </p>
        </section>
        {conflicts.length > 0 && (
          <section className="card settings-card settings-wide conflict-card">
            <div className="section-title">
              <AlertTriangle />
              <h2>Review saved local workouts</h2>
            </div>
            <p>
              A server edit or deletion conflicts with this device. Download the local copy before
              choosing which version to keep.
            </p>
            {conflicts.map((row) => (
              <div className="conflict-row" key={row.id}>
                <div>
                  <strong>{row.data.dayName}</strong>
                  <p>{row.conflict}</p>
                </div>
                <Button
                  variant="secondary"
                  onClick={() =>
                    download(
                      `gym-with-jj-recovery-${row.id}.json`,
                      JSON.stringify(
                        {
                          format: 'gym-with-jj',
                          version: 1,
                          exportedAt: new Date().toISOString(),
                          settings: data.settings,
                          exercises: data.exercises,
                          splits: data.splits,
                          sessions: [row.data],
                        },
                        null,
                        2,
                      ),
                    )
                  }
                >
                  <Download size={17} />
                  Download local copy
                </Button>
                <Confirm
                  variant="destructive"
                  title="Use the server version?"
                  description="This removes the conflicting local version from this device. Download it first if you want to keep it. The server copy remains unchanged."
                  onConfirm={async () => {
                    await db.sessions.delete(row.id);
                    await refresh();
                  }}
                >
                  Use server copy
                </Confirm>
              </div>
            ))}
          </section>
        )}
        <section className="card settings-card settings-wide account-card">
          <div className="section-title">
            <span className="avatar">{data.owner.name.slice(0, 2)}</span>
            <div>
              <h3>{data.owner.name}</h3>
              <p>{data.owner.email} · Private owner account</p>
            </div>
          </div>
          <Confirm
            variant="secondary"
            disabled={!online}
            title="Sign out of your gym?"
            description="Signing out clears personal data from this device. Pending workouts must sync or be resolved first. Your server history stays safe."
            onConfirm={async () => {
              await syncAll();
              if ((await db.sessions.toArray()).some((r) => r.dirty))
                throw new Error(
                  'Some workouts are still pending. Review synchronization before signing out.',
                );
              await logout();
              location.assign('/');
            }}
          >
            <LogOut size={17} />
            Sign out
          </Confirm>
        </section>
      </div>
      <Dialog
        open={installHelp}
        onOpenChange={setInstallHelp}
        title="Install app"
        description="Installation depends on your browser."
      >
        <div className="stack">
          <p>
            <strong>iPhone / iPad:</strong> open in Safari, tap Share, then Add to Home Screen.
          </p>
          <p>
            <strong>Android:</strong> use Chrome’s menu, then Install app or Add to Home screen.
          </p>
          <p>
            <strong>Desktop:</strong> use your browser’s install icon in the address bar. HTTPS is
            required outside localhost.
          </p>
          <p className="muted small">
            Already installed? Launch GYM WITH JJ from your home screen.
          </p>
        </div>
      </Dialog>
      <Dialog
        open={Boolean(backup)}
        onOpenChange={(v) => {
          if (!v) setBackup(null);
        }}
        title="Import this backup?"
        description="Review the contents before merging. Existing records, deleted-session tombstones and preferences will be preserved."
      >
        {backup && (
          <div className="stack">
            <p>
              {backup.sessions.length} history records · {backup.splits.length} splits ·{' '}
              {backup.exercises.length} exercises
            </p>
            <p>Only new IDs are added. This does not overwrite completed workouts.</p>
            <Button
              disabled={busy || !online}
              onClick={async () => {
                setBusy(true);
                await run(async () => {
                  if (rows.some((r) => r.dirty))
                    throw new Error('Sync or resolve pending local workouts before importing.');
                  const result = await api<{ imported: number }>('/backups/import', {
                    method: 'POST',
                    body: JSON.stringify(backup),
                  });
                  await refresh();
                  setBackup(null);
                  notice(`Imported ${result.imported} new workout records`);
                });
                setBusy(false);
              }}
            >
              <Upload size={17} />
              {busy ? 'Importing…' : 'Confirm import'}
            </Button>
          </div>
        )}
      </Dialog>
    </>
  );
}
