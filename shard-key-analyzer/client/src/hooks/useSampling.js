import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { samplingApi } from '@/lib/api';

export function useSampling(database, collection) {
  const queryClient = useQueryClient();

  // Query for sampling status
  const { data: status, isLoading: isLoadingStatus } = useQuery({
    queryKey: ['sampling-status'],
    queryFn: samplingApi.getStatus,
    refetchInterval: (data) => (data?.isActive ? 2000 : false),
    enabled: !!database && !!collection,
  });

  // Query for sampled queries
  const { data: queries, isLoading: isLoadingQueries } = useQuery({
    queryKey: ['sampled-queries', database, collection],
    queryFn: () => samplingApi.getQueries(database, collection, 50),
    refetchInterval: status?.isActive ? 5000 : false,
    enabled: !!database && !!collection,
  });

  // Query for sampling stats
  const { data: stats, isLoading: isLoadingStats } = useQuery({
    queryKey: ['sampling-stats', database, collection],
    queryFn: () => samplingApi.getStats(database, collection),
    refetchInterval: status?.isActive ? 3000 : false,
    enabled: !!database && !!collection,
  });

  // Start sampling mutation
  const startMutation = useMutation({
    mutationFn: ({ samplesPerSecond }) =>
      samplingApi.start(database, collection, samplesPerSecond),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sampling-status'] });
    },
  });

  // Stop sampling mutation
  const stopMutation = useMutation({
    mutationFn: () => samplingApi.stop(database, collection),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sampling-status'] });
    },
  });

  // Update rate mutation
  const updateRateMutation = useMutation({
    mutationFn: ({ samplesPerSecond }) =>
      samplingApi.updateRate(samplesPerSecond),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sampling-status'] });
    },
  });

  // Clear queries mutation
  const clearMutation = useMutation({
    mutationFn: () => samplingApi.clearQueries(database, collection),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sampled-queries'] });
      queryClient.invalidateQueries({ queryKey: ['sampling-stats'] });
    },
  });

  return {
    // Status
    isActive: status?.isActive || false,
    status,
    isLoadingStatus,

    // Queries
    queries: queries?.queries || [],
    totalQueries: queries?.total || 0,
    queriesByType: queries?.byType || {},
    isLoadingQueries,

    // Stats
    stats,
    isLoadingStats,

    // Actions
    start: (samplesPerSecond = 10) => startMutation.mutateAsync({ samplesPerSecond }),
    stop: () => stopMutation.mutateAsync(),
    updateRate: (samplesPerSecond) => updateRateMutation.mutateAsync({ samplesPerSecond }),
    clear: () => clearMutation.mutateAsync(),

    // Mutation states
    isStarting: startMutation.isPending,
    isStopping: stopMutation.isPending,
    isUpdatingRate: updateRateMutation.isPending,
    isClearing: clearMutation.isPending,

    // Errors
    error: startMutation.error || stopMutation.error || updateRateMutation.error,
  };
}

export default useSampling;
