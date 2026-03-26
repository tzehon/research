import React, { useState, useEffect, useCallback } from 'react';
import { LOAD_PRESETS } from '../utils/constants.js';
import { formatNumber, formatLatency } from '../utils/formatters.js';

export default function LoadControls({ connected, collections, clearHistory }) {
  const [config, setConfig] = useState(LOAD_PRESETS[0].config);
  const [activePreset, setActivePreset] = useState(0);
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  // Poll load stats while running
  useEffect(() => {
    if (!running) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/load/stats');
        const data = await res.json();
        setStats(data.stats);
        if (!data.running) {
          setRunning(false);
        }
      } catch (e) { /* ignore */ }
    }, 1000);
    return () => clearInterval(interval);
  }, [running]);

  const handlePreset = (index) => {
    setActivePreset(index);
    const preset = LOAD_PRESETS[index];
    // Update maxId if we have collection info
    const col = collections?.find(c => c.name === preset.config.collection);
    setConfig({
      ...preset.config,
      maxId: col?.count || preset.config.maxId,
    });
  };

  const handleStart = async () => {
    setError(null);
    if (clearHistory) clearHistory();
    try {
      const res = await fetch('/api/load/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Failed to start load');
      }
      setRunning(true);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleStop = async () => {
    try {
      await fetch('/api/load/stop', { method: 'POST' });
      setRunning(false);
    } catch (err) {
      setError(err.message);
    }
  };

  const updateConfig = (field, value) => {
    setConfig(prev => ({ ...prev, [field]: value }));
    setActivePreset(-1);
  };

  return (
    <div className="card">
      <h3 className="text-lg font-semibold text-mongo-white mb-3">Load Generator</h3>

      {/* Presets */}
      <div className="flex flex-wrap gap-2 mb-4">
        {LOAD_PRESETS.map((preset, i) => (
          <button
            key={i}
            onClick={() => handlePreset(i)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              activePreset === i
                ? 'border-mongo-green text-mongo-green bg-mongo-forest'
                : 'border-mongo-forest text-gray-400 hover:border-gray-500'
            }`}
            disabled={running}
          >
            {preset.name}
          </button>
        ))}
      </div>

      {activePreset >= 0 && (
        <p className="text-xs text-gray-500 mb-3">{LOAD_PRESETS[activePreset]?.description}</p>
      )}

      {/* Config */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-4">
        <div>
          <label className="label">Threads</label>
          <input
            type="number"
            value={config.threads}
            onChange={e => updateConfig('threads', parseInt(e.target.value) || 1)}
            className="input-field"
            min={1}
            max={256}
            disabled={running}
          />
        </div>
        <div>
          <label className="label">Target ops/s {config.targetOpsPerSec === 0 && <span className="text-mongo-green">(uncapped)</span>}</label>
          <input
            type="number"
            value={config.targetOpsPerSec}
            onChange={e => updateConfig('targetOpsPerSec', parseInt(e.target.value) || 0)}
            className="input-field"
            min={0}
            placeholder="0 = uncapped"
            max={50000}
            disabled={running}
          />
        </div>
        <div>
          <label className="label">Pattern</label>
          <select
            value={config.pattern}
            onChange={e => updateConfig('pattern', e.target.value)}
            className="input-field"
            disabled={running}
          >
            <option value="random">Random</option>
            <option value="skewed">Skewed (80/20)</option>
            <option value="sequential">Sequential</option>
          </select>
        </div>
        <div>
          <label className="label">Operation</label>
          <select
            value={config.operation}
            onChange={e => updateConfig('operation', e.target.value)}
            className="input-field"
            disabled={running}
          >
            <option value="read">Read</option>
            <option value="write">Write</option>
            <option value="mixed">Mixed</option>
          </select>
        </div>
        {config.operation === 'mixed' && (
          <div>
            <label className="label">Read %</label>
            <input
              type="number"
              value={config.readPercent}
              onChange={e => updateConfig('readPercent', parseInt(e.target.value) || 50)}
              className="input-field"
              min={0}
              max={100}
              disabled={running}
            />
          </div>
        )}
        <div>
          <label className="label">Collection</label>
          <select
            value={config.collection}
            onChange={e => updateConfig('collection', e.target.value)}
            className="input-field"
            disabled={running}
          >
            <option value="test_small">test_small</option>
            <option value="test_large">test_large</option>
          </select>
        </div>
        {(config.operation === 'write' || config.operation === 'mixed') && (
          <div>
            <label className="label">Write batch size</label>
            <input
              type="number"
              value={config.batchSize || 1}
              onChange={e => updateConfig('batchSize', parseInt(e.target.value) || 1)}
              className="input-field"
              min={1}
              max={1000}
              disabled={running}
            />
          </div>
        )}
      </div>

      {/* Controls + Stats */}
      <div className="flex items-center gap-3 flex-wrap">
        {!running ? (
          <button
            onClick={handleStart}
            className="btn-primary flex items-center gap-2"
            disabled={!connected}
          >
            <span>&#9654;</span> Start Load
          </button>
        ) : (
          <button
            onClick={handleStop}
            className="btn-danger flex items-center gap-2"
          >
            <span>&#9632;</span> Stop Load
          </button>
        )}

        {running && stats && (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-mongo-green font-mono font-bold">
              {formatNumber(stats.opsPerSec)} ops/s
            </span>
            <span className="text-gray-400">
              Avg: {formatLatency(stats.avgLatencyMs)}
            </span>
            <span className="text-gray-400">
              P95: {formatLatency(stats.p95LatencyMs)}
            </span>
            <span className="text-gray-400">
              P99: {formatLatency(stats.p99LatencyMs)}
            </span>
            {stats.errors > 0 && (
              <span className="text-mongo-red">
                {stats.errors} errors
              </span>
            )}
          </div>
        )}

        {error && <span className="text-sm text-mongo-red">{error}</span>}
      </div>
    </div>
  );
}
