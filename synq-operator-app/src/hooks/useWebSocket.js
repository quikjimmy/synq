'use strict';

import { useEffect, useRef, useCallback, useState } from 'react';

const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 30000;

/**
 * Connects to a WebSocket URL and calls onMessage with each parsed JSON event.
 * Automatically reconnects with exponential back-off on unexpected close.
 *
 * @param {string|null} url - WebSocket URL. Pass null to stay disconnected.
 * @param {(msg: object) => void} onMessage
 * @returns {{ connected: boolean, disconnect: () => void }}
 */
export function useWebSocket(url, onMessage) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const retryRef = useRef(0);
  const unmountedRef = useRef(false);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    setConnected(false);
  }, []);

  useEffect(() => {
    if (!url) return;
    unmountedRef.current = false;
    retryRef.current = 0;

    function connect() {
      if (unmountedRef.current) return;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (unmountedRef.current) { ws.close(); return; }
        retryRef.current = 0;
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          onMessageRef.current(msg);
        } catch (_) {
          // ignore malformed frames
        }
      };

      ws.onerror = () => {};

      ws.onclose = (event) => {
        setConnected(false);
        if (unmountedRef.current) return;
        if (event.wasClean && event.code === 1000) return;
        const delay = Math.min(
          RECONNECT_BASE_MS * 2 ** retryRef.current,
          RECONNECT_MAX_MS,
        );
        retryRef.current += 1;
        setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      unmountedRef.current = true;
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
    };
  }, [url]);

  return { connected, disconnect };
}
