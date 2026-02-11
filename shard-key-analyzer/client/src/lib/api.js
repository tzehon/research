const API_BASE = '/api';

/**
 * Generic fetch wrapper with error handling
 */
async function fetchApi(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;

  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  if (options.body && typeof options.body === 'object') {
    config.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, config);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || error.message || 'API request failed');
  }

  return response.json();
}

// Connection API
export const connectionApi = {
  getStatus: () => fetchApi('/connection/status'),
  connect: (connectionString, database) =>
    fetchApi('/connection/connect', {
      method: 'POST',
      body: { connectionString, database },
    }),
  disconnect: () => fetchApi('/connection/disconnect', { method: 'POST' }),
  getShards: () => fetchApi('/connection/shards'),
  verifyPermissions: (database, collection) =>
    fetchApi('/connection/verify-permissions', {
      method: 'POST',
      body: { database, collection },
    }),
};

// Explorer API
export const explorerApi = {
  getDatabases: () => fetchApi('/explorer/databases'),
  getCollections: (database) => fetchApi(`/explorer/collections/${database}`),
  getSchema: (database, collection, sampleSize = 100) =>
    fetchApi(`/explorer/schema/${database}/${collection}?sampleSize=${sampleSize}`),
  getStats: (database, collection) =>
    fetchApi(`/explorer/stats/${database}/${collection}`),
  getIndexes: (database, collection) =>
    fetchApi(`/explorer/indexes/${database}/${collection}`),
  getFieldAnalysis: (database, collection) =>
    fetchApi(`/explorer/field-analysis/${database}/${collection}`),
};

// Sampling API
export const samplingApi = {
  start: (database, collection, samplesPerSecond = 10) =>
    fetchApi('/sampling/start', {
      method: 'POST',
      body: { database, collection, samplesPerSecond },
    }),
  stop: (database, collection) =>
    fetchApi('/sampling/stop', {
      method: 'POST',
      body: { database, collection },
    }),
  updateRate: (samplesPerSecond) =>
    fetchApi('/sampling/update-rate', {
      method: 'POST',
      body: { samplesPerSecond },
    }),
  getStatus: () => fetchApi('/sampling/status'),
  getQueries: (database, collection, limit = 100, skip = 0) =>
    fetchApi(`/sampling/queries?database=${database}&collection=${collection}&limit=${limit}&skip=${skip}`),
  getStats: (database, collection) =>
    fetchApi(`/sampling/stats?database=${database}&collection=${collection}`),
  clearQueries: (database, collection) =>
    fetchApi(`/sampling/queries?database=${database}&collection=${collection}`, {
      method: 'DELETE',
    }),
};

// Workload API
export const workloadApi = {
  getProfiles: () => fetchApi('/workload/profiles'),
  start: (config) =>
    fetchApi('/workload/start', {
      method: 'POST',
      body: config,
    }),
  stop: () => fetchApi('/workload/stop', { method: 'POST' }),
  getStatus: () => fetchApi('/workload/status'),
};

// Analysis API
export const analysisApi = {
  analyze: (config) =>
    fetchApi('/analysis/analyze', {
      method: 'POST',
      body: config,
    }),
  analyzeSingle: (database, collection, key, options = {}) =>
    fetchApi('/analysis/analyze-single', {
      method: 'POST',
      body: { database, collection, key, ...options },
    }),
  getResults: (id) => fetchApi(`/analysis/results/${id}`),
  checkIndex: (database, collection, key) =>
    fetchApi('/analysis/check-index', {
      method: 'POST',
      body: { database, collection, key },
    }),
  clearResults: () => fetchApi('/analysis/results', { method: 'DELETE' }),
};

// Sample Data API
export const sampleDataApi = {
  getDatasets: () => fetchApi('/sample-data/datasets'),
  load: (config) =>
    fetchApi('/sample-data/load', {
      method: 'POST',
      body: config,
    }),
  getStatus: () => fetchApi('/sample-data/status'),
  stop: () => fetchApi('/sample-data/stop', { method: 'POST' }),
};

export default {
  connection: connectionApi,
  explorer: explorerApi,
  sampling: samplingApi,
  workload: workloadApi,
  analysis: analysisApi,
  sampleData: sampleDataApi,
};
