import { useState, type ReactNode } from 'react';
import { Dialog } from './ui/dialog';
import { Button } from './ui/button';

export function PageHeading({
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
      </div>
      {action}
    </header>
  );
}
export function Empty({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Confirm({
  children,
  title,
  description,
  onConfirm,
  variant = 'destructive',
  disabled = false,
  className,
}: {
  children: ReactNode;
  title: string;
  description: string;
  onConfirm: () => Promise<unknown>;
  variant?: 'destructive' | 'secondary' | 'ghost' | 'default';
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <>
      <Button
        className={className}
        variant={variant}
        disabled={disabled}
        onClick={() => {
          setError('');
          setOpen(true);
        }}
      >
        {children}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!busy) setOpen(v);
        }}
        title={title}
        description={description}
      >
        {error && (
          <p role="alert" className="field-error">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                setOpen(false);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Working…' : 'Confirm'}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
