import React from 'react';
import { formatBytes, formatBytesPerSec, formatPercent, formatNumber } from '../utils/formatters.js';
import { THRESHOLDS } from '../utils/constants.js';

function GaugeCard({ title, value, subtitle, color, status, statusColor, mongoshCmd, alert }) {
  return (
    <div className="card flex flex-col items-center justify-center min-w-0 group relative">
      <p className="text-xs text-gray-500 mb-1 truncate w-full text-center">{title}</p>
      <p className={`gauge-value ${color || 'text-mongo-white'}`}>{value}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      {status && (
        <p className={`text-xs font-semibold mt-1 ${statusColor || 'text-gray-500'}`}>{status}</p>
      )}
      {alert && <p className="text-xs text-mongo-red mt-0.5 animate-pulse font-semibold">{alert}</p>}
      {mongoshCmd && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-mongo-dark border border-mongo-forest rounded-lg text-xs font-mono text-gray-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 shadow-xl">
          {mongoshCmd}
        </div>
      )}
    </div>
  );
}

// Cache fill thresholds (% of total cache):
//   <80%  no eviction
//   80%+  worker threads evict clean pages (normal)
//   95%+  app threads forced to evict (latency impact!)
//   100%  new ops blocked until eviction frees space
function getCacheStatus(pct) {
  if (pct < 80) return { status: 'No eviction', color: 'text-gray-500' };
  if (pct < 95) return { status: 'Worker thread eviction', color: 'text-mongo-green' };
  if (pct < 100) return { status: 'App thread eviction!', color: 'text-mongo-red' };
  return { status: 'Ops blocked!', color: 'text-mongo-red' };
}

function getCacheColor(pct) {
  if (pct >= 95) return 'text-mongo-red';
  if (pct >= 80) return 'text-mongo-green';
  return 'text-mongo-white';
}

// Dirty fill thresholds (% of total cache that is dirty):
// Dirty pages are a subset of used cache — modified but not yet flushed.
//   <5%   no special policy
//   5%+   worker threads write out dirty pages
//   20%+  app threads forced to help (latency impact!)
function getDirtyStatus(pct) {
  if (pct < 5) return { status: 'Healthy', color: 'text-mongo-green' };
  if (pct < 20) return { status: 'Worker threads writing', color: 'text-mongo-amber' };
  return { status: 'App thread eviction!', color: 'text-mongo-red' };
}

function getDirtyColor(pct) {
  if (pct >= 20) return 'text-mongo-red';
  if (pct >= 5) return 'text-mongo-amber';
  return 'text-mongo-green';
}

