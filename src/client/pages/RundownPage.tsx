import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Link, Navigate, NavLink, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { EntryInput, EntryType, Meta } from '../../shared/types';
import { computeTimeline } from '../../shared/timeline';
import { formatClock, formatDuration } from '../../shared/time';
import { t } from '../i18n/it';
import { useMeta, useRundown, useRundownActions } from '../hooks/data';
import { onRemoteChange } from '../hooks/live';
import {
  DEFAULT_COLUMNS,
  RundownTable,
  canHideColumn,
  columnLabel,
  customKey,
  isColumnVisible,
  resolveColumnOrder,
  type ColumnVisibility,
} from '../components/RundownTable';
import { Inspector } from '../components/Inspector';
import { ClockField } from '../components/inputs';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { storage } from '../storage';

const LAST_KEY = 'uh.lastRundown';
const COLUMNS_KEY = 'uh.columns';
const INSPECTOR_KEY = 'uh.inspector';

/** Redirects /scaletta to the last opened (or first) rundown. */
export function RundownIndex() {
  const meta = useMeta();
  if (!meta.data) return <div className="page-loading">{t.common.loading}</div>;
  const { days, stages } = meta.data;
  if (!days.length || !stages.length) {
    return (
      <div className="empty-state">
        <p>{t.rundown.emptyMeta}</p>
        <Link className="btn primary" to="/impostazioni">
          {t.nav.settings}
        </Link>
      </div>
    );
  }
  const last = storage.get<{ dayId: string; stageId: string }>(LAST_KEY);
  const valid = last && days.some((d) => d.id === last.dayId) && stages.some((s) => s.id === last.stageId);
  const dayId = valid ? last.dayId : days[0].id;
  const stageId = valid ? last.stageId : stages[0].id;
  return <Navigate to={`/scaletta/${dayId}/${stageId}`} replace />;
}

export function RundownPage() {
  const { dayId = '', stageId = '' } = useParams();
  const meta = useMeta();
  const navigate = useNavigate();
  const day = meta.data?.days.find((d) => d.id === dayId);
  const stage = meta.data?.stages.find((s) => s.id === stageId);

  useEffect(() => {
    if (day && stage) storage.set(LAST_KEY, { dayId, stageId });
  }, [day, stage, dayId, stageId]);

  useEffect(() => {
    if (meta.data && (!day || !stage)) navigate('/scaletta', { replace: true });
  }, [meta.data, day, stage, navigate]);

  if (!meta.data || !day || !stage) return <div className="page-loading">{t.common.loading}</div>;

  return (
    <div className="rundown-page">
      <Sidebar meta={meta.data} dayId={dayId} stageId={stageId} />
      <RundownEditor key={`${dayId}/${stageId}`} meta={meta.data} dayId={dayId} stageId={stageId} />
    </div>
  );
}

