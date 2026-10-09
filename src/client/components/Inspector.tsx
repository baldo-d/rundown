import type { ReactNode } from 'react';
import type { CustomField, Entry, EntryInput, EntryType } from '../../shared/types';
import type { TimelineRow } from '../../shared/timeline';
import { formatClock } from '../../shared/time';
import { t } from '../i18n/it';
import { ColorPicker } from './ColorPicker';
import { Icon } from './Icon';
import { ClockField, DurationField, TextArea, TextField } from './inputs';

interface Props {
  rows: TimelineRow[];
  customFields: CustomField[];
  onPatch: (ids: string[], patch: EntryInput) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
}

/** Right-hand panel with every detail of the selected entry, or batch edits for a multi-selection. */
export function Inspector({ rows, customFields, onPatch, onDuplicate, onDelete, onClose }: Props) {
  if (rows.length === 0) {
    return (
      <aside className="inspector">
        <InspectorHeader title={t.inspector.title} onClose={onClose} />
        <p className="muted">{t.inspector.noSelection}</p>
        <Shortcuts />
      </aside>
    );
  }

  if (rows.length > 1) {
    const ids = rows.map((r) => r.entry.id);
    const entries = rows.map((r) => r.entry);
    const all = (fn: (e: Entry) => boolean) => entries.every(fn);
    return (
      <aside className="inspector">
        <InspectorHeader title={t.inspector.batch} onClose={onClose} />
        <p className="muted">{t.rundown.selected(rows.length)}</p>
        <Field label={t.rundown.color}>
          <ColorPicker
            value={all((e) => e.color === entries[0].color) ? entries[0].color : ''}
            onChange={(color) => onPatch(ids, { color })}
          />
        </Field>
        <div className="toggles">
          <Toggle label={t.rundown.public} checked={all((e) => e.isPublic)} onChange={(v) => onPatch(ids, { isPublic: v })} />
          <Toggle label={t.rundown.skip} checked={all((e) => e.skip)} onChange={(v) => onPatch(ids, { skip: v })} />
        </div>
        {customFields.map((f) => (
          <Field key={f.id} label={`${f.label} (${t.inspector.applyAll.toLowerCase()})`}>
            <TextField
              value={all((e) => (e.custom[f.id] ?? '') === (entries[0].custom[f.id] ?? '')) ? (entries[0].custom[f.id] ?? '') : ''}
              onCommit={(v) => onPatch(ids, { custom: { [f.id]: v } })}
            />
          </Field>
        ))}
        <Actions onDuplicate={onDuplicate} onDelete={onDelete} />
      </aside>
    );
  }

  const row = rows[0];
  const { entry } = row;
  const patch = (p: EntryInput) => onPatch([entry.id], p);

  return (
    <aside className="inspector" key={entry.id}>
      <InspectorHeader title={t.inspector.title} onClose={onClose} />
      <Field label={t.inspector.type}>
        <div className="segmented">
          {(['event', 'block', 'delay'] as EntryType[]).map((type) => (
            <button
              type="button"
              key={type}
              className={entry.type === type ? 'active' : ''}
              onClick={() => entry.type !== type && patch({ type })}
            >
              {t.types[type]}
            </button>
          ))}
        </div>
      </Field>

      {entry.type !== 'delay' && (
        <Field label={t.rundown.title}>
          <TextField value={entry.title} onCommit={(title) => patch({ title })} />
        </Field>
      )}

      {entry.type === 'event' && (
        <>
          <div className="field-row">
            <Field label={t.rundown.cue}>
              <TextField value={entry.cue} onCommit={(cue) => patch({ cue })} />
            </Field>
            <Field label={t.rundown.duration}>
              <DurationField value={entry.duration} onCommit={(v) => patch({ duration: Math.max(0, v ?? 0) })} />
            </Field>
          </div>
          <Field label={t.rundown.start} hint={entry.timeStart === null ? t.rundown.linkedStart : t.rundown.fixedStart}>
            <div className="start-editor">
              <ClockField
                value={entry.timeStart}
                nullable
                emptyText=""
                placeholder={formatClock(row.start)}
                onCommit={(v) => patch({ timeStart: v })}
              />
              <button
                type="button"
                className="btn small"
                onClick={() => patch({ timeStart: entry.timeStart === null ? row.start : null })}
              >
                <Icon name={entry.timeStart === null ? 'lock' : 'link'} />
                {entry.timeStart === null ? t.rundown.fixedStart : t.rundown.linkedStart}
              </button>
            </div>
          </Field>
          <Field label={t.rundown.speakers}>
            <TextField value={entry.speakers} onCommit={(speakers) => patch({ speakers })} />
          </Field>
        </>
      )}

      {entry.type === 'delay' && (
        <Field label={t.types.delay} hint={t.rundown.delayFromHere}>
          <DurationField value={entry.duration} onCommit={(v) => patch({ duration: v ?? 0 })} />
        </Field>
      )}

      {entry.type !== 'delay' && (
        <Field label={t.rundown.color}>
          <ColorPicker value={entry.color} onChange={(color) => patch({ color })} />
        </Field>
      )}

      <div className="toggles">
        {entry.type === 'event' && (
          <Toggle label={t.rundown.public} checked={entry.isPublic} onChange={(v) => patch({ isPublic: v })} />
        )}
        {entry.type !== 'block' && (
          <Toggle label={t.rundown.skip} checked={entry.skip} onChange={(v) => patch({ skip: v })} />
        )}
      </div>

      <Field label={t.rundown.note}>
        <TextArea rows={5} value={entry.note} onCommit={(note) => patch({ note })} />
      </Field>

      {entry.type === 'event' && customFields.length > 0 && (
        <>
          <h3>{t.inspector.customFields}</h3>
          {customFields.map((f) => (
            <Field
              key={f.id}
              label={
                <>
                  <span className="dot" style={{ background: f.color }} />
                  {f.label}
                </>
              }
            >
              <TextArea rows={2} value={entry.custom[f.id] ?? ''} onCommit={(v) => patch({ custom: { [f.id]: v } })} />
            </Field>
          ))}
        </>
      )}

      <Actions onDuplicate={onDuplicate} onDelete={onDelete} />
    </aside>
  );
}

function InspectorHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="inspector-header">
      <h2>{title}</h2>
      <button type="button" className="icon-btn" aria-label={t.inspector.close} title={`${t.inspector.close} (I)`} onClick={onClose}>
        <Icon name="close" />
      </button>
    </div>
  );
}

function Field({ label, hint, children }: { label: ReactNode; hint?: string; children: ReactNode }) {
  return (
    <div className="ins-field">
      <span className="ins-label">
        {label}
        {hint && <span className="ins-hint">{hint}</span>}
      </span>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" />
      {label}
    </label>
  );
}

function Actions({ onDuplicate, onDelete }: { onDuplicate: () => void; onDelete: () => void }) {
  return (
    <div className="ins-actions">
      <button type="button" className="btn" onClick={onDuplicate}>
        <Icon name="copy" /> {t.rundown.duplicate}
      </button>
      <button type="button" className="btn danger" onClick={onDelete}>
        <Icon name="trash" /> {t.rundown.delete}
      </button>
    </div>
  );
}

function Shortcuts() {
  return (
    <div className="shortcuts">
      <h3>{t.rundown.shortcuts}</h3>
      <dl>
        {t.rundown.shortcutList.map(([k, v]) => (
          <div key={k}>
            <dt>
              <kbd>{k}</kbd>
            </dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
