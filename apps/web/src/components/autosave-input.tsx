import {
  useEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { restMinutes } from '../rest';

export function RestMinutesInput({
  seconds,
  onSecondsChange,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  seconds: number;
  onSecondsChange: (seconds: number) => void;
}) {
  return (
    <NumberInput
      {...props}
      min="0"
      max="60"
      step="any"
      inputMode="decimal"
      value={restMinutes(seconds)}
      onValueChange={(minutes) => onSecondsChange(Math.round(minutes * 60))}
    />
  );
}

function useInputDraft(value: string) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);
  return {
    draft,
    setDraft,
    onFocus: () => {
      focused.current = true;
    },
    onBlur: () => {
      focused.current = false;
      setDraft(value);
    },
  };
}

// A focused field owns its draft. IndexedDB notifications may acknowledge older
// keystrokes while newer ones are already being persisted in another transaction.
export function NumberInput({
  value,
  onValueChange,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onFocus' | 'onBlur'> & {
  value: number;
  onValueChange: (value: number) => void;
}) {
  const input = useInputDraft(value ? String(value) : '');
  return (
    <input
      {...props}
      type="number"
      value={input.draft}
      onFocus={input.onFocus}
      onBlur={input.onBlur}
      onChange={(event) => {
        const next = event.target.value;
        input.setDraft(next);
        const numeric = next === '' ? 0 : Number(next);
        if (Number.isFinite(numeric)) onValueChange(numeric);
      }}
    />
  );
}

export function AutosaveTextarea({
  value,
  onValueChange,
  ...props
}: Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'value' | 'onChange' | 'onFocus' | 'onBlur'
> & { value: string; onValueChange: (value: string) => void }) {
  const input = useInputDraft(value);
  return (
    <textarea
      {...props}
      value={input.draft}
      onFocus={input.onFocus}
      onBlur={input.onBlur}
      onChange={(event) => {
        input.setDraft(event.target.value);
        onValueChange(event.target.value);
      }}
    />
  );
}
