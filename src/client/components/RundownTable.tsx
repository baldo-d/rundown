import { memo, useMemo, type CSSProperties, type MouseEvent, type ReactElement } from 'react';
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
  horizontalListSortingStrategy,
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
  /** Personal column order: base keys and `cf:<customFieldId>`. Completed by resolveColumnOrder. */
  order: string[];
}

export const DEFAULT_COLUMNS: ColumnVisibility = {
  cue: true,
  end: true,
  speakers: true,
  note: true,
  custom: {},
  order: [],
};

/** Columns that can be reordered, in their default order. Custom fields follow as `cf:<id>`. */
export const BASE_COLUMNS = ['cue', 'start', 'end', 'duration', 'title', 'speakers', 'note'] as const;
type BaseColumn = (typeof BASE_COLUMNS)[number];

const HIDEABLE: readonly string[] = ['cue', 'end', 'speakers', 'note'];

const WIDTHS: Record<BaseColumn, string> = {
  cue: '56px',
  start: '104px',
  end: '68px',
  duration: '84px',
  title: 'minmax(170px, 2fr)',
  speakers: 'minmax(120px, 1.2fr)',
  note: 'minmax(120px, 1.2fr)',
};

export const customKey = (id: string) => `cf:${id}`;

/** Full column order: saved keys first (dropping unknown ones), then any missing column. */
export function resolveColumnOrder(saved: string[], customFields: CustomField[]): string[] {
  const all = [...BASE_COLUMNS, ...customFields.map((f) => customKey(f.id))];
  const known = new Set<string>(all);
  const order = saved.filter((k, i) => known.has(k) && saved.indexOf(k) === i);
  for (const k of all) if (!order.includes(k)) order.push(k);
  return order;
}

export function isColumnVisible(key: string, columns: ColumnVisibility): boolean {
  if (key.startsWith('cf:')) return columns.custom[key.slice(3)] !== false;
  if (HIDEABLE.includes(key)) return columns[key as 'cue' | 'end' | 'speakers' | 'note'];
  return true;
}

export const canHideColumn = (key: string) => key.startsWith('cf:') || HIDEABLE.includes(key);

/** Ordered list of visible column keys. */
export function visibleColumns(columns: ColumnVisibility, customFields: CustomField[]): string[] {
  return resolveColumnOrder(columns.order, customFields).filter((k) => isColumnVisible(k, columns));
}

export function columnLabel(key: string, customFields: CustomField[]): string {
  if (key.startsWith('cf:')) return customFields.find((f) => f.id === key.slice(3))?.label ?? '';
  return key === 'end' ? t.rundown.end : t.rundown[key as Exclude<BaseColumn, 'end'>];
}

/** Builds the CSS grid template shared by the header and every row. */
export function gridTemplate(keys: string[]) {
  return ['24px', ...keys.map((k) => (k.startsWith('cf:') ? 'minmax(100px, 1fr)' : WIDTHS[k as BaseColumn]))].join(
    ' ',
  );
}

interface Props {
  timeline: Timeline;
  customFields: CustomField[];
  columns: ColumnVisibility;
  selection: Set<string>;
  onRowClick: (id: string, e: MouseEvent) => void;
  onFocusRow: (id: string) => void;
  onPatch: (id: string, patch: EntryInput) => void;
  onReorder: (ids: string[]) => void;
  onReorderColumns: (order: string[]) => void;
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
  onReorderColumns,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = timeline.rows.map((r) => r.entry.id);
  const keys = useMemo(() => visibleColumns(columns, customFields), [columns, customFields]);
  const style = { '--grid': gridTemplate(keys) } as CSSProperties;
  const headerSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onColumnDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    // reorder within the full order so hidden columns keep their place
    const full = resolveColumnOrder(columns.order, customFields);
    onReorderColumns(arrayMove(full, full.indexOf(String(active.id)), full.indexOf(String(over.id))));
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    onReorder(arrayMove(ids, from, to));
  };

  return (
    <div className="rundown-table" style={style} role="table">
      <DndContext sensors={headerSensors} collisionDetection={closestCenter} onDragEnd={onColumnDragEnd}>
        <SortableContext items={keys} strategy={horizontalListSortingStrategy}>
          <div className="rt-row rt-header" role="row">
            <div />
            {keys.map((key) => (
              <HeaderCell key={key} id={key} customFields={customFields} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {timeline.rows.map((row) => (
            <SortableRow
              key={row.entry.id}
              row={row}
              selected={selection.has(row.entry.id)}
              keys={keys}
              customFields={customFields}
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

function HeaderCell({ id, customFields }: { id: string; customFields: CustomField[] }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const field = id.startsWith('cf:') ? customFields.find((f) => f.id === id.slice(3)) : undefined;
  return (
    <div
      ref={setNodeRef}
      className={`rt-col ${isDragging ? 'dragging' : ''}`}
      data-col={id}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      title={t.rundown.dragColumn}
      {...attributes}
      {...listeners}
    >
      <Icon name="grip" size={12} />
      {field && <span className="dot" style={{ background: field.color }} />}
      <span className="rt-col-label">{columnLabel(id, customFields)}</span>
    </div>
  );
}

interface RowProps {
  row: TimelineRow;
  selected: boolean;
  keys: string[];
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

function EventRow({ row, keys, customFields, onPatch, handle }: RowProps & { handle: ReactElement }) {
  const { entry } = row;
  const fixed = entry.timeStart !== null;
  const patch = (p: EntryInput) => onPatch(entry.id, p);

  const cell = (key: string) => {
    switch (key) {
      case 'cue':
        return <TextField className="cue" value={entry.cue} onCommit={(cue) => patch({ cue })} aria-label={t.rundown.cue} />;
      case 'start':
        return (
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
        );
      case 'end':
        return (
          <div className="rt-end mono">
            <Clock value={row.end} />
          </div>
        );
      case 'duration':
        return (
          <DurationField
            value={entry.duration}
            onCommit={(v) => patch({ duration: Math.max(0, v ?? 0) })}
            aria-label={t.rundown.duration}
          />
        );
      case 'title':
        return (
          <TextField
            className="title"
            data-field="title"
            value={entry.title}
            placeholder={t.rundown.untitled}
            onCommit={(title) => patch({ title })}
            aria-label={t.rundown.title}
          />
        );
      case 'speakers':
        return (
          <TextField value={entry.speakers} onCommit={(speakers) => patch({ speakers })} aria-label={t.rundown.speakers} />
        );
      case 'note':
        return (
          <TextField
            className="note"
            value={entry.note}
            onCommit={(note) => patch({ note })}
            aria-label={t.rundown.note}
            title={entry.note}
          />
        );
      default: {
        const id = key.slice(3);
        return (
          <TextField
            value={entry.custom[id] ?? ''}
            onCommit={(v) => patch({ custom: { [id]: v } })}
            aria-label={customFields.find((f) => f.id === id)?.label}
          />
        );
      }
    }
  };

  return (
    <div className="rt-row" role="row">
      {handle}
      {keys.map((key) => (
        <div key={key} className="rt-cell" data-col={key}>
          {cell(key)}
        </div>
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
