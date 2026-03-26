import React from 'react';
import MetricsPanel from '../components/MetricsPanel.jsx';
import MetricsCharts from '../components/MetricsChart.jsx';
import LoadControls from '../components/LoadControls.jsx';

export default function Observatory({ connected, metrics, history, clusterInfo, clearHistory }) {
  return (
    <div className="space-y-4">
      {/* Load Generator */}
      <LoadControls connected={connected} collections={clusterInfo?.collections} clearHistory={clearHistory} />

      {/* Gauge Cards */}
      <MetricsPanel metrics={metrics} />

      {/* Time-Series Charts */}
      <MetricsCharts history={history} clearHistory={clearHistory} />
    </div>
  );
}
