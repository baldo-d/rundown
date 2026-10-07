import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { api } from '../api';
import { computeTimeline } from '../../shared/timeline';
import { formatClock, formatDuration } from '../../shared/time';
import { t } from '../i18n/it';
import { rundownKey, useMeta } from '../hooks/data';

/** Light, printer-friendly rundown. Without a stage it prints every stage of the day. */
export function PrintPage() {
  const { dayId, stageId } = useParams();
  const meta = useMeta();
  const [onlyPublic, setOnlyPublic] = useState(false);
  const [showNotes, setShowNotes] = useState(true);
  const [showCustom, setShowCustom] = useState(true);

  const day = meta.data?.days.find((d) => d.id === dayId);
  const stages = (meta.data?.stages ?? []).filter((s) => !stageId || s.id === stageId);
  const queries = useQueries({
    queries: stages.map((s) => ({
      queryKey: rundownKey(dayId ?? '', s.id),
      queryFn: () => api.rundown(dayId!, s.id),
      enabled: Boolean(day),
    })),
  });

  if (!meta.data) return <div className="print-page">{t.common.loading}</div>;
  if (!day) return <div className="print-page">—</div>;
  const customFields = showCustom ? meta.data.customFields : [];

  return (
    <div className="print-page">
      <div className="print-controls no-print">
        <button type="button" className="btn primary" onClick={() => window.print()}>
          {t.print.print}
        </button>
        <label className="check">
          <input type="checkbox" checked={onlyPublic} onChange={(e) => setOnlyPublic(e.target.checked)} />
          {t.print.onlyPublic}
        </label>
        <label className="check">
          <input type="checkbox" checked={showNotes} onChange={(e) => setShowNotes(e.target.checked)} />
          {t.print.showNotes}
        </label>
        <label className="check">
          <input type="checkbox" checked={showCustom} onChange={(e) => setShowCustom(e.target.checked)} />
          {t.print.showCustom}
        </label>
      </div>

      {stages.map((stage, i) => {
        const data = queries[i]?.data;
        if (!data) return <p key={stage.id}>{t.common.loading}</p>;
        const timeline = computeTimeline(data.entries, data.rundown.startTime);
        const rows = timeline.rows.filter(
          (r) => !r.entry.skip && (!onlyPublic || r.entry.type !== 'event' || r.entry.isPublic) && !(onlyPublic && r.entry.type === 'delay'),
        );
        return (
          <section key={stage.id} className="print-sheet">
            <header>
              <div>
                <div className="print-event">{meta.data!.settings.name}</div>
                <h1>
                  {day.label}
                  {day.date &&
                    ` · ${new Date(`${day.date}T12:00:00`).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}`}{' '}
                  — {stage.name}
                </h1>
              </div>
              <div className="print-summary">
                {formatClock(timeline.start)}–{formatClock(timeline.expectedEnd)} · {t.rundown.events(timeline.eventCount)}
              </div>
            </header>
            <table>
              <thead>
                <tr>
                  <th className="c-time">{t.rundown.start}</th>
                  <th className="c-time">{t.rundown.end}</th>
                  <th className="c-dur">{t.rundown.duration}</th>
                  <th className="c-cue">{t.rundown.cue}</th>
                  <th>{t.rundown.title}</th>
                  <th>{t.rundown.speakers}</th>
                  {showNotes && <th>{t.rundown.note}</th>}
                  {customFields.map((f) => (
                    <th key={f.id}>{f.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const cols = 6 + (showNotes ? 1 : 0) + customFields.length;
                  if (r.entry.type === 'block') {
                    return (
                      <tr key={r.entry.id} className="p-block" style={{ borderLeftColor: r.entry.color || '#999' }}>
                        <td colSpan={cols}>
                          {r.entry.title}
                          {r.blockCount ? (
                            <span className="p-block-meta">
                              {formatClock(r.start)}–{formatClock(r.end)} · {formatDuration(r.end - r.start)}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  }
                  if (r.entry.type === 'delay') {
                    return (
                      <tr key={r.entry.id} className="p-delay">
                        <td colSpan={cols}>
                          {t.types.delay} {r.entry.duration >= 0 ? '+' : ''}
                          {formatDuration(r.entry.duration)}
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={r.entry.id} style={{ borderLeftColor: r.entry.color || 'transparent' }}>
                      <td className="c-time">
                        {formatClock(r.start)}
                        {r.delay !== 0 && <div className="p-expected">{formatClock(r.start + r.delay)}</div>}
                      </td>
                      <td className="c-time">{formatClock(r.end)}</td>
                      <td className="c-dur">{formatDuration(r.entry.duration)}</td>
                      <td className="c-cue">{r.entry.cue}</td>
                      <td className="p-title">{r.entry.title}</td>
                      <td>{r.entry.speakers}</td>
                      {showNotes && <td className="p-note">{r.entry.note}</td>}
                      {customFields.map((f) => (
                        <td key={f.id}>{r.entry.custom[f.id] ?? ''}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <footer>
              {t.print.generated} {new Date().toLocaleString('it-IT')}
            </footer>
          </section>
        );
      })}
    </div>
  );
}
