import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { t } from '../i18n/it';
import { metaKey, useMeta } from '../hooks/data';
import { DurationField, TextField } from '../components/inputs';
import { ColorPicker, PALETTE } from '../components/ColorPicker';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';

export function SettingsPage() {
  const meta = useMeta();
  const qc = useQueryClient();
  const toast = useToast();
  const run = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onError: (err: Error) => toast.error(err.message),
    onSettled: () => qc.invalidateQueries({ queryKey: metaKey }),
  });
  const exec = (fn: () => Promise<unknown>) => run.mutate(fn);

  if (!meta.data) return <div className="page-loading">{t.common.loading}</div>;
  const { settings, days, stages, customFields } = meta.data;

  const move = (ids: string[], index: number, delta: number, save: (ids: string[]) => Promise<unknown>) => {
    const to = index + delta;
    if (to < 0 || to >= ids.length) return;
    const next = [...ids];
    [next[index], next[to]] = [next[to], next[index]];
    exec(() => save(next));
  };

  const MoveButtons = ({ ids, index, save }: { ids: string[]; index: number; save: (ids: string[]) => Promise<unknown> }) => (
    <span className="move-buttons">
      <button type="button" className="icon-btn" aria-label={t.common.moveUp} disabled={index === 0} onClick={() => move(ids, index, -1, save)}>
        <Icon name="chevronUp" />
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label={t.common.moveDown}
        disabled={index === ids.length - 1}
        onClick={() => move(ids, index, 1, save)}
      >
        <Icon name="chevronDown" />
      </button>
    </span>
  );

  return (
    <div className="settings-page">
      <h1>{t.settings.title}</h1>

      <section className="card">
        <h2>{t.settings.event}</h2>
        <div className="form-grid">
          <label>
            <span>{t.settings.eventName}</span>
            <TextField value={settings.name} onCommit={(name) => name.trim() && exec(() => api.updateSettings({ name: name.trim() }))} />
          </label>
          <label>
            <span>{t.settings.timezone}</span>
            <TextField value={settings.timezone} onCommit={(timezone) => timezone.trim() && exec(() => api.updateSettings({ timezone: timezone.trim() }))} />
          </label>
          <label>
            <span>{t.settings.defaultDuration}</span>
            <DurationField
              value={settings.defaultDuration}
              onCommit={(v) => exec(() => api.updateSettings({ defaultDuration: Math.max(0, v ?? 0) }))}
            />
          </label>
        </div>
      </section>

      <section className="card">
        <h2>{t.settings.days}</h2>
        <div className="list">
          {days.map((d, i) => (
            <div key={d.id} className="list-row">
              <MoveButtons ids={days.map((x) => x.id)} index={i} save={api.reorderDays} />
              <label>
                <span>{t.settings.dayLabel}</span>
                <TextField value={d.label} onCommit={(label) => label.trim() && exec(() => api.updateDay(d.id, { label: label.trim() }))} />
              </label>
              <label>
                <span>{t.settings.dayDate}</span>
                <input
                  className="field"
                  type="date"
                  value={d.date ?? ''}
                  onChange={(e) => exec(() => api.updateDay(d.id, { date: e.target.value || null }))}
                />
              </label>
              <button
                type="button"
                className="icon-btn danger"
                aria-label={t.common.delete}
                onClick={() => confirm(t.settings.deleteDay) && exec(() => api.deleteDay(d.id))}
              >
                <Icon name="trash" />
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="btn" onClick={() => exec(() => api.createDay({}))}>
          <Icon name="plus" /> {t.settings.addDay}
        </button>
      </section>

      <section className="card">
        <h2>{t.settings.stages}</h2>
        <div className="list">
          {stages.map((s, i) => (
            <div key={s.id} className="list-row">
              <MoveButtons ids={stages.map((x) => x.id)} index={i} save={api.reorderStages} />
              <label>
                <span>{t.settings.stageName}</span>
                <TextField value={s.name} onCommit={(name) => name.trim() && exec(() => api.updateStage(s.id, { name: name.trim() }))} />
              </label>
              <ColorPicker value={s.color} allowEmpty={false} onChange={(color) => exec(() => api.updateStage(s.id, { color }))} />
              <button
                type="button"
                className="icon-btn danger"
                aria-label={t.common.delete}
                onClick={() => confirm(t.settings.deleteStage) && exec(() => api.deleteStage(s.id))}
              >
                <Icon name="trash" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => exec(() => api.createStage({ color: PALETTE[(stages.length * 3) % PALETTE.length] }))}
        >
          <Icon name="plus" /> {t.settings.addStage}
        </button>
      </section>

      <section className="card">
        <h2>{t.settings.customFields}</h2>
        <p className="muted">{t.settings.customFieldsHint}</p>
        <div className="list">
          {customFields.map((f, i) => (
            <div key={f.id} className="list-row">
              <MoveButtons ids={customFields.map((x) => x.id)} index={i} save={api.reorderCustomFields} />
              <label>
                <span>{t.settings.fieldLabel}</span>
                <TextField value={f.label} onCommit={(label) => label.trim() && exec(() => api.updateCustomField(f.id, { label: label.trim() }))} />
              </label>
              <ColorPicker value={f.color} allowEmpty={false} onChange={(color) => exec(() => api.updateCustomField(f.id, { color }))} />
              <button
                type="button"
                className="icon-btn danger"
                aria-label={t.common.delete}
                onClick={() => confirm(t.settings.deleteField) && exec(() => api.deleteCustomField(f.id))}
              >
                <Icon name="trash" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => exec(() => api.createCustomField({ color: PALETTE[(customFields.length * 5) % PALETTE.length] }))}
        >
          <Icon name="plus" /> {t.settings.addField}
        </button>
      </section>
    </div>
  );
}
