export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0 || bytes == null) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(decimals)} ${units[i]}`;
}

export function formatBytesPerSec(bytes) {
  return `${formatBytes(bytes)}/s`;
}

export function formatNumber(num, decimals = 0) {
  if (num == null) return '—';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toFixed(decimals);
}

export function formatPercent(value, decimals = 1) {
  if (value == null) return '—';
  return `${value.toFixed(decimals)}%`;
}

export function formatDuration(seconds) {
  if (seconds == null) return '—';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export function formatLatency(ms) {
  if (ms == null) return '—';
  if (ms < 1) return `${(ms * 1000).toFixed(0)} µs`;
  if (ms < 1000) return `${ms.toFixed(1)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatGB(gb) {
  if (gb == null) return '—';
  return `${gb.toFixed(1)} GB`;
}

export function getStatusColor(value, warnThreshold, criticalThreshold) {
  if (value >= criticalThreshold) return 'text-mongo-red';
  if (value >= warnThreshold) return 'text-mongo-amber';
  return 'text-mongo-green';
}

export function getStatusBg(value, warnThreshold, criticalThreshold) {
  if (value >= criticalThreshold) return 'bg-mongo-red';
  if (value >= warnThreshold) return 'bg-mongo-amber';
  return 'bg-mongo-green';
}
