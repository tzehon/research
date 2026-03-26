import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
  Legend,
} from 'recharts';
import { COLORS, CHART_COLORS, THRESHOLDS } from '../utils/constants.js';
import { formatNumber, formatPercent, formatBytes } from '../utils/formatters.js';

function ChartCard({ title, children }) {
  return (
    <div className="card">
      <h3 className="text-sm font-medium text-gray-400 mb-3">{title}</h3>
      <div className="h-48">
        {children}
      </div>
    </div>
  );
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  return `${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-mongo-dark border border-mongo-forest rounded-lg px-3 py-2 shadow-xl">
      <p className="text-xs text-gray-500 mb-1">{formatTime(label)}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-xs" style={{ color: entry.color }}>
          {entry.name}: {typeof entry.value === 'number' ? entry.value.toFixed(1) : entry.value}
        </p>
      ))}
    </div>
  );
}

export default function MetricsCharts({ history, clearHistory }) {
  const chartData = useMemo(() => {
    return history.map(m => ({
      time: m.timestamp,
      cacheUsed: +m.cache.usedPercent.toFixed(1),
      cacheDirty: +m.cache.dirtyPercent.toFixed(1),
      queryRate: Math.round(m.operations.queryRate),
      insertRate: Math.round(m.operations.insertRate),
      totalRate: Math.round(m.operations.totalRate),
      evictionApp: +m.cache.pagesEvictedApp.toFixed(1),
      pagesRead: +m.cache.pagesReadRate.toFixed(1),
      bytesRead: Math.round(m.cache.bytesReadRate / 1024 / 1024), // MB/s
      queueTotal: m.queues?.total || 0,
    }));
  }, [history]);

  if (chartData.length < 2) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card">
            <div className="h-3 w-32 bg-mongo-forest rounded mb-3" />
            <div className="h-48 flex items-center justify-center text-gray-600 text-sm">
              Collecting data...
            </div>
          </div>
        ))}
      </div>
    );
  }

  const commonProps = {
    data: chartData,
    margin: { top: 5, right: 5, bottom: 5, left: 5 },
  };

  const axisProps = {
    xAxis: {
      dataKey: 'time',
      tickFormatter: formatTime,
      stroke: COLORS.gray,
      fontSize: 10,
      interval: 'preserveStartEnd',
    },
    yAxis: {
      stroke: COLORS.gray,
      fontSize: 10,
      width: 45,
    },
    grid: {
      strokeDasharray: '3 3',
      stroke: COLORS.forest,
    },
  };

  return (
    <div className="space-y-3">
      {clearHistory && (
        <div className="flex justify-end">
          <button
            onClick={clearHistory}
            className="text-xs px-3 py-1.5 rounded-lg border border-mongo-forest text-gray-400 hover:text-mongo-white hover:border-gray-500 transition-colors"
          >
            Clear Charts
          </button>
        </div>
      )}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <ChartCard title="Dirty Fill Ratio %">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart {...commonProps}>
            <CartesianGrid {...axisProps.grid} />
            <XAxis {...axisProps.xAxis} />
            <YAxis {...axisProps.yAxis} domain={[0, (max) => Math.max(max, 25)]} tickFormatter={v => `${v}%`} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceArea y1={20} y2={100} fill={COLORS.red} fillOpacity={0.12} label={{ value: 'APP THREADS', fill: COLORS.red, fontSize: 10, position: 'insideTopRight' }} />
            <ReferenceArea y1={5} y2={20} fill={COLORS.amber} fillOpacity={0.08} label={{ value: 'WORKER THREADS', fill: COLORS.amber, fontSize: 9, position: 'insideTopRight' }} />
            <ReferenceLine y={5} stroke={COLORS.amber} strokeDasharray="5 5" strokeWidth={1} />
            <ReferenceLine y={20} stroke={COLORS.red} strokeWidth={2} />
            <Line type="monotone" dataKey="cacheDirty" name="Dirty %" stroke={CHART_COLORS.cacheDirty} dot={false} strokeWidth={3} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Queued Operations — should always be 0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart {...commonProps}>
            <CartesianGrid {...axisProps.grid} />
            <XAxis {...axisProps.xAxis} />
            <YAxis {...axisProps.yAxis} tickFormatter={formatNumber} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceArea y1={1} y2={1000} fill={COLORS.red} fillOpacity={0.1} />
            <ReferenceLine y={0} stroke={COLORS.green} strokeWidth={1} />
            <Line type="monotone" dataKey="queueTotal" name="Queued ops" stroke={CHART_COLORS.evictionApp} dot={false} strokeWidth={3} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Throughput (ops/sec)">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart {...commonProps}>
            <CartesianGrid {...axisProps.grid} />
            <XAxis {...axisProps.xAxis} />
            <YAxis {...axisProps.yAxis} tickFormatter={formatNumber} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="queryRate" name="Queries/s" stroke={CHART_COLORS.queries} dot={false} strokeWidth={2} isAnimationActive={false} />
            <Line type="monotone" dataKey="insertRate" name="Inserts/s" stroke={CHART_COLORS.inserts} dot={false} strokeWidth={2} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Cache Misses (reads from disk)">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart {...commonProps}>
            <CartesianGrid {...axisProps.grid} />
            <XAxis {...axisProps.xAxis} />
            <YAxis yAxisId="pages" {...axisProps.yAxis} tickFormatter={formatNumber} />
            <YAxis yAxisId="bytes" orientation="right" {...axisProps.yAxis} tickFormatter={v => `${v}M`} width={40} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line yAxisId="pages" type="monotone" dataKey="pagesRead" name="Pages/s" stroke={CHART_COLORS.pagesRead} dot={false} strokeWidth={2} isAnimationActive={false} />
            <Line yAxisId="bytes" type="monotone" dataKey="bytesRead" name="MB/s from disk" stroke={CHART_COLORS.bytesRead} dot={false} strokeWidth={2} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
    </div>
  );
}
