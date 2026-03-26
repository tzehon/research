import React, { useState, useCallback, useEffect, useRef } from 'react';
import ConnectionForm from './components/ConnectionForm.jsx';
import Observatory from './pages/Observatory.jsx';
import Calculator from './pages/Calculator.jsx';
import { useMetricsStream } from './hooks/useMetricsStream.js';
import { useClusterInfo } from './hooks/useClusterInfo.js';

export default function App() {
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [activeTab, setActiveTab] = useState('observatory');
  const [cleanupMessage, setCleanupMessage] = useState(null);
  const [envUri, setEnvUri] = useState(false);
  const autoConnectAttempted = useRef(false);

  const { clusterInfo, fetchInfo, clear: clearClusterInfo } = useClusterInfo();
  const connected = connectionStatus === 'connected';
  const { metrics, history, clearHistory } = useMetricsStream(connected);

  const handleConnect = useCallback(async (uri) => {
    setConnectionStatus('connecting');
    try {
      const res = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Connection failed (HTTP ${res.status})`);
      }
      setConnectionStatus('connected');
      await fetchInfo();
    } catch (err) {
      setConnectionStatus('error');
      throw err;
    }
  }, [fetchInfo]);

  // Auto-connect from .env on first load
  useEffect(() => {
    if (autoConnectAttempted.current) return;
    autoConnectAttempted.current = true;

    (async () => {
      try {
        const statusRes = await fetch('/api/status');
        const status = await statusRes.json();
        if (status.connected) {
          setConnectionStatus('connected');
          setEnvUri(true);
          await fetchInfo();
          return;
        }
        if (status.hasEnvUri) {
          setEnvUri(true);
          setConnectionStatus('connecting');
          const res = await fetch('/api/connect/env', { method: 'POST' });
          if (res.ok) {
            setConnectionStatus('connected');
            await fetchInfo();
          } else {
            setConnectionStatus('disconnected');
          }
        }
      } catch {
        // ignore — user can connect manually
      }
    })();
  }, [fetchInfo]);

  const handleDisconnect = useCallback(async () => {
    try {
      await fetch('/api/disconnect', { method: 'POST' });
    } catch (e) {
      // ignore
    }
    setConnectionStatus('disconnected');
    clearClusterInfo();
  }, [clearClusterInfo]);

  const handleCleanup = useCallback(async () => {
    try {
      const res = await fetch('/api/cleanup', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setCleanupMessage({ type: 'success', text: data.message });
        fetchInfo();
      } else {
        setCleanupMessage({ type: 'error', text: data.error });
      }
    } catch (err) {
      setCleanupMessage({ type: 'error', text: err.message });
    }
    setTimeout(() => setCleanupMessage(null), 5000);
  }, [fetchInfo]);

  return (
    <div className="min-h-screen bg-mongo-dark">
      {/* Header */}
      <header className="border-b border-mongo-forest px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M16.2 2c-.4 4.4-3.8 6.2-4.2 10.4-.3 3.8 2 7.2 4 9.6.1-1 .3-2 .3-2s3.2-3.2 3.6-7.2C20.3 8.8 16.2 2 16.2 2z" fill="#00ED64"/>
              <path d="M16.2 22s-.1 1-.3 2c2 2.4 2.2 6 2.2 6s.1 0 .1-.1c1.4-1.8 2.4-4.6 1.6-7.2-.4.4-3.6.3-3.6-.7z" fill="#023430"/>
            </svg>
            <div>
              <h1 className="text-lg font-bold text-mongo-white">RAM Pool Observatory</h1>
              <p className="text-xs text-gray-500">For educational and illustrative purposes only</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Tabs */}
            <nav className="flex gap-1 bg-mongo-dark-light rounded-lg p-1">
              <button
                onClick={() => setActiveTab('observatory')}
                className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                  activeTab === 'observatory'
                    ? 'bg-mongo-forest text-mongo-green font-medium'
                    : 'text-gray-400 hover:text-mongo-white'
                }`}
              >
                Observatory
              </button>
              <button
                onClick={() => setActiveTab('calculator')}
                className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                  activeTab === 'calculator'
                    ? 'bg-mongo-forest text-mongo-green font-medium'
                    : 'text-gray-400 hover:text-mongo-white'
                }`}
              >
                Calculator
              </button>
            </nav>

            {/* Cleanup */}
            {connected && (
              <button
                onClick={handleCleanup}
                className="text-xs px-3 py-1.5 rounded-lg border border-mongo-red/30 text-mongo-red hover:bg-mongo-red/10 transition-colors"
              >
                Clean Up Demo Data
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Cleanup message */}
      {cleanupMessage && (
        <div className={`px-6 py-2 text-sm text-center ${
          cleanupMessage.type === 'success' ? 'bg-mongo-forest text-mongo-green' : 'bg-mongo-red/20 text-mongo-red'
        }`}>
          {cleanupMessage.text}
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-4 space-y-4">
        {/* Connection Form (always visible) */}
        <ConnectionForm
          status={connectionStatus}
          onConnect={handleConnect}
          onDisconnect={handleDisconnect}
          clusterInfo={clusterInfo}
          envConnected={envUri}
        />

        {/* Tab Content */}
        {activeTab === 'observatory' ? (
          <Observatory
            connected={connected}
            metrics={metrics}
            history={history}
            clusterInfo={clusterInfo}
            clearHistory={clearHistory}
          />
        ) : (
          <Calculator
            metrics={metrics}
            clusterInfo={clusterInfo}
          />
        )}
      </main>
    </div>
  );
}