function Sidebar({ meta, dayId, stageId }: { meta: Meta; dayId: string; stageId: string }) {
  return (
    <nav className="sidebar" aria-label={t.rundown.days}>
      {meta.days.map((day) => (
        <div key={day.id} className={`sidebar-day ${day.id === dayId ? 'current' : ''}`}>
          <div className="sidebar-day-label">
            {day.label}
            {day.date && (
              <span className="muted">
                {new Date(`${day.date}T12:00:00`).toLocaleDateString('it-IT', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                })}
              </span>
            )}
          </div>
          {meta.stages.map((stage) => {
            const summary = meta.summaries.find((s) => s.dayId === day.id && s.stageId === stage.id);
            return (
              <NavLink
                key={stage.id}
                to={`/scaletta/${day.id}/${stage.id}`}
                className={day.id === dayId && stage.id === stageId ? 'active' : ''}
              >
                <span className="dot" style={{ background: stage.color }} />
                <span className="sidebar-stage">{stage.name}</span>
                <span className="sidebar-summary mono">
                  {summary?.count ? `${formatClock(summary.start)}–${formatClock(summary.end)}` : '—'}
                </span>
              </NavLink>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** Focuses the title of a row, or the duration for delays (which have no title). */
function focusPrimaryField(row: HTMLElement | null) {
  const input =
    row?.querySelector<HTMLInputElement>('[data-field="title"]') ?? row?.querySelector<HTMLInputElement>('input.field');
  input?.focus();
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.closest('input, textarea, select, [contenteditable="true"]') || el.isContentEditable));
}

function RundownEditor({ meta, dayId, stageId }: { meta: Meta; dayId: string; stageId: string }) {
  const query = useRundown(dayId, stageId);
  const actions = useRundownActions(dayId, stageId);
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const anchor = useRef<string | null>(null);
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  const [columns, setColumns] = useState<ColumnVisibility>(() => {
    const saved = storage.get<Partial<ColumnVisibility>>(COLUMNS_KEY);
    return {
      ...DEFAULT_COLUMNS,
      ...saved,
      custom: { ...saved?.custom },
      order: Array.isArray(saved?.order) ? saved.order : [],
    };
  });
  const columnOrder = resolveColumnOrder(columns.order, meta.customFields);
  const moveColumn = (index: number, delta: number) => {
    const to = index + delta;
    if (to < 0 || to >= columnOrder.length) return;
    const next = [...columnOrder];
    [next[index], next[to]] = [next[to], next[index]];
    setColumns({ ...columns, order: next });
  };
  const setColumnVisible = (key: string, visible: boolean) => {
    if (key.startsWith('cf:')) {
      setColumns({ ...columns, custom: { ...columns.custom, [key.slice(3)]: visible } });
    } else {
      setColumns({ ...columns, [key]: visible });
    }
  };
  const [showColumns, setShowColumns] = useState(false);
  const [showInspector, setShowInspector] = useState(() => storage.get<boolean>(INSPECTOR_KEY) ?? true);
  useEffect(() => storage.set(INSPECTOR_KEY, showInspector), [showInspector]);

  const day = meta.days.find((d) => d.id === dayId)!;
  const stage = meta.stages.find((s) => s.id === stageId)!;
  const data = query.data;
  const rundownId = data?.rundown.id;
  const timeline = useMemo(
    () => (data ? computeTimeline(data.entries, data.rundown.startTime) : null),
    [data],
  );
  const ids = useMemo(() => timeline?.rows.map((r) => r.entry.id) ?? [], [timeline]);
  const selectedRows = useMemo(
    () => timeline?.rows.filter((r) => selection.has(r.entry.id)) ?? [],
    [timeline, selection],
  );

  useEffect(() => storage.set(COLUMNS_KEY, columns), [columns]);

  // deep link from the overview: ?sel=<entryId>
  const deepLink = searchParams.get('sel');
  useEffect(() => {
    if (!deepLink || !ids.includes(deepLink)) return;
    setSelection(new Set([deepLink]));
    anchor.current = deepLink;
    document.querySelector(`[data-entry-id="${deepLink}"]`)?.scrollIntoView({ block: 'center' });
    setSearchParams({}, { replace: true });
  }, [deepLink, ids, setSearchParams]);

  // focus the title of a freshly created entry once it shows up
  useEffect(() => {
    if (!pendingFocus || !ids.includes(pendingFocus)) return;
    const row = document.querySelector<HTMLElement>(`[data-entry-id="${pendingFocus}"]`);
    row?.scrollIntoView({ block: 'nearest' });
    focusPrimaryField(row);
    setPendingFocus(null);
  }, [pendingFocus, ids]);

  useEffect(
    () =>
      onRemoteChange((msg) => {
        if (msg.type === 'rundown' && msg.rundownId === rundownId) toast.info(t.live.remoteUpdate);
      }),
    [rundownId, toast],
  );

  const patch = useCallback(
    (id: string, p: EntryInput) => actions.updateEntry.mutate({ id, patch: p }),
    [actions.updateEntry.mutate],
  );

  const patchMany = (targetIds: string[], p: EntryInput) => {
    if (targetIds.length === 1) actions.updateEntry.mutate({ id: targetIds[0], patch: p });
    else actions.batchUpdate.mutate({ ids: targetIds, patch: p });
  };

  const selectedIds = () => ids.filter((id) => selection.has(id));

  const add = (type: EntryType) => {
    if (!rundownId) return;
    const sel = selectedIds();
    const afterId = sel.length ? sel[sel.length - 1] : undefined;
    actions.createEntry.mutate(
      { rundownId, input: { type, afterId } },
      {
        onSuccess: (entry) => {
          setSelection(new Set([entry.id]));
          anchor.current = entry.id;
          setPendingFocus(entry.id);
        },
      },
    );
  };

  const remove = () => {
    const sel = selectedIds();
    if (!sel.length) return;
    if (sel.length > 1 && !confirm(t.rundown.deleteMany(sel.length))) return;
    const lastIndex = ids.indexOf(sel[sel.length - 1]);
    const next = ids.slice(lastIndex + 1).find((id) => !sel.includes(id)) ?? ids.slice(0, lastIndex).reverse().find((id) => !sel.includes(id));
    actions.deleteEntries.mutate(sel);
    setSelection(next ? new Set([next]) : new Set());
  };

  const duplicate = () => {
    const sel = selectedIds();
    if (!sel.length) return;
    actions.duplicate.mutate(sel, {
      onSuccess: (copies) => setSelection(new Set(copies.map((c) => c.id))),
    });
  };

  const reorder = useCallback(
    (next: string[]) => rundownId && actions.reorder.mutate({ rundownId, ids: next }),
    [rundownId, actions.reorder.mutate],
  );

  const onRowClick = useCallback(
    (id: string, e: MouseEvent) => {
      if (e.shiftKey && anchor.current) {
        const a = ids.indexOf(anchor.current);
        const b = ids.indexOf(id);
        const [from, to] = a < b ? [a, b] : [b, a];
        setSelection(new Set(ids.slice(from, to + 1)));
        return;
      }
      if (e.metaKey || e.ctrlKey) {
        setSelection((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      } else {
        setSelection(new Set([id]));
      }
      anchor.current = id;
    },
    [ids],
  );

  const onFocusRow = useCallback((id: string) => {
    setSelection((prev) => (prev.has(id) ? prev : new Set([id])));
    anchor.current = id;
  }, []);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || !timeline) return;
      const sel = selectedIds();
      const current = sel.length ? ids.indexOf(sel[sel.length - 1]) : -1;
      const mod = e.ctrlKey || e.metaKey;

      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.altKey && sel.length === 1) {
        e.preventDefault();
        const to = current + (e.key === 'ArrowDown' ? 1 : -1);
        if (to < 0 || to >= ids.length) return;
        const next = [...ids];
        next.splice(current, 1);
        next.splice(to, 0, sel[0]);
        reorder(next);
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!ids.length) return;
        const to =
          current < 0
            ? e.key === 'ArrowDown'
              ? 0
              : ids.length - 1
            : Math.max(0, Math.min(ids.length - 1, current + (e.key === 'ArrowDown' ? 1 : -1)));
        setSelection(new Set([ids[to]]));
        anchor.current = ids[to];
        document.querySelector(`[data-entry-id="${ids[to]}"]`)?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' && sel.length) {
        e.preventDefault();
        focusPrimaryField(document.querySelector<HTMLElement>(`[data-entry-id="${sel[sel.length - 1]}"]`));
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicate();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && sel.length) {
        e.preventDefault();
        remove();
      } else if (e.key === 'Escape') {
        setSelection(new Set());
      } else if (!mod && !e.altKey && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        setShowInspector((v) => !v);
      } else if (!mod && !e.altKey && ['e', 'b', 'r'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        add(e.key.toLowerCase() === 'e' ? 'event' : e.key.toLowerCase() === 'b' ? 'block' : 'delay');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (query.isError) return <div className="empty-state">{(query.error as Error).message}</div>;
  if (!data || !timeline) return <div className="page-loading">{t.common.loading}</div>;

  return (
    <>
      <section className="editor">
        <div className="editor-header">
          <div className="editor-title">
            <span className="stage-chip" style={{ background: stage.color }} />
            <div>
              <h1>{stage.name}</h1>
              <div className="muted">{day.label}</div>
            </div>
          </div>
          <label className="start-time">
            <span>{t.rundown.startTime}</span>
            <ClockField
              value={data.rundown.startTime}
              onCommit={(v) => v !== null && actions.updateRundown.mutate({ rundownId: data.rundown.id, startTime: v })}
            />
          </label>
          <dl className="totals mono">
            <div>
              <dt>{t.rundown.start}</dt>
              <dd>{formatClock(timeline.start) || '—'}</dd>
            </div>
            <div>
              <dt>{t.rundown.ends}</dt>
              <dd>
                {formatClock(timeline.end) || '—'}
                {timeline.totalDelay !== 0 && timeline.expectedEnd !== null && (
                  <span className={timeline.totalDelay > 0 ? 'late' : 'early'}> → {formatClock(timeline.expectedEnd)}</span>
                )}
              </dd>
            </div>
            <div>
              <dt>{t.rundown.total}</dt>
              <dd>{formatDuration(timeline.totalDuration)}</dd>
            </div>
            <div>
              <dt>{t.types.event}</dt>
              <dd>{timeline.eventCount}</dd>
            </div>
          </dl>
        </div>

        <div className="toolbar">
          <button type="button" className="btn primary" onClick={() => add('event')}>
            <Icon name="plus" /> {t.rundown.addEvent}
          </button>
          <button type="button" className="btn" onClick={() => add('block')}>
            <Icon name="plus" /> {t.rundown.addBlock}
          </button>
          <button type="button" className="btn" onClick={() => add('delay')}>
            <Icon name="plus" /> {t.rundown.addDelay}
          </button>
          <span className="toolbar-sep" />
          <button type="button" className="btn" disabled={!selection.size} onClick={duplicate}>
            <Icon name="copy" /> {t.rundown.duplicate}
          </button>
          <button type="button" className="btn" disabled={!selection.size} onClick={remove}>
            <Icon name="trash" /> {t.rundown.delete}
          </button>
          <span className="toolbar-fill" />
          <div className="popover-anchor">
            <button
              type="button"
              className="btn ghost"
              aria-expanded={showColumns}
              onClick={() => setShowColumns((v) => !v)}
            >
              <Icon name="columns" /> {t.rundown.columns}
            </button>
            {showColumns && (
              <div className="popover" onMouseLeave={() => setShowColumns(false)}>
                {columnOrder.map((key, i) => {
                  const field = key.startsWith('cf:') ? meta.customFields.find((f) => customKey(f.id) === key) : undefined;
                  return (
                    <div key={key} className="column-option">
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={isColumnVisible(key, columns)}
                          disabled={!canHideColumn(key)}
                          onChange={(e) => setColumnVisible(key, e.target.checked)}
                        />
                        {field && <span className="dot" style={{ background: field.color }} />}
                        {columnLabel(key, meta.customFields)}
                      </label>
                      <span className="move-buttons horizontal">
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`${t.common.moveUp}: ${columnLabel(key, meta.customFields)}`}
                          disabled={i === 0}
                          onClick={() => moveColumn(i, -1)}
                        >
                          <Icon name="chevronUp" />
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`${t.common.moveDown}: ${columnLabel(key, meta.customFields)}`}
                          disabled={i === columnOrder.length - 1}
                          onClick={() => moveColumn(i, 1)}
                        >
                          <Icon name="chevronDown" />
                        </button>
                      </span>
                    </div>
                  );
                })}
                <p className="popover-hint muted">{t.rundown.dragColumn}</p>
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => setColumns({ ...columns, order: [] })}
                >
                  {t.rundown.resetColumns}
                </button>
              </div>
            )}
          </div>
          <Link className="btn ghost" to={`/stampa/${dayId}/${stageId}`} target="_blank">
            <Icon name="print" /> {t.rundown.print}
          </Link>
          <button
            type="button"
            className={`btn ghost ${showInspector ? 'on' : ''}`}
            aria-pressed={showInspector}
            title={`${showInspector ? t.inspector.hide : t.inspector.show} (I)`}
            onClick={() => setShowInspector((v) => !v)}
          >
            <Icon name="sidebar" /> {showInspector ? t.inspector.hide : t.inspector.show}
          </button>
        </div>

        <div className="table-scroll">
          {timeline.rows.length === 0 ? (
            <div className="empty-state">
              <p>{t.rundown.empty}</p>
              <div className="row-gap">
                <button type="button" className="btn primary" onClick={() => add('event')}>
                  <Icon name="plus" /> {t.rundown.addEvent}
                </button>
                <Link className="btn" to="/importa-esporta">
                  {t.nav.transfer}
                </Link>
              </div>
            </div>
          ) : (
            <RundownTable
              timeline={timeline}
              customFields={meta.customFields}
              columns={columns}
              selection={selection}
              onRowClick={onRowClick}
              onFocusRow={onFocusRow}
              onPatch={patch}
              onReorder={reorder}
              onReorderColumns={(order) => setColumns((c) => ({ ...c, order }))}
            />
          )}
        </div>
      </section>
      {showInspector && (
      <Inspector
        rows={selectedRows}
        customFields={meta.customFields}
        onPatch={patchMany}
        onDuplicate={duplicate}
        onDelete={remove}
        onClose={() => setShowInspector(false)}
      />
      )}
    </>
  );
}
