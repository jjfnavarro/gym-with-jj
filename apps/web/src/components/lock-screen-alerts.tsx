import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { startTimer } from '@gym/shared';
import { useApp } from '../context';
import { api } from '../lib';
import { disableRestPush, enableRestPush, pushEnrolled, pushSupport, syncRestPush } from '../push';
import { Button } from './ui/button';

export function LockScreenAlerts({
  onEnabledChange,
}: {
  onEnabledChange: (value: boolean) => void;
}) {
  const { data, online, run, notice, refresh } = useApp();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const support = pushSupport();
  useEffect(() => {
    let disposed = false;
    void pushEnrolled()
      .then((value) => {
        if (!disposed) setEnabled(value);
      })
      .catch(() => {});
    return () => {
      disposed = true;
    };
  }, []);
  const perform = async (action: () => Promise<void>) => {
    setBusy(true);
    await run(action);
    setBusy(false);
  };
  return (
    <section className="card settings-card">
      <div className="section-title">
        <h2>Lock Screen alerts</h2>
      </div>
      <p>
        Get “Rest complete” when your phone is locked. Internet is required; delivery and sound
        follow your phone’s notification settings.
      </p>
      {support === 'install' && (
        <p className="settings-tip">
          On iPhone: open this site in Safari, tap Share → Add to Home Screen, then open GYM WITH JJ
          from its icon.
        </p>
      )}
      {support === 'unsupported' && (
        <p className="settings-tip">
          Push alerts are unavailable in this browser. Keep the app open for timer sounds.
        </p>
      )}
      <div className="row-actions">
        <Button
          variant="secondary"
          disabled={!online || busy || support !== 'supported'}
          onClick={() =>
            void perform(async () => {
              await enableRestPush();
              await api('/settings', {
                method: 'PUT',
                body: JSON.stringify({ ...data.settings, notifications: true }),
              });
              onEnabledChange(true);
              setEnabled(true);
              await refresh();
              notice('Lock Screen alerts enabled on this device. Try a test before your workout.');
            })
          }
        >
          <Bell size={17} />
          {enabled && data.settings.notifications
            ? 'Reconnect alerts'
            : 'Enable Lock Screen alerts'}
        </Button>
        {enabled && data.settings.notifications && (
          <>
            <Button
              variant="secondary"
              disabled={!online || busy}
              onClick={() =>
                void perform(async () => {
                  const timer = JSON.parse(localStorage.getItem('jj-timer') ?? 'null') as {
                    done?: boolean;
                  } | null;
                  if (timer && !timer.done)
                    throw new Error('Finish or skip your current rest before testing alerts.');
                  if (
                    !(await syncRestPush(
                      startTimer(10, 'Test alert'),
                      data.settings.sound,
                      '/',
                      true,
                    ))
                  )
                    throw new Error('Reconnect alerts, then try the test again.');
                  notice('Test scheduled. Lock your phone now; an alert is due in 10 seconds.');
                })
              }
            >
              Test in 10 seconds
            </Button>
            <Button
              variant="ghost"
              disabled={!online || busy}
              onClick={() =>
                void perform(async () => {
                  await disableRestPush();
                  setEnabled(false);
                  notice('Lock Screen alerts disabled on this device.');
                })
              }
            >
              Disable on this device
            </Button>
          </>
        )}
      </div>
      <p className="small muted">
        {enabled && data.settings.notifications
          ? 'Enabled on this device. Push sound follows Rest timer sound above and your iPhone settings.'
          : 'Enable alerts separately on each device. Allow Lock Screen notifications and Sounds in iPhone Settings.'}
      </p>
    </section>
  );
}
