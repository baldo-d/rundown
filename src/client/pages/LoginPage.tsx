import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { t } from '../i18n/it';

export function LoginPage({ onSuccess }: { onSuccess: () => void }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pin) return;
    setBusy(true);
    setError('');
    try {
      await api.login(pin);
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError && err.status !== 401 ? err.message : t.login.wrong);
      setPin('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <span className="brand-mark large" aria-hidden="true" />
        <div className="muted">Utopian Hours 2026</div>
        <h1>{t.login.title}</h1>
        <label>
          <span className="sr-only">{t.login.pin}</span>
          <input
            className="field pin-input"
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            placeholder={t.login.pin}
            value={pin}
            autoFocus
            onChange={(e) => setPin(e.target.value)}
          />
        </label>
        {error && <div className="login-error">{error}</div>}
        <button className="btn primary" type="submit" disabled={busy || !pin}>
          {t.login.submit}
        </button>
      </form>
    </div>
  );
}
