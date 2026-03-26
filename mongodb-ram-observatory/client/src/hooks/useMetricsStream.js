import { useState, useEffect, useRef, useCallback } from 'react';

const MAX_DATA_POINTS = 300;

export function useMetricsStream(connected) {
  const [metrics, setMetrics] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState(null);
  const eventSourceRef = useRef(null);

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource('/api/metrics/stream');
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);

        if (parsed.type === 'history') {
          setHistory(parsed.data.slice(-MAX_DATA_POINTS));
          if (parsed.data.length > 0) {
            setMetrics(parsed.data[parsed.data.length - 1]);
          }
        } else if (parsed.type === 'metrics') {
          setMetrics(parsed.data);
          setHistory(prev => {
            const updated = [...prev, parsed.data];
            return updated.length > MAX_DATA_POINTS
              ? updated.slice(-MAX_DATA_POINTS)
              : updated;
          });
          setError(null);
        } else if (parsed.type === 'error') {
          setError(parsed.error);
        }
      } catch (e) {
        // ignore parse errors for SSE comments
      }
    };

    es.onerror = () => {
      setError('Connection to metrics stream lost');
      es.close();
      eventSourceRef.current = null;
    };
  }, []);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setMetrics(null);
    setHistory([]);
    setError(null);
  }, []);

  useEffect(() => {
    if (connected) {
      connect();
    } else {
      disconnect();
    }
    return () => disconnect();
  }, [connected, connect, disconnect]);

  const clearHistory = useCallback(async () => {
    setHistory([]);
    try {
      await fetch('/api/metrics/clear', { method: 'POST' });
    } catch {
      // ignore
    }
  }, []);

  return { metrics, history, error, clearHistory };
}
