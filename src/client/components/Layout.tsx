import { NavLink, Outlet } from 'react-router-dom';
import { t } from '../i18n/it';
import { useMeta } from '../hooks/data';
import { Icon } from './Icon';

export function Layout({ connected, onLogout }: { connected: boolean; onLogout: () => void }) {
  const meta = useMeta();
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">{meta.data?.settings.name ?? 'Utopian Hours 2026'}</span>
        </div>
        <nav className="mainnav">
          <NavLink to="/scaletta">{t.nav.rundown}</NavLink>
          <NavLink to="/panoramica">{t.nav.overview}</NavLink>
          <NavLink to="/importa-esporta">{t.nav.transfer}</NavLink>
          <NavLink to="/impostazioni">{t.nav.settings}</NavLink>
        </nav>
        <div className="topbar-right">
          <span className={`live-dot ${connected ? 'on' : 'off'}`} title={connected ? t.live.online : t.live.offline}>
            <span className="sr-only">{connected ? t.live.online : t.live.offline}</span>
          </span>
          <button type="button" className="btn ghost small" onClick={onLogout}>
            <Icon name="logout" /> <span className="btn-label">{t.nav.logout}</span>
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
