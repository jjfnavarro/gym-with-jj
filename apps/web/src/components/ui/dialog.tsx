import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className = '',
  role = 'dialog',
  dismissOnOutside = true,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  role?: 'dialog' | 'alertdialog';
  dismissOnOutside?: boolean;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="dialog-overlay" />
        <D.Content
          className={`dialog-content ${className}`}
          role={role}
          onInteractOutside={(event) => {
            if (!dismissOnOutside) event.preventDefault();
          }}
        >
          <div className="dialog-heading">
            <div>
              <D.Title>{title}</D.Title>
              <D.Description>{description ?? 'Make your changes below.'}</D.Description>
            </div>
            <D.Close className="icon-button" aria-label="Close dialog">
              <X size={20} />
            </D.Close>
          </div>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
