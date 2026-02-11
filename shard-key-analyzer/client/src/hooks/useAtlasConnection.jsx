import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { connectionApi } from '@/lib/api';
import { storage, parseConnectionHost } from '@/lib/utils';

const ConnectionContext = createContext(null);

export function ConnectionProvider({ children }) {
  const queryClient = useQueryClient();
  const [selectedDatabase, setSelectedDatabase] = useState(null);
  const [selectedCollection, setSelectedCollection] = useState(null);

  // Query for connection status
  const { data: status, isLoading } = useQuery({
    queryKey: ['connection-status'],
    queryFn: connectionApi.getStatus,
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Connect mutation
  const connectMutation = useMutation({
    mutationFn: ({ connectionString, database }) =>
      connectionApi.connect(connectionString, database),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['connection-status'] });

      // Save host to recent connections
      const host = parseConnectionHost(data.maskedConnectionString || '');
      if (host && host !== 'Unknown') {
        const recent = storage.get('recentConnections', []);
        const updated = [host, ...recent.filter((h) => h !== host)].slice(0, 5);
        storage.set('recentConnections', updated);
      }
    },
  });

  // Disconnect mutation
  const disconnectMutation = useMutation({
    mutationFn: connectionApi.disconnect,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connection-status'] });
      setSelectedDatabase(null);
      setSelectedCollection(null);
    },
  });

  // Get recent connections from storage
  const recentConnections = storage.get('recentConnections', []);

  const connect = useCallback(
    (connectionString, database) => {
      return connectMutation.mutateAsync({ connectionString, database });
    },
    [connectMutation]
  );

  const disconnect = useCallback(() => {
    return disconnectMutation.mutateAsync();
  }, [disconnectMutation]);

  const selectNamespace = useCallback((database, collection) => {
    setSelectedDatabase(database);
    setSelectedCollection(collection);
    storage.set('selectedNamespace', { database, collection });
  }, []);

  // Restore selected namespace on mount
  useEffect(() => {
    const saved = storage.get('selectedNamespace');
    if (saved && status?.connected) {
      setSelectedDatabase(saved.database);
      setSelectedCollection(saved.collection);
    }
  }, [status?.connected]);

  const value = {
    isConnected: status?.connected || false,
    isLoading,
    isConnecting: connectMutation.isPending,
    connectionInfo: status?.connected ? status : null,
    error: connectMutation.error?.message || disconnectMutation.error?.message,
    recentConnections,
    selectedDatabase,
    selectedCollection,
    namespace: selectedDatabase && selectedCollection
      ? `${selectedDatabase}.${selectedCollection}`
      : null,
    connect,
    disconnect,
    selectNamespace,
  };

  return (
    <ConnectionContext.Provider value={value}>
      {children}
    </ConnectionContext.Provider>
  );
}

export function useAtlasConnection() {
  const context = useContext(ConnectionContext);

  if (!context) {
    throw new Error('useAtlasConnection must be used within a ConnectionProvider');
  }

  return context;
}

export default useAtlasConnection;