export default function MetricsPanel({ metrics }) {
  if (!metrics) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="card flex flex-col items-center justify-center animate-pulse">
            <div className="h-3 w-16 bg-mongo-forest rounded mb-2" />
            <div className="h-8 w-20 bg-mongo-forest rounded" />
          </div>
        ))}
      </div>
    );
  }

  const cachePercent = metrics.cache.usedPercent;
  const dirtyPercent = metrics.cache.dirtyPercent;
  const totalEviction = metrics.cache.pagesEvictedTotal;
  const appEviction = metrics.cache.pagesEvictedApp;
  const bytesReadRate = metrics.cache.bytesReadRate;
  const queueTotal = metrics.queues?.total || 0;

  const cacheStatus = getCacheStatus(cachePercent);
  const dirtyStatus = getDirtyStatus(dirtyPercent);

  return (
    <>
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
      <GaugeCard
        title="Cache Fill Ratio"
        value={formatPercent(cachePercent)}
        subtitle={formatBytes(metrics.cache.usedBytes)}
        color={getCacheColor(cachePercent)}
        status={cacheStatus.status}
        statusColor={cacheStatus.color}
        mongoshCmd='db.serverStatus().wiredTiger.cache["bytes currently in the cache"]'
      />
      <GaugeCard
        title="Dirty Fill Ratio"
        value={formatPercent(dirtyPercent)}
        subtitle={formatBytes(metrics.cache.dirtyBytes)}
        color={getDirtyColor(dirtyPercent)}
        status={dirtyStatus.status}
        statusColor={dirtyStatus.color}
        mongoshCmd='db.serverStatus().wiredTiger.cache["tracked dirty bytes in the cache"]'
      />
      <GaugeCard
        title="App Thread Eviction"
        value={formatNumber(appEviction)}
        subtitle="pages/s"
        color={appEviction > 0 ? 'text-mongo-red' : 'text-mongo-green'}
        status={appEviction > 0 ? 'Degraded!' : 'Healthy'}
        statusColor={appEviction > 0 ? 'text-mongo-red' : 'text-mongo-green'}
        mongoshCmd='db.serverStatus().wiredTiger.cache["pages evicted by application threads"]'
      />
      <GaugeCard
        title="Disk Reads"
        value={formatBytesPerSec(bytesReadRate)}
        subtitle={`${formatNumber(metrics.cache.pagesReadRate)} pages/s`}
        color={bytesReadRate > 10 * 1024 * 1024 ? 'text-mongo-red' : bytesReadRate > 1024 * 1024 ? 'text-mongo-amber' : 'text-mongo-green'}
        status={bytesReadRate < 1024 ? 'In-cache' : bytesReadRate > 5 * 1024 * 1024 ? 'Disk-bound' : 'Some disk I/O'}
        statusColor={bytesReadRate < 1024 ? 'text-mongo-green' : bytesReadRate > 5 * 1024 * 1024 ? 'text-mongo-red' : 'text-mongo-amber'}
        mongoshCmd='db.serverStatus().wiredTiger.cache["bytes read into cache"]'
      />
      <GaugeCard
        title="Queued Ops"
        value={formatNumber(queueTotal)}
        subtitle={queueTotal > 0 ? `R:${metrics.queues?.readers || 0} W:${metrics.queues?.writers || 0}` : 'none waiting'}
        color={queueTotal > 0 ? 'text-mongo-red' : 'text-mongo-green'}
        status={queueTotal > 0 ? 'Can\'t keep up' : 'Healthy'}
        statusColor={queueTotal > 0 ? 'text-mongo-red' : 'text-mongo-green'}
        mongoshCmd='db.serverStatus().globalLock.currentQueue'
      />
      <GaugeCard
        title="Connections"
        value={formatNumber(metrics.connections.current)}
        subtitle={`${formatNumber(metrics.connections.available)} available`}
        status={`~${formatBytes(metrics.connections.current * 1024 * 1024)} RAM`}
        statusColor="text-gray-500"
        mongoshCmd='db.serverStatus().connections'
      />
      <GaugeCard
        title="Ops/sec"
        value={formatNumber(metrics.operations.totalRate)}
        subtitle={`Q:${formatNumber(metrics.operations.queryRate)} I:${formatNumber(metrics.operations.insertRate)}`}
        color="text-mongo-blue"
        mongoshCmd='db.serverStatus().opcounters'
      />
    </div>

    {/* WT eviction threshold reference */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
      <div className="card py-3">
        <p className="text-xs font-semibold text-gray-400 mb-2">Cache Fill Thresholds (clean pages)</p>
        <div className="flex items-center gap-1 text-xs">
          <div className={`flex-1 px-2 py-1.5 rounded text-center ${cachePercent < 80 ? 'ring-2 ring-gray-500' : ''}`}>
            <span className="bg-mongo-dark text-mongo-green block rounded px-1 py-0.5">&lt;80% no eviction</span>
            <span className="text-mongo-green mt-0.5 block font-bold">Good</span>
          </div>
          <div className={`flex-1 px-2 py-1.5 rounded text-center ${cachePercent >= 80 && cachePercent < 95 ? 'ring-2 ring-mongo-amber' : ''}`}>
            <span className="bg-mongo-amber/10 text-mongo-amber block rounded px-1 py-0.5 font-medium">80%+ worker threads</span>
            <span className="text-mongo-amber mt-0.5 block font-bold">Not ideal</span>
          </div>
          <div className={`flex-1 px-2 py-1.5 rounded text-center ${cachePercent >= 95 ? 'ring-2 ring-mongo-red' : ''}`}>
            <span className="bg-mongo-red/20 text-mongo-red block rounded px-1 py-0.5 font-medium">95%+ app threads!</span>
            <span className="text-mongo-red mt-0.5 block font-bold">Very bad</span>
          </div>
        </div>
      </div>
      <div className="card py-3">
        <p className="text-xs font-semibold text-gray-400 mb-2">Dirty Fill Thresholds (modified pages)</p>
        <div className="flex items-center gap-1 text-xs">
          <div className={`flex-1 px-2 py-1.5 rounded text-center ${dirtyPercent < 5 ? 'ring-2 ring-mongo-green' : ''}`}>
            <span className="bg-mongo-dark text-mongo-green block rounded px-1 py-0.5">&lt;5% no action</span>
            <span className="text-mongo-green mt-0.5 block font-bold">Good</span>
          </div>
          <div className={`flex-1 px-2 py-1.5 rounded text-center ${dirtyPercent >= 5 && dirtyPercent < 20 ? 'ring-2 ring-mongo-amber' : ''}`}>
            <span className="bg-mongo-amber/10 text-mongo-amber block rounded px-1 py-0.5 font-medium">5%+ worker threads</span>
            <span className="text-mongo-amber mt-0.5 block font-bold">Not ideal</span>
          </div>
          <div className={`flex-1 px-2 py-1.5 rounded text-center ${dirtyPercent >= 20 ? 'ring-2 ring-mongo-red' : ''}`}>
            <span className="bg-mongo-red/20 text-mongo-red block rounded px-1 py-0.5 font-medium">20%+ app threads!</span>
            <span className="text-mongo-red mt-0.5 block font-bold">Very bad</span>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
