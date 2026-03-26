import React, { useState } from 'react';
import StatusIndicator from './StatusIndicator.jsx';

export default function ConnectionForm({ status, onConnect, onDisconnect, clusterInfo, envConnected }) {
  const [uri, setUri] = useState('');
  const [error, setError] = useState(null);

  const handleConnect = async (e) => {
    e.preventDefault();
    if (!uri.trim()) return;
    setError(null);
    try {
      await onConnect(uri.trim());
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDisconnect = async () => {
    setError(null);
    await onDisconnect();
  };

  const isAtlas = uri.includes('mongodb+srv://') || uri.includes('.mongodb.net');
  const isConnected = status === 'connected';

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-mongo-white">MongoDB Connection</h2>
        <StatusIndicator
          status={status}
          detail={clusterInfo ? `${clusterInfo.version} ${clusterInfo.isAtlas ? '(Atlas)' : '(Self-Managed)'}` : null}
        />
      </div>

      <form onSubmit={handleConnect} className="flex gap-3">
        <div className="flex-1 relative">
          <input
            type="password"
            value={isConnected && envConnected && !uri ? '' : uri}
            onChange={(e) => setUri(e.target.value)}
            placeholder={isConnected && envConnected ? 'Connected via .env' : 'mongodb+srv://user:password@cluster.xxxxx.mongodb.net/'}
            className="input-field font-mono text-sm pr-20"
            disabled={isConnected}
          />
          {uri && !isConnected && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs px-2 py-0.5 rounded bg-mongo-forest text-mongo-green">
              {isAtlas ? 'Atlas' : 'Self-Managed'}
            </span>
          )}
        </div>
        {!isConnected ? (
          <button
            type="submit"
            className="btn-primary whitespace-nowrap"
            disabled={!uri.trim() || status === 'connecting'}
          >
            {status === 'connecting' ? 'Connecting...' : 'Connect'}
          </button>
        ) : (
          <button
            type="button"
            onClick={handleDisconnect}
            className="btn-danger whitespace-nowrap"
          >
            Disconnect
          </button>
        )}
      </form>

      {error && (
        <p className="mt-2 text-sm text-mongo-red">{error}</p>
      )}


      {isConnected && clusterInfo && (
        <div className="mt-3 flex gap-4 text-xs text-gray-400">
          <span>Host: {clusterInfo.host}</span>
          {clusterInfo.replicaSet && <span>RS: {clusterInfo.replicaSet} ({clusterInfo.members} nodes)</span>}
          <span>WT Cache: {clusterInfo.wtCacheMaxGB} GB</span>
          {clusterInfo.demoDb && (
            <span>Demo DB: {clusterInfo.demoDb.collections} collections, {clusterInfo.demoDb.dataSizeGB} GB</span>
          )}
        </div>
      )}
    </div>
  );
}
