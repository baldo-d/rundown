import { useMemo, useState, type ChangeEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { Entry, Meta } from '../../shared/types';
import { IMPORT_FIELDS, guessMapping, mapRows, type ImportField, type ImportMapping } from '../../shared/importMapping';
import { computeTimeline } from '../../shared/timeline';
import { formatClock, formatDuration } from '../../shared/time';
import { t } from '../i18n/it';
import { invalidateRundown, metaKey, useMeta } from '../hooks/data';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';
import { storage } from '../storage';

export function TransferPage() {
  const meta = useMeta();
  if (!meta.data) return <div className="page-loading">{t.common.loading}</div>;
  return <Transfer meta={meta.data} />;
}

function Transfer({ meta }: { meta: Meta }) {
  const last = storage.get<{ dayId: string; stageId: string }>('uh.lastRundown');
  const [dayId, setDayId] = useState(
    last && meta.days.some((d) => d.id === last.dayId) ? last.dayId : (meta.days[0]?.id ?? ''),
  );
  const [stageId, setStageId] = useState(
    last && meta.stages.some((s) => s.id === last.stageId) ? last.stageId : (meta.stages[0]?.id ?? ''),
  );
  const qc = useQueryClient();
  const toast = useToast();

  const restore = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !confirm(t.transfer.restoreConfirm)) return;
    try {
      await api.restoreBackup(file);
      await qc.invalidateQueries({ queryKey: metaKey });
      await invalidateRundown(qc);
      toast.success(t.transfer.restored);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const hasTarget = Boolean(dayId && stageId);
  const query = `dayId=${encodeURIComponent(dayId)}&stageId=${encodeURIComponent(stageId)}`;

  return (
    <div className="transfer-page">
      <h1>{t.transfer.title}</h1>

      <section className="card">
        <h2>{t.transfer.target}</h2>
        <div className="form-grid">
          <label>
            <span>{t.rundown.days}</span>
            <select className="field" value={dayId} onChange={(e) => setDayId(e.target.value)}>
              {meta.days.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t.rundown.stages}</span>
            <select className="field" value={stageId} onChange={(e) => setStageId(e.target.value)}>
              {meta.stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <div className="two-col">
        <section className="card">
          <h2>{t.transfer.export}</h2>
          <ul className="link-list">
            <li>
              <a className="btn" href="/api/export/xlsx" download>
                <Icon name="download" /> {t.transfer.exportAllXlsx}
              </a>
            </li>
            {hasTarget && (
              <>
                <li>
                  <a className="btn" href={`/api/export/xlsx?${query}`} download>
                    <Icon name="download" /> {t.transfer.exportOneXlsx}
                  </a>
                </li>
                <li>
                  <a className="btn" href={`/api/export/csv?${query}`} download>
                    <Icon name="download" /> {t.transfer.exportOneCsv}
                  </a>
                </li>
                <li>
                  <a className="btn" href={`/stampa/${dayId}/${stageId}`} target="_blank" rel="noreferrer">
                    <Icon name="print" /> {t.transfer.exportPrint}
                  </a>
                </li>
                <li>
                  <a className="btn" href={`/stampa/${dayId}`} target="_blank" rel="noreferrer">
                    <Icon name="print" /> {t.transfer.exportPrintDay}
                  </a>
                </li>
              </>
            )}
          </ul>
        </section>

        <section className="card">
          <h2>{t.transfer.backup}</h2>
          <p className="muted">{t.transfer.backupHint}</p>
          <div className="row-gap">
            <a className="btn primary" href="/api/export/json" download>
              <Icon name="download" /> {t.transfer.downloadBackup}
            </a>
            <label className="btn danger-outline">
              <Icon name="upload" /> {t.transfer.restoreBackup}
              <input type="file" accept=".json,application/json" hidden onChange={restore} />
            </label>
          </div>
        </section>
      </div>

      {hasTarget && <ImportWizard key={`${dayId}/${stageId}`} meta={meta} dayId={dayId} stageId={stageId} />}
    </div>
  );
}

interface Sheet {
  name: string;
  rows: string[][];
}

const colName = (i: number) => {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

function ImportWizard({ meta, dayId, stageId }: { meta: Meta; dayId: string; stageId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<ImportMapping>({ fields: {}, custom: {} });
  const [linkContiguous, setLinkContiguous] = useState(true);
  const [mode, setMode] = useState<'replace' | 'append'>('replace');
  const [useStart, setUseStart] = useState(true);
  const [busy, setBusy] = useState(false);

  const sheet = sheets[sheetIndex];
  const headers = sheet?.rows[headerRow] ?? [];
  const width = Math.max(0, ...(sheet?.rows.slice(0, 50).map((r) => r.length) ?? [0]));

  const pickSheet = (s: Sheet | undefined, index: number) => {
    setSheetIndex(index);
    // header = first row with at least two non-empty cells
    const hr = Math.max(0, s?.rows.findIndex((r) => r.filter((c) => c).length >= 2) ?? 0);
    setHeaderRow(hr);
    setMapping(guessMapping(s?.rows[hr] ?? [], meta.customFields));
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const res = await api.previewImport(file);
      setFileName(file.name);
      setSheets(res.sheets);
      pickSheet(res.sheets[0], 0);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const result = useMemo(
    () =>
      sheet
        ? mapRows(sheet.rows, mapping, {
            headerRow,
            defaultDuration: meta.settings.defaultDuration,
            linkContiguous,
          })
        : null,
    [sheet, mapping, headerRow, linkContiguous, meta.settings.defaultDuration],
  );

  const preview = useMemo(() => {
    if (!result) return null;
    const entries: Entry[] = result.entries.map((e, i) => ({
      id: String(i),
      rundownId: '',
      sortOrder: i,
      type: e.type ?? 'event',
      cue: e.cue ?? '',
      title: e.title ?? '',
      speakers: e.speakers ?? '',
      duration: e.duration ?? 0,
      timeStart: e.timeStart ?? null,
      note: e.note ?? '',
      color: e.color ?? '',
      isPublic: e.isPublic ?? true,
      skip: e.skip ?? false,
      custom: e.custom ?? {},
    }));
    return computeTimeline(entries, result.startTime ?? 10 * 3600);
  }, [result]);

  const apply = async () => {
    if (!result) return;
    setBusy(true);
    try {
      const { rundown } = await api.rundown(dayId, stageId);
      await api.importEntries(rundown.id, {
        mode,
        entries: result.entries,
        startTime: useStart && mode === 'replace' && result.startTime !== null ? result.startTime : undefined,
      });
      await qc.invalidateQueries({ queryKey: metaKey });
      await invalidateRundown(qc);
      toast.success(t.transfer.imported(result.entries.length));
      setSheets([]);
      setFileName('');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const setField = (field: ImportField, value: string) =>
    setMapping((m) => ({ ...m, fields: { ...m.fields, [field]: value === '' ? null : Number(value) } }));
  const setCustom = (id: string, value: string) =>
    setMapping((m) => ({ ...m, custom: { ...m.custom, [id]: value === '' ? null : Number(value) } }));

  const columnOptions = Array.from({ length: width }, (_, i) => (
    <option key={i} value={i}>
      {colName(i)}
      {headers[i] ? ` – ${headers[i]}` : ''}
    </option>
  ));

  return (
    <section className="card import-wizard">
      <h2>{t.transfer.import}</h2>
      <p className="muted">{t.transfer.importHint}</p>
      <div className="row-gap">
        <label className="btn primary">
          <Icon name="upload" /> {t.transfer.chooseFile}
          <input type="file" accept=".xlsx,.csv,text/csv" hidden onChange={onFile} disabled={busy} />
        </label>
        {fileName && <span className="muted">{fileName}</span>}
      </div>

      {sheet && result && preview && (
        <>
          <div className="form-grid">
            {sheets.length > 1 && (
              <label>
                <span>{t.transfer.sheet}</span>
                <select
                  className="field"
                  value={sheetIndex}
                  onChange={(e) => pickSheet(sheets[Number(e.target.value)], Number(e.target.value))}
                >
                  {sheets.map((s, i) => (
                    <option key={i} value={i}>
                      {s.name} ({t.transfer.rows(s.rows.length)})
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              <span>{t.transfer.headerRow}</span>
              <input
                className="field"
                type="number"
                min={1}
                max={sheet.rows.length}
                value={headerRow + 1}
                onChange={(e) => {
                  const hr = Math.max(0, Number(e.target.value) - 1);
                  setHeaderRow(hr);
                  setMapping(guessMapping(sheet.rows[hr] ?? [], meta.customFields));
                }}
              />
            </label>
          </div>

          <h3>{t.transfer.mapping}</h3>
          <div className="mapping-grid">
            {IMPORT_FIELDS.map((field) => (
              <label key={field}>
                <span>{t.transfer.fields[field]}</span>
                <select
                  className="field"
                  value={mapping.fields[field] ?? ''}
                  onChange={(e) => setField(field, e.target.value)}
                >
                  <option value="">{t.transfer.notMapped}</option>
                  {columnOptions}
                </select>
              </label>
            ))}
            {meta.customFields.map((f) => (
              <label key={f.id}>
                <span>
                  <span className="dot" style={{ background: f.color }} />
                  {f.label}
                </span>
                <select className="field" value={mapping.custom[f.id] ?? ''} onChange={(e) => setCustom(f.id, e.target.value)}>
                  <option value="">{t.transfer.notMapped}</option>
                  {columnOptions}
                </select>
              </label>
            ))}
          </div>

          <div className="import-options">
            <label className="check">
              <input type="checkbox" checked={linkContiguous} onChange={(e) => setLinkContiguous(e.target.checked)} />
              {t.transfer.linkContiguous}
            </label>
            <div className="segmented">
              <button type="button" className={mode === 'replace' ? 'active' : ''} onClick={() => setMode('replace')}>
                {t.transfer.replace}
              </button>
              <button type="button" className={mode === 'append' ? 'active' : ''} onClick={() => setMode('append')}>
                {t.transfer.append}
              </button>
            </div>
            {mode === 'replace' && result.startTime !== null && (
              <label className="check">
                <input type="checkbox" checked={useStart} onChange={(e) => setUseStart(e.target.checked)} />
                {t.transfer.useStart(formatClock(result.startTime))}
              </label>
            )}
          </div>

          {result.warnings.length > 0 && (
            <details className="warnings" open={result.warnings.length < 6}>
              <summary>
                <Icon name="warning" /> {t.transfer.warnings} ({result.warnings.length})
              </summary>
              <ul>
                {result.warnings.slice(0, 50).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          )}

          <h3>
            {t.transfer.preview} · {t.rundown.events(preview.eventCount)} · {formatClock(preview.start)}–
            {formatClock(preview.end)}
          </h3>
          <div className="preview-table">
            <table>
              <thead>
                <tr>
                  <th>{t.inspector.type}</th>
                  <th>{t.rundown.cue}</th>
                  <th>{t.rundown.start}</th>
                  <th>{t.rundown.end}</th>
                  <th>{t.rundown.duration}</th>
                  <th>{t.rundown.title}</th>
                  <th>{t.rundown.speakers}</th>
                  <th>{t.rundown.note}</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 300).map((r) => (
                  <tr key={r.entry.id} className={`pv-${r.entry.type} ${r.entry.skip ? 'skipped' : ''}`}>
                    <td>{t.types[r.entry.type]}</td>
                    <td>{r.entry.cue}</td>
                    <td className="mono">
                      {r.entry.type === 'delay' ? '' : formatClock(r.start)}
                      {r.entry.timeStart !== null && <Icon name="lock" size={12} />}
                      {r.gap !== null && (
                        <span className={r.gap < 0 ? 'late' : 'muted'}>
                          {' '}
                          ({r.gap > 0 ? '+' : '−'}
                          {formatDuration(Math.abs(r.gap))})
                        </span>
                      )}
                    </td>
                    <td className="mono">{r.entry.type === 'event' ? formatClock(r.end) : ''}</td>
                    <td className="mono">{r.entry.type === 'block' ? '' : formatDuration(r.entry.duration)}</td>
                    <td>{r.entry.title}</td>
                    <td>{r.entry.speakers}</td>
                    <td className="muted">{r.entry.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="row-gap">
            <button type="button" className="btn primary" disabled={busy || result.entries.length === 0} onClick={apply}>
              <Icon name="upload" /> {t.transfer.apply} ({result.entries.length})
            </button>
          </div>
        </>
      )}
    </section>
  );
}
