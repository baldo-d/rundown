import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type Kind = 'info' | 'error' | 'success';
interface Toast {
  id: number;
  kind: Kind;
  text: string;
}

interface ToastApi {
  info(text: string): void;
  error(text: string): void;
  success(text: string): void;
}

const ToastContext = createContext<ToastApi>({ info() {}, error() {}, success() {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Kind, text: string) => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list.filter((t) => t.text !== text), { id, kind, text }].slice(-4));
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), kind === 'error' ? 6000 : 3000);
  }, []);
  const value = useMemo(
    () => ({
      info: (text: string) => push('info', text),
      error: (text: string) => push('error', text),
      success: (text: string) => push('success', text),
    }),
    [push],
  );
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
