import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { clientId } from '../api';
import type { ServerMessage } from '../../shared/types';
import { invalidateRundown, metaKey } from './data';

type Listener = (msg: ServerMessage) => void;
const listeners = new Set<Listener>();

/** Subscribe to change notifications coming from other editors. */
export function onRemoteChange(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Keeps a websocket open to the server and refreshes cached data when another
 * editor changes something. Returns whether the connection is up.
 */
export function useLiveSync(enabled: boolean) {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let socket: WebSocket | null = null;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      socket = new WebSocket(`${proto}://${location.host}/ws`);
      socket.onopen = () => {
        // refresh after a reconnection: we may have missed changes
        if (retry > 0) {
          qc.invalidateQueries({ queryKey: metaKey });
          invalidateRundown(qc);
        }
        retry = 0;
        setConnected(true);
      };
      socket.onmessage = (event) => {
        let msg: ServerMessage | { type: 'hello' };
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        if (msg.type === 'hello') return;
        qc.invalidateQueries({ queryKey: metaKey });
        if (msg.origin === clientId) return;
        if (msg.type === 'rundown') invalidateRundown(qc, msg.rundownId);
        listeners.forEach((fn) => fn(msg as ServerMessage));
      };
      socket.onclose = () => {
        setConnected(false);
        if (closed) return;
        retry++;
        timer = setTimeout(connect, Math.min(10000, 500 * 2 ** retry));
      };
    };
    connect();

    const onVisible = () => {
      if (document.visibilityState === 'visible' && (!socket || socket.readyState === WebSocket.CLOSED)) {
        clearTimeout(timer);
        connect();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      closed = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      socket?.close();
    };
  }, [enabled, qc]);

  return connected;
}
