export const COLORS = {
  dark: '#001E2B',
  darkLight: '#0a2e3d',
  darkLighter: '#112e3c',
  green: '#00ED64',
  forest: '#023430',
  blue: '#016BF8',
  amber: '#FFC010',
  red: '#DB3030',
  white: '#F9FBFA',
  gray: '#889397',
};

export const CHART_COLORS = {
  cacheUsed: '#016BF8',
  cacheDirty: '#FFC010',
  eviction: '#DB3030',
  evictionApp: '#FF6B6B',
  queries: '#00ED64',
  inserts: '#016BF8',
  updates: '#FFC010',
  deletes: '#DB3030',
  latency: '#00ED64',
  throughput: '#016BF8',
  pagesRead: '#00ED64',
  bytesRead: '#016BF8',
};

export const THRESHOLDS = {
  cacheHealthy: 80,    // ~80% is normal for active deployments
  cacheCritical: 95,   // approaching 100% = working set exceeds cache
  dirtyWarn: 5,        // >5% sustained = app threads doing eviction
  dirtyCritical: 20,   // severe checkpoint pressure
  ticketWarn: 10,
  queueWarn: 1,        // any sustained queue = can't keep up
  diskLatencyWarn: 5,  // >5ms
  diskLatencyCritical: 20, // >20ms sustained
};

export const LOAD_PRESETS = [
  {
    name: 'Healthy — In-Cache Reads',
    description: 'Reads from small collection that fits entirely in WT cache. Expect: low disk reads, 0% dirty, no eviction.',
    config: {
      threads: 16,
      targetOpsPerSec: 0,
      pattern: 'random',
      operation: 'read',
      readPercent: 100,
      collection: 'test_small',
      maxId: 500000,
      batchSize: 1,
    },
  },
  {
    name: 'Stressed — Write Storm',
    description: 'Pure batch writes (1000 docs/op). Floods cache with dirty pages to push past 20% threshold.',
    config: {
      threads: 32,
      targetOpsPerSec: 0,
      pattern: 'random',
      operation: 'write',
      readPercent: 0,
      collection: 'test_large',
      maxId: 2000000,
      batchSize: 1000,
    },
  },
];

export const TOPOLOGY_OPTIONS = [
  { value: 'pss', label: 'PSS (3-node Replica Set)' },
  { value: 'pss_analytics', label: 'PSS + Analytics Node' },
  { value: 'pss_hidden', label: 'PSS + Hidden Member' },
];
