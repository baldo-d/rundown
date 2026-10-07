import { t } from '../i18n/it';

/** Ontime-inspired palette. */
export const PALETTE = [
  '#ff7597',
  '#ff7f5b',
  '#e8a76d',
  '#ffd166',
  '#77c785',
  '#3fb7a4',
  '#5ac8fa',
  '#779be7',
  '#9c88ff',
  '#d17bd8',
  '#5f6b7a',
  '#c7c7c7',
];

interface Props {
  value: string;
  onChange: (color: string) => void;
  allowEmpty?: boolean;
}

export function ColorPicker({ value, onChange, allowEmpty = true }: Props) {
  return (
    <div className="color-picker">
      {allowEmpty && (
        <button
          type="button"
          className={`swatch swatch-none ${value ? '' : 'active'}`}
          title={t.inspector.clearColor}
          aria-label={t.inspector.clearColor}
          onClick={() => onChange('')}
        />
      )}
      {PALETTE.map((c) => (
        <button
          type="button"
          key={c}
          className={`swatch ${value.toLowerCase() === c ? 'active' : ''}`}
          style={{ background: c }}
          title={c}
          aria-label={c}
          onClick={() => onChange(c)}
        />
      ))}
      <label className="swatch swatch-custom" title="Personalizzato">
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff'}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    </div>
  );
}
