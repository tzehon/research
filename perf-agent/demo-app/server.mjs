import http from 'node:http';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { Registry, Histogram, Gauge } from 'prom-client';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { LoggerProvider, BatchLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { search } from './src/search.mjs';
const service = process.env.SERVICE_NAME || 'storefront';
const revision = process.env.REVISION || 'development';
const deployment = process.env.DEPLOYMENT_ID || 'development';
const resource = resourceFromAttributes({
  'service.name': service,
  'service.version': revision,
  'deployment.environment.name': 'local-demo',
});
const sdk = new NodeSDK({ resource, traceExporter: new OTLPTraceExporter() });
sdk.start();
const loggerProvider = new LoggerProvider({
  resource,
  processors: [
    new BatchLogRecordProcessor({ exporter: new OTLPLogExporter(), scheduledDelayMillis: 500 }),
  ],
});
const logger = loggerProvider.getLogger('storefront');
const tracer = trace.getTracer('storefront');
const registry = new Registry();
const labels = { service, revision, deployment };
registry.setDefaultLabels(labels);
const duration = new Histogram({
  name: 'storefront_request_duration_seconds',
  help: 'HTTP response duration by bounded route and status',
  labelNames: ['route', 'status'],
  buckets: [
    0.005, 0.01, 0.02, 0.03, 0.05, 0.075, 0.1, 0.15, 0.18, 0.2, 0.25, 0.3, 0.4, 0.5, 0.75, 1, 1.5,
    2, 3, 5, 10,
  ],
  registers: [registry],
});
const heartbeat = new Gauge({
  name: 'storefront_heartbeat_seconds',
  help: 'Exporter wall clock for freshness checks',
  registers: [registry],
});
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  options: '-c statement_timeout=5000',
});
const db = {
  query: async (sql, params) =>
    tracer.startActiveSpan(
      'postgresql.query',
      { attributes: { 'db.system.name': 'postgresql', 'db.query.text': sql } },
      async (span) => {
        try {
          const result = await pool.query(sql, params);
          span.setAttribute('db.response.returned_rows', result.rowCount || 0);
          return result;
        } catch (e) {
          span.recordException(e);
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw e;
        } finally {
          span.end();
        }
      }
    ),
};
const html = readFileSync(new URL('./index.html', import.meta.url));
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/metrics') {
    heartbeat.set(Date.now() / 1000);
    res.setHeader('Content-Type', registry.contentType);
    res.end(await registry.metrics());
    return;
  }
  if (url.pathname === '/health') {
    try {
      await pool.query('SELECT 1');
      res.end(JSON.stringify({ ok: true, service, revision, deployment }));
    } catch {
      res.statusCode = 503;
      res.end('database unavailable');
    }
    return;
  }
  const route =
    url.pathname === '/api/products' ? '/api/products' : url.pathname === '/' ? '/' : '/other';
  const start = performance.now();
  await tracer.startActiveSpan(
    `GET ${route}`,
    {
      attributes: {
        'http.request.method': 'GET',
        'http.route': route,
        'service.version': revision,
        'deployment.id': deployment,
      },
    },
    async (span) => {
      try {
        if (route === '/api/products') {
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              products: await search(db, (url.searchParams.get('q') || '').slice(0, 80)),
              revision,
            })
          );
        } else if (route === '/') {
          res.setHeader('Content-Type', 'text/html');
          res.end(html);
        } else {
          res.statusCode = 404;
          res.end('Not found');
        }
      } catch (e) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'Catalog temporarily unavailable' }));
        span.recordException(e);
        span.setStatus({ code: SpanStatusCode.ERROR });
      } finally {
        const seconds = (performance.now() - start) / 1000;
        duration.labels(route, String(res.statusCode)).observe(seconds);
        span.setAttribute('http.response.status_code', res.statusCode);
        const record = {
          message: 'request completed',
          route,
          status: res.statusCode,
          duration_ms: seconds * 1000,
          service,
          revision,
          deployment,
          trace_id: span.spanContext().traceId,
        };
        logger.emit({
          body: JSON.stringify(record),
          severityNumber: res.statusCode >= 500 ? 17 : 9,
          context: context.active(),
          attributes: { route, revision, deployment },
        });
        console.log(JSON.stringify(record));
        span.end();
      }
    }
  );
});
// Binding to all interfaces allows the local Docker collector to scrape the host.
server.listen(Number(process.env.PORT || 4100), '0.0.0.0');
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  server.close();
  await Promise.all([sdk.shutdown(), loggerProvider.shutdown(), pool.end()]);
  process.exit(0);
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
