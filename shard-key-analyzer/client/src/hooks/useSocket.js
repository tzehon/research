import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '';

let socketInstance = null;

function getSocket() {
  if (!socketInstance) {
    socketInstance = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });
  }
  return socketInstance;
}

export function useSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const socket = useRef(null);

  useEffect(() => {
    socket.current = getSocket();

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    socket.current.on('connect', onConnect);
    socket.current.on('disconnect', onDisconnect);

    // Set initial state
    setIsConnected(socket.current.connected);

    return () => {
      socket.current.off('connect', onConnect);
      socket.current.off('disconnect', onDisconnect);
    };
  }, []);

  const on = useCallback((event, callback) => {
    socket.current?.on(event, callback);
    return () => socket.current?.off(event, callback);
  }, []);

  const off = useCallback((event, callback) => {
    socket.current?.off(event, callback);
  }, []);

  const emit = useCallback((event, data) => {
    socket.current?.emit(event, data);
  }, []);

  return {
    socket: socket.current,
    isConnected,
    on,
    off,
    emit,
  };
}

export function useSamplingSocket(database, collection) {
  const { on, emit, isConnected } = useSocket();
  const [status, setStatus] = useState(null);
  const [newQueries, setNewQueries] = useState([]);

  useEffect(() => {
    if (!database || !collection || !isConnected) return;

    // Subscribe to sampling updates
    emit('subscribe:sampling', { database, collection });

    const statusCleanup = on('sampling:status', (data) => {
      setStatus(data);
    });

    const progressCleanup = on('sampling:progress', (data) => {
      setStatus((prev) => ({ ...prev, ...data }));
    });

    const newQueryCleanup = on('sampling:newQuery', (query) => {
      setNewQueries((prev) => [query, ...prev].slice(0, 10));
    });

    return () => {
      emit('unsubscribe:sampling', { database, collection });
      statusCleanup();
      progressCleanup();
      newQueryCleanup();
    };
  }, [database, collection, isConnected, emit, on]);

  return {
    status,
    newQueries,
    isConnected,
  };
}

export function useWorkloadSocket(database, collection) {
  const { on, emit, isConnected } = useSocket();
  const [progress, setProgress] = useState(null);
  const [stats, setStats] = useState(null);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (!database || !collection || !isConnected) return;

    // Subscribe to workload updates
    emit('subscribe:workload', { database, collection });

    const progressCleanup = on('workload:progress', (data) => {
      setProgress(data);
      setStats(data.stats);
    });

    const completeCleanup = on('workload:complete', (data) => {
      setStats(data);
      setProgress((prev) => prev ? { ...prev, progress: 100, remaining: 0 } : prev);
      setIsComplete(true);
    });

    const statusCleanup = on('workload:status', (data) => {
      if (data.stats) setStats(data.stats);
    });

    return () => {
      emit('unsubscribe:workload', { database, collection });
      progressCleanup();
      completeCleanup();
      statusCleanup();
    };
  }, [database, collection, isConnected, emit, on]);

  const reset = useCallback(() => {
    setProgress(null);
    setStats(null);
    setIsComplete(false);
  }, []);

  return {
    progress,
    stats,
    isComplete,
    isConnected,
    reset,
  };
}

export function useAnalysisSocket(analysisId) {
  const { on, emit, isConnected } = useSocket();
  const [progress, setProgress] = useState(null);
  const [results, setResults] = useState([]);

  useEffect(() => {
    if (!analysisId || !isConnected) return;

    // Subscribe to analysis updates
    emit('subscribe:analysis', { analysisId });

    const progressCleanup = on('analysis:progress', (data) => {
      setProgress(data);
    });

    const candidateCleanup = on('analysis:candidateComplete', (data) => {
      setResults((prev) => [...prev, data.result]);
    });

    const completeCleanup = on('analysis:complete', (data) => {
      setProgress(null);
    });

    return () => {
      emit('unsubscribe:analysis', { analysisId });
      progressCleanup();
      candidateCleanup();
      completeCleanup();
    };
  }, [analysisId, isConnected, emit, on]);

  return {
    progress,
    results,
    isConnected,
  };
}

export default useSocket;
