import { useState, useCallback } from 'react';

export function useClusterInfo() {
  const [clusterInfo, setClusterInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchInfo = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/cluster/info');
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setClusterInfo(data);
      return data;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setClusterInfo(null);
    setError(null);
  }, []);

  return { clusterInfo, loading, error, fetchInfo, clear };
}
