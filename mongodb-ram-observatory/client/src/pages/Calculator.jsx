import React, { useState, useCallback } from 'react';
import SizingForm from '../components/SizingForm.jsx';
import SizingResults from '../components/SizingResults.jsx';
import RamPoolSummary from '../components/RamPoolSummary.jsx';

const DEFAULT_INPUTS = {
  deploymentTarget: 'ea',
  workingSetGB: 4,
  headroomPercent: 20,
  maxConnections: 200,
  aggMemoryGB: 0.5,
  internalOverheadGB: 1.0,
  tcmallocPercent: 12,
  fsCachePercent: 25,
  numReplicaSets: 1,
  mongosInstances: 0,
  mongosMemoryGB: 4,
  currentContainerGB: null,
  currentTier: null,
};

export default function Calculator({ metrics, clusterInfo }) {
  const [inputs, setInputs] = useState(() => {
    const defaults = { ...DEFAULT_INPUTS };
    if (clusterInfo?.isAtlas) {
      defaults.deploymentTarget = 'atlas';
    }
    return defaults;
  });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleCalculate = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/sizing/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inputs),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Calculation failed');
      }
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err.message);
    }
  }, [inputs]);

  const handleUseObserved = useCallback(() => {
    if (!metrics) return;
    const cacheUsedGB = +(metrics.cache.usedBytes / (1024 * 1024 * 1024)).toFixed(1);
    setInputs(prev => ({
      ...prev,
      workingSetGB: Math.max(cacheUsedGB, 0.5),
      maxConnections: Math.max(metrics.connections.current, 50),
      deploymentTarget: clusterInfo?.isAtlas ? 'atlas' : 'ea',
    }));
  }, [metrics, clusterInfo]);

  const hasObserved = !!metrics;

  return (
    <div className="space-y-4">
      <SizingForm
        inputs={inputs}
        onChange={setInputs}
        onCalculate={handleCalculate}
        onUseObserved={handleUseObserved}
        hasObserved={hasObserved}
      />

      {error && (
        <div className="card border-mongo-red border">
          <p className="text-mongo-red text-sm">{error}</p>
        </div>
      )}

      {result && <RamPoolSummary result={result} />}
      <SizingResults result={result} />
    </div>
  );
}
