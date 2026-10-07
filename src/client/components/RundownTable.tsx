import { memo, type CSSProperties, type MouseEvent, type ReactElement } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { CustomField, EntryInput } from '../../shared/types';
import type { Timeline, TimelineRow } from '../../shared/timeline';
import { formatClock, formatDuration, isNextDay } from '../../shared/time';
import { t } from '../i18n/it';
import { ClockField, DurationField, TextField } from './inputs';
import { Icon } from './Icon';

export interface ColumnVisibility {
  cue: boolean;
  end: boolean;
  speakers: boolean;
  note: boolean;
  custom: Record<string, boolean>;
}

export const DEFAULT_COLUMNS: ColumnVisibility = { cue: true, end: true, speakers: true, note: true, custom: {} };

interface Props {
  timeline: Timeline;
  customFields: CustomField[];
  columns: ColumnVisibility;
  selection: Set<string>;
  onRowClick: (id: string, e: MouseEvent) => void;
  onFocusRow: (id: string) => void;
  onPatch: (id: string, patch: EntryInput) => void;
  onReorder: (ids: string[]) => void;
}

/** Builds the CSS grid template shared by the header and every row. */
export function gridTemplate(columns: ColumnVisibility, customFields: CustomField[]) {
  const parts = ['24px'];
  if (columns.cue) parts.push('52px');
  parts.push('100px'); // start
  if (columns.end) parts.push('64px');
  parts.push('80px'); // duration
  parts.push('minmax(170px, 2fr)');
  if (columns.speakers) parts.push('minmax(120px, 1.2fr)');
  if (columns.note) parts.push('minmax(120px, 1.2fr)');
  for (const f of customFields) if (columns.custom[f.id] !== false) parts.push('minmax(100px, 1fr)');
  return parts.join(' ');
}

