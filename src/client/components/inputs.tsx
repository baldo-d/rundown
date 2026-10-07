import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type TextareaHTMLAttributes,
} from 'react';
import { formatClock, formatDuration, parseClock, parseDuration } from '../../shared/time';
import { t } from '../i18n/it';

/**
 * Keeps a local draft while the field is focused and commits on blur / Enter.
 * If the value changes remotely while focused, the field is flagged so the user knows.
 */
function useDraft(value: string) {
  const [draft, setDraft] = useState(value);
  const [focused, setFocused] = useState(false);
  const [conflict, setConflict] = useState(false);
  const initial = useRef(value);

  useEffect(() => {
    if (!focused) {
      setDraft(value);
      setConflict(false);
    } else if (value !== initial.current) {
      setConflict(true);
    }
  }, [value, focused]);

  return {
    draft,
    setDraft,
    conflict,
    onFocus: () => {
      initial.current = value;
      setFocused(true);
    },
    onBlurDone: () => {
      setFocused(false);
      setConflict(false);
    },
  };
}

type TextProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: string;
  onCommit: (value: string) => void;
};

export const TextField = forwardRef<HTMLInputElement, TextProps>(function TextField(
  { value, onCommit, className = '', onKeyDown, onFocus, ...rest },
  ref,
) {
  const d = useDraft(value);
  const commit = () => {
    if (d.draft !== value) onCommit(d.draft);
  };
  return (
    <input
      ref={ref}
      {...rest}
      className={`field ${d.conflict ? 'conflict' : ''} ${className}`}
      title={d.conflict ? t.rundown.remoteChange : rest.title}
      value={d.draft}
      onChange={(e) => d.setDraft(e.target.value)}
      onFocus={(e) => {
        d.onFocus();
        onFocus?.(e);
      }}
      onBlur={() => {
        commit();
        d.onBlurDone();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          (e.target as HTMLInputElement).blur();
        } else if (e.key === 'Escape') {
          d.setDraft(value);
          setTimeout(() => (e.target as HTMLInputElement).blur());
        }
        onKeyDown?.(e);
      }}
    />
  );
});

type AreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string;
  onCommit: (value: string) => void;
};

export function TextArea({ value, onCommit, className = '', ...rest }: AreaProps) {
  const d = useDraft(value);
  return (
    <textarea
      {...rest}
      className={`field ${d.conflict ? 'conflict' : ''} ${className}`}
      value={d.draft}
      onChange={(e) => d.setDraft(e.target.value)}
      onFocus={d.onFocus}
      onBlur={() => {
        if (d.draft !== value) onCommit(d.draft);
        d.onBlurDone();
      }}
      onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Escape') {
          d.setDraft(value);
          setTimeout(() => (e.target as HTMLTextAreaElement).blur());
        }
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) (e.target as HTMLTextAreaElement).blur();
      }}
    />
  );
}

interface ParsedFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: number | null;
  onCommit: (value: number | null) => void;
  /** Allows clearing the field (commits null). */
  nullable?: boolean;
  /** Text shown when value is null. */
  emptyText?: string;
}

function ParsedField({
  value,
  onCommit,
  nullable,
  format,
  parse,
  invalidText,
  className = '',
  emptyText = '',
  ...rest
}: ParsedFieldProps & {
  format: (v: number | null) => string;
  parse: (s: string) => number | null;
  invalidText: string;
}) {
  const shown = value === null ? emptyText : format(value);
  const d = useDraft(shown);
  const [invalid, setInvalid] = useState(false);
  const commit = () => {
    const text = d.draft.trim();
    if (text === shown) return;
    if (!text) {
      if (nullable) onCommit(null);
      else d.setDraft(shown);
      return;
    }
    const parsed = parse(text);
    if (parsed === null) {
      setInvalid(true);
      setTimeout(() => setInvalid(false), 1500);
      d.setDraft(shown);
      return;
    }
    if (parsed !== value) onCommit(parsed);
    else d.setDraft(shown);
  };
  return (
    <input
      {...rest}
      className={`field mono ${invalid ? 'invalid' : ''} ${d.conflict ? 'conflict' : ''} ${className}`}
      title={invalid ? invalidText : rest.title}
      value={d.draft}
      onChange={(e) => d.setDraft(e.target.value)}
      onFocus={(e) => {
        d.onFocus();
        e.target.select();
      }}
      onBlur={() => {
        commit();
        d.onBlurDone();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          d.setDraft(shown);
          setTimeout(() => (e.target as HTMLInputElement).blur());
        }
      }}
    />
  );
}

export function ClockField(props: ParsedFieldProps) {
  return (
    <ParsedField
      placeholder={t.rundown.timeHint}
      {...props}
      format={(v) => formatClock(v)}
      parse={parseClock}
      invalidText={t.rundown.invalidTime}
    />
  );
}

export function DurationField(props: ParsedFieldProps) {
  return (
    <ParsedField
      placeholder={t.rundown.durationHint}
      {...props}
      format={(v) => formatDuration(v)}
      parse={parseDuration}
      invalidText={t.rundown.invalidDuration}
    />
  );
}
