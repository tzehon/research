import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { analysisApi } from '@/lib/api';
import { storage } from '@/lib/utils';

export function useAnalysis() {
  const queryClient = useQueryClient();
  const [results, setResults] = useState(null);
  const [progress, setProgress] = useState(null);

  // Analyze mutation
  const analyzeMutation = useMutation({
    mutationFn: (config) => analysisApi.analyze(config),
    onSuccess: (data) => {
      setResults(data);
      setProgress(null);
      // Store results
      storage.set('lastAnalysisResults', data);
    },
  });

  // Analyze single key mutation
  const analyzeSingleMutation = useMutation({
    mutationFn: ({ database, collection, key, options }) =>
      analysisApi.analyzeSingle(database, collection, key, options),
  });

  // Check index mutation
  const checkIndexMutation = useMutation({
    mutationFn: ({ database, collection, key }) =>
      analysisApi.checkIndex(database, collection, key),
  });

  const analyze = useCallback(
    async (database, collection, candidates, options = {}) => {
      setProgress({ current: 0, total: candidates.length, status: 'starting' });

      const config = {
        database,
        collection,
        candidates,
        sampleSize: options.sampleSize || 10000,
        keyCharacteristics: options.keyCharacteristics !== false,
        readWriteDistribution: options.readWriteDistribution !== false,
      };

      return analyzeMutation.mutateAsync(config);
    },
    [analyzeMutation]
  );

  const analyzeSingle = useCallback(
    (database, collection, key, options = {}) => {
      return analyzeSingleMutation.mutateAsync({
        database,
        collection,
        key,
        options,
      });
    },
    [analyzeSingleMutation]
  );

  const checkIndex = useCallback(
    (database, collection, key) => {
      return checkIndexMutation.mutateAsync({ database, collection, key });
    },
    [checkIndexMutation]
  );

  const clearResults = useCallback(() => {
    setResults(null);
    setProgress(null);
    storage.remove('lastAnalysisResults');
  }, []);

  const loadSavedResults = useCallback(() => {
    const saved = storage.get('lastAnalysisResults');
    if (saved) {
      setResults(saved);
    }
    return saved;
  }, []);

  return {
    // Results
    results,
    progress,

    // Actions
    analyze,
    analyzeSingle,
    checkIndex,
    clearResults,
    loadSavedResults,

    // States
    isAnalyzing: analyzeMutation.isPending,
    isAnalyzingSingle: analyzeSingleMutation.isPending,
    isCheckingIndex: checkIndexMutation.isPending,

    // Errors
    error: analyzeMutation.error?.message,
    singleError: analyzeSingleMutation.error?.message,
  };
}

export default useAnalysis;