export function RundownTable({
  timeline,
  customFields,
  columns,
  selection,
  onRowClick,
  onFocusRow,
  onPatch,
  onReorder,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = timeline.rows.map((r) => r.entry.id);
  const visibleCustom = customFields.filter((f) => columns.custom[f.id] !== false);
  const style = { '--grid': gridTemplate(columns, customFields) } as CSSProperties;

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    onReorder(arrayMove(ids, from, to));
  };

  return (
    <div className="rundown-table" style={style} role="table">
      <div className="rt-row rt-header" role="row">
        <div />
        {columns.cue && <div>{t.rundown.cue}</div>}
        <div>{t.rundown.start}</div>
        {columns.end && <div>{t.rundown.end}</div>}
        <div>{t.rundown.duration}</div>
        <div>{t.rundown.title}</div>
        {columns.speakers && <div>{t.rundown.speakers}</div>}
        {columns.note && <div>{t.rundown.note}</div>}
        {visibleCustom.map((f) => (
          <div key={f.id}>
            <span className="dot" style={{ background: f.color }} />
            {f.label}
          </div>
        ))}
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {timeline.rows.map((row) => (
            <SortableRow
              key={row.entry.id}
              row={row}
              selected={selection.has(row.entry.id)}
              columns={columns}
              customFields={visibleCustom}
              onRowClick={onRowClick}
              onFocusRow={onFocusRow}
              onPatch={onPatch}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}

interface RowProps {
  row: TimelineRow;
  selected: boolean;
  columns: ColumnVisibility;
  customFields: CustomField[];
  onRowClick: (id: string, e: MouseEvent) => void;
  onFocusRow: (id: string) => void;
  onPatch: (id: string, patch: EntryInput) => void;
}

const SortableRow = memo(function SortableRow(props: RowProps) {
  const { row, selected, onRowClick, onFocusRow } = props;
  const { entry } = row;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 5 : undefined,
    '--entry-color': entry.color || 'transparent',
  } as CSSProperties;

  const handle = (
    <button
      type="button"
      className="rt-handle"
      aria-label="Trascina per spostare"
      {...attributes}
      {...listeners}
      tabIndex={-1}
    >
      <Icon name="grip" />
    </button>
  );

  const className = [
    'rt-item',
    `rt-${entry.type}`,
    selected ? 'selected' : '',
    entry.skip ? 'skipped' : '',
    isDragging ? 'dragging' : '',
  ].join(' ');

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={className}
      data-entry-id={entry.id}
      onMouseDown={(e) => {
        const target = e.target as HTMLElement;
        if (!target.closest('input, textarea, button, select')) onRowClick(entry.id, e);
      }}
      onFocus={() => onFocusRow(entry.id)}
    >
      {entry.type === 'event' && row.gap !== null && <GapNotice gap={row.gap} />}
      {entry.type === 'block' && <BlockRow {...props} handle={handle} />}
      {entry.type === 'delay' && <DelayRow {...props} handle={handle} />}
      {entry.type === 'event' && <EventRow {...props} handle={handle} />}
    </div>
  );
});

function GapNotice({ gap }: { gap: number }) {
  const overlap = gap < 0;
  return (
    <div className={`rt-gap ${overlap ? 'overlap' : ''}`}>
      <Icon name={overlap ? 'warning' : 'pause'} />
      {overlap ? t.rundown.overlap : t.rundown.gap} {formatDuration(Math.abs(gap))}
    </div>
  );
}

function Clock({ value }: { value: number }) {
  return (
    <>
      {formatClock(value)}
      {isNextDay(value) && <sup className="next-day">+1</sup>}
    </>
  );
}

function EventRow({ row, columns, customFields, onPatch, handle }: RowProps & { handle: ReactElement }) {
  const { entry } = row;
  const fixed = entry.timeStart !== null;
  const patch = (p: EntryInput) => onPatch(entry.id, p);
  return (
    <div className="rt-row" role="row">
      {handle}
      {columns.cue && (
        <TextField className="cue" value={entry.cue} onCommit={(cue) => patch({ cue })} aria-label={t.rundown.cue} />
      )}
      <div className={`rt-start ${fixed ? 'fixed' : ''}`}>
        <button
          type="button"
          className="lock"
          title={`${fixed ? t.rundown.fixedStart : t.rundown.linkedStart} – ${t.rundown.lockHint}`}
          aria-label={fixed ? t.rundown.fixedStart : t.rundown.linkedStart}
          aria-pressed={fixed}
          onClick={() => patch({ timeStart: fixed ? null : row.start })}
        >
          <Icon name={fixed ? 'lock' : 'link'} />
        </button>
        <ClockField
          value={row.start}
          onCommit={(v) => patch({ timeStart: v })}
          aria-label={t.rundown.start}
          title={fixed ? t.rundown.fixedStart : t.rundown.linkedStart}
        />
        {row.delay !== 0 && (
          <span className={`expected ${row.delay > 0 ? 'late' : 'early'}`} title={t.rundown.expected}>
            <Clock value={row.start + row.delay} />
          </span>
        )}
      </div>
      {columns.end && (
        <div className="rt-end mono">
          <Clock value={row.end} />
        </div>
      )}
      <DurationField
        value={entry.duration}
        onCommit={(v) => patch({ duration: Math.max(0, v ?? 0) })}
        aria-label={t.rundown.duration}
      />
      <TextField
        className="title"
        data-field="title"
        value={entry.title}
        placeholder={t.rundown.untitled}
        onCommit={(title) => patch({ title })}
        aria-label={t.rundown.title}
      />
      {columns.speakers && (
        <TextField value={entry.speakers} onCommit={(speakers) => patch({ speakers })} aria-label={t.rundown.speakers} />
      )}
      {columns.note && (
        <TextField
          className="note"
          value={entry.note}
          onCommit={(note) => patch({ note })}
          aria-label={t.rundown.note}
          title={entry.note}
        />
      )}
      {customFields.map((f) => (
        <TextField
          key={f.id}
          value={entry.custom[f.id] ?? ''}
          onCommit={(v) => patch({ custom: { [f.id]: v } })}
          aria-label={f.label}
        />
      ))}
      {!entry.isPublic && <span className="badge-private" title="Non pubblico" />}
    </div>
  );
}

function BlockRow({ row, onPatch, handle }: RowProps & { handle: ReactElement }) {
  const { entry } = row;
  return (
    <div className="rt-row rt-block-row" role="row">
      {handle}
      <TextField
        className="title"
        data-field="title"
        value={entry.title}
        placeholder={t.types.block}
        onCommit={(title) => onPatch(entry.id, { title })}
        aria-label={t.rundown.title}
      />
      <div className="block-meta mono">
        {row.blockCount ? (
          <>
            <Clock value={row.start} /> – <Clock value={row.end} />
            <span className="sep">·</span>
            {formatDuration(row.end - row.start)}
            <span className="sep">·</span>
            {t.rundown.events(row.blockCount)}
          </>
        ) : (
          t.rundown.events(0)
        )}
      </div>
    </div>
  );
}

function DelayRow({ row, onPatch, handle }: RowProps & { handle: ReactElement }) {
  const { entry } = row;
  return (
    <div className="rt-row rt-delay-row" role="row">
      {handle}
      <div className="delay-label">
        <Icon name="clock" /> {t.types.delay}
      </div>
      <DurationField
        value={entry.duration}
        onCommit={(v) => onPatch(entry.id, { duration: v ?? 0 })}
        aria-label={t.types.delay}
      />
      <div className="delay-hint">
        {entry.duration >= 0 ? '+' : ''}
        {formatDuration(entry.duration)} {t.rundown.delayFromHere}
      </div>
    </div>
  );
}
