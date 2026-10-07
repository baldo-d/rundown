import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, setUnauthorizedHandler } from './api';
import { t } from './i18n/it';
import { useLiveSync } from './hooks/live';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { RundownIndex, RundownPage } from './pages/RundownPage';
import { OverviewPage } from './pages/OverviewPage';
import { SettingsPage } from './pages/SettingsPage';
import { TransferPage } from './pages/TransferPage';
import { PrintPage } from './pages/PrintPage';

export function App() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: api.me, staleTime: Infinity });
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    if (me.data) setAuthenticated(me.data.authenticated);
  }, [me.data]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setAuthenticated(false);
      qc.clear();
    });
  }, [qc]);

  const connected = useLiveSync(authenticated === true);

  if (authenticated === null) {
    return <div className="page-loading">{me.isError ? t.common.error : t.common.loading}</div>;
  }
  if (!authenticated) return <LoginPage onSuccess={() => setAuthenticated(true)} />;

  const logout = async () => {
    await api.logout().catch(() => undefined);
    qc.clear();
    setAuthenticated(false);
  };

  return (
    <Routes>
      <Route path="/stampa/:dayId/:stageId?" element={<PrintPage />} />
      <Route element={<Layout connected={connected} onLogout={logout} />}>
        <Route index element={<Navigate to="/scaletta" replace />} />
        <Route path="/scaletta" element={<RundownIndex />} />
        <Route path="/scaletta/:dayId/:stageId" element={<RundownPage />} />
        <Route path="/panoramica/:dayId?" element={<OverviewPage />} />
        <Route path="/importa-esporta" element={<TransferPage />} />
        <Route path="/impostazioni" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/scaletta" replace />} />
      </Route>
    </Routes>
  );
}
