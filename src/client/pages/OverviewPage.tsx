import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { api } from '../api';
import { computeTimeline, type Timeline } from '../../shared/timeline';
import { formatClock, formatDuration } from '../../shared/time';
import { t } from '../i18n/it';
import { rundownKey, useMeta } from '../hooks/data';
import { Icon } from '../components/Icon';

const PX_PER_MIN = 1.6;

/** One day across every stage, drawn on a common time axis to spot clashes. */
export function OverviewPage() {
  const { dayId } = useParams();
  const meta = useMeta();
  const navigate = useNavigate();
  const days = meta.data?.days ?? [];
  const stages = meta.data?.stages ?? [];
  const day = days.find((d) => d.id === dayId) ?? days[0];

  const queries = useQueries({
    queries: stages.map((s) => ({
      queryKey: rundownKey(day?.id ?? '', s.id),
      queryFn: () => api.rundown(day!.id, s.id),
      enabled: Boolean(day),
    })),
  });

  const timelines = useMemo(
    () =>
      queries.map((q) => (q.data ? computeTimeline(q.data.entries, q.data.rundown.startTime) : null)) as (
        | Timeline
        | null
      )[],
    [queries.map((q) => q.dataUpdatedAt).join()],
  );

  if (!meta.data) return <div className="page-loading">{t.common.loading}</div>;
  if (!day || !stages.length) return <div className="empty-state">{t.rundown.emptyMeta}</div>;

  const starts = timelines.flatMap((tl) => (tl?.start != null ? [tl.start] : []));
  const ends = timelines.flatMap((tl) => (tl?.expectedEnd != null ? [tl.expectedEnd] : []));
  const from = starts.length ? Math.floor(Math.min(...starts) / 3600) * 3600 : 9 * 3600;
  const to = ends.length ? Math.ceil(Math.max(...ends) / 3600) * 3600 : 18 * 3600;
  const hours: number[] = [];
  for (let h = from; h <= to; h += 3600) hours.push(h);
  const y = (sec: number) => ((sec - from) / 60) * PX_PER_MIN;
  const height = y(to) + 24;

  return (
    <div className="overview-page">
      <div className="page-header">
        <h1>{t.overview.title}</h1>
        <div className="segmented">
          {days.map((d) => (
            <button
              type="button"
              key={d.id}
              className={d.id === day.id ? 'active' : ''}
              onClick={() => navigate(`/panoramica/${d.id}`)}
            >
              {d.label}
            </button>
          ))}
        </div>
        <Link className="btn ghost" to={`/stampa/${day.id}`} target="_blank">
          <Icon name="print" /> {t.rundown.print}
        </Link>
      </div>

      <div className="overview-scroll">
        <div className="overview-grid" style={{ gridTemplateColumns: `56px repeat(${stages.length}, minmax(200px, 1fr))` }}>
          <div className="ov-corner" />
          {stages.map((s) => (
            <Link key={s.id} className="ov-stage" to={`/scaletta/${day.id}/${s.id}`} title={t.overview.openRundown}>
              <span className="dot" style={{ background: s.color }} />
              {s.name}
            </Link>
          ))}

          <div className="ov-axis" style={{ height }}>
            {hours.map((h) => (
              <span key={h} className="mono" style={{ top: y(h) }}>
                {formatClock(h)}
              </span>
            ))}
          </div>

          {stages.map((s, i) => {
            const tl = timelines[i];
            return (
              <div key={s.id} className="ov-column" style={{ height }}>
                {hours.map((h) => (
                  <div key={h} className="ov-hour" style={{ top: y(h) }} />
                ))}
                {tl?.eventCount === 0 && <div className="ov-empty muted">{t.overview.noEvents}</div>}
                {tl?.rows
                  .filter((r) => r.entry.type === 'event' && !r.entry.skip)
                  .map((r) => {
                    const top = y(r.start);
                    const h = Math.max(18, y(r.end) - top - 2);
                    const color = r.entry.color || s.color;
                    return (
                      <Link
                        key={r.entry.id}
                        to={`/scaletta/${day.id}/${s.id}?sel=${r.entry.id}`}
                        className={`ov-event ${r.gap !== null && r.gap < 0 ? 'overlap' : ''} ${h < 34 ? 'compact' : ''}`}
                        style={{ top, height: h, borderLeftColor: color, background: `${color}26` }}
                        title={`${formatClock(r.start)}–${formatClock(r.end)} · ${r.entry.title}${r.entry.speakers ? ` · ${r.entry.speakers}` : ''}`}
                      >
                        <span className="ov-time mono">
                          {formatClock(r.start)} · {formatDuration(r.entry.duration)}
                        </span>
                        <span className="ov-title">{r.entry.title || t.rundown.untitled}</span>
                        {r.entry.speakers && h >= 52 && <span className="ov-speakers muted">{r.entry.speakers}</span>}
                      </Link>
                    );
                  })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
