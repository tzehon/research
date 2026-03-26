import React from 'react';

const STATUS_CONFIG = {
  disconnected: { color: 'bg-gray-500', label: 'Disconnected', pulse: false },
  connecting: { color: 'bg-mongo-amber', label: 'Connecting...', pulse: true },
  connected: { color: 'bg-mongo-green', label: 'Connected', pulse: false },
  error: { color: 'bg-mongo-red', label: 'Error', pulse: true },
};

export default function StatusIndicator({ status, detail }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.disconnected;

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex items-center">
        <span className={`inline-block w-3 h-3 rounded-full ${config.color}`} />
        {config.pulse && (
          <span className={`absolute inline-block w-3 h-3 rounded-full ${config.color} animate-ping opacity-75`} />
        )}
      </div>
      <span className="text-sm text-gray-400">
        {config.label}
        {detail && <span className="text-gray-500 ml-1">({detail})</span>}
      </span>
    </div>
  );
}
