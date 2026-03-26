# MongoDB RAM Pool Observatory & Sizing Calculator

A full-stack demo application that combines **live WiredTiger cache metrics with configurable load testing** and an **interactive RAM Pool sizing calculator**. Built for MongoDB Advisory Solutions Architects to demonstrate memory architecture during working sessions with infrastructure/DB operations teams.

## Overview

Two integrated views:

- **Observatory** — Connects to a MongoDB cluster, displays real-time WiredTiger cache metrics with color-coded health indicators, and generates configurable load to demonstrate healthy vs stressed cache behaviour
- **Sizing Calculator** — Calculates recommended `cacheSizeGB` and container memory limits, with visual breakdowns, RAM Pool totals, and MCK YAML / Atlas tier output

The app auto-connects from `.env` on startup — no manual URI entry needed.

## Architecture

```
Frontend:  React (Vite) + Tailwind CSS + Recharts
Backend:   Node.js (Express) + MongoDB Node.js Driver
Load Gen:  Node.js worker threads (16 concurrent ops per thread)
Metrics:   Server-Sent Events (SSE), polled every 1 second
```

Data flow:
1. Browser connects to Express backend via REST + SSE
2. Backend polls `db.serverStatus()` every 1s, computes delta rates, streams via SSE
3. Load generator spawns worker threads, each with its own MongoClient and 16 concurrent ops in-flight
4. All load targets the `ram_pool_demo` database only — never touches customer data

## Prerequisites

- **Node.js 18+** (LTS)
- Network access to a MongoDB cluster (4.4+, 5.0, 6.0, 7.0, 8.0)
- MongoDB user with:
  - `readWrite` on `ram_pool_demo` database
  - `clusterMonitor` role (for `serverStatus`)
- **Atlas**: M10+ tier required (shared tiers don't expose WT cache metrics)

## Quick Start

```bash
# 1. Install
cd mongodb-ram-observatory
npm install && cd client && npm install && cd ..

# 2. Configure
cp .env.example .env
# Set MONGODB_URI in .env — the app auto-connects on startup

# 3. Seed test data (adjust --large-count based on your WT cache size)
npm run seed -- --large-count 2000000

# 4. Verify
npm run verify-seed

# 5. Start
npm start
# Opens at http://localhost:3000, auto-connects using .env URI
```

For development with hot-reload:
```bash
npm run dev
```

## Seeding Test Data

The seed script creates two collections in `ram_pool_demo`:

| Collection | Documents | ~Size (uncompressed) | Purpose |
|-----------|-----------|---------------------|---------|
| `test_small` | 500,000 | ~250 MB | Fits in WT cache — healthy baseline |
| `test_large` | adjustable | varies | Should exceed WT cache by 2x — stressed scenario |

**Sizing test_large:** Check your WT cache size, then seed at least 2x that amount:
```bash
mongosh "mongodb+srv://..." --eval 'db.serverStatus().wiredTiger.cache["maximum bytes configured"]'
# 536870912 = 512 MB → seed ~1 GB+ of data:
npm run seed -- --large-count 2000000
```

**Atlas note:** Seeding over the internet is slow. Seed the night before. The script uses `ordered: false` bulk writes in batches of 5,000.

## Using the Observatory

### Metrics Dashboard (7 gauge cards)

| Metric | What it shows | Source |
|--------|--------------|--------|
| **Cache Fill Ratio** | % of WT cache used. ~80% is normal. | `wiredTiger.cache["bytes currently in the cache"]` |
| **Dirty Fill Ratio** | % of cache holding modified unflushed pages. Key health indicator. | `wiredTiger.cache["tracked dirty bytes in the cache"]` |
| **App Thread Eviction** | Pages/s evicted by application threads. Should be 0. | `wiredTiger.cache["pages evicted by application threads"]` |
| **Disk Reads** | Bytes/s read from disk into cache (cache misses). | `wiredTiger.cache["bytes read into cache"]` |
| **Queued Ops** | Operations waiting. Any value > 0 = can't keep up. | `globalLock.currentQueue` |
| **Connections** | Current connections (~1 MB RAM each). | `connections.current` |
| **Ops/sec** | Query + insert rate. | `opcounters` |

Each card shows a color-coded status label (Healthy / Worker threads writing / App thread eviction! / etc.) and the `mongosh` command on hover.

### WiredTiger Eviction Thresholds

The dashboard displays these reference thresholds inline:

**Cache Fill (clean pages):**
| Range | What happens | Status |
|-------|-------------|--------|
| < 80% | No eviction | **Good** |
| 80%+ | Worker threads evict clean pages | **Not ideal** |
| 95%+ | App threads forced to evict | **Very bad** |

**Dirty Fill (modified pages):**
| Range | What happens | Status |
|-------|-------------|--------|
| < 5% | No special policy | **Good** |
| 5%+ | Worker threads write out dirty pages | **Not ideal** |
| 20%+ | App threads forced to help write out | **Very bad** |

The current zone is highlighted with a ring indicator. Worker threads are WiredTiger's dedicated background eviction threads. App threads are the threads serving your queries — when they get pulled into eviction work, query latency spikes.

### Time-Series Charts (4 charts)

1. **Dirty Fill Ratio %** — with shaded danger zones (amber 5-20%, red 20%+) and threshold lines
2. **Queued Operations** — should always be 0; red zone above 0
3. **Throughput (ops/sec)** — queries and inserts per second
4. **Cache Misses (reads from disk)** — pages/s and MB/s read from disk into cache

Charts auto-clear when starting a new load preset. Manual "Clear Charts" button also available.

## Using the Load Generator

### Presets

| Preset | Config | What to watch |
|--------|--------|--------------|
| **Healthy — In-Cache Reads** | 16 threads, reads from `test_small`, uncapped | All green: 0 disk reads, 0 dirty, 0 queued ops |
| **Stressed — Write Storm** | 32 threads, pure writes, 1000 docs/batch, uncapped | Dirty fill climbs past 5% toward 20%, queued ops appear, disk reads spike |

### Custom Configuration

All parameters are tunable in the UI:
- **Threads**: 1-256 worker threads
- **Target ops/s**: 0 = uncapped (no rate limit), or set a specific rate
- **Pattern**: Random / Skewed (80/20) / Sequential
- **Operation**: Read / Write / Mixed (configurable read %)
- **Collection**: test_small or test_large
- **Write batch size**: docs per `insertMany` call (1-1000). Higher = more dirty data per network round-trip. Key for generating cache pressure on remote clusters.

### Safety Features

- Load auto-stops after 5 minutes
- Stop button terminates all workers immediately
- All operations target `ram_pool_demo` only

## Using the Sizing Calculator

### Inputs

| Input | Default | Description |
|-------|---------|-------------|
| Deployment Target | Auto-detected | EA on OpenShift or Atlas |
| Working Set Size (GB) | — | Can auto-populate from live cache usage |
| Working Set Headroom % | 20% | For dirty pages and MVCC overhead |
| Max Connections | 200 | Can auto-populate from live connections |
| Aggregation Memory (GB) | 0.5 | Concurrent pipeline memory |
| Internal Overhead (GB) | 1.0 | WT metadata, query plans, etc. |
| TCMalloc Overhead % | 12% | Memory allocator overhead |
| FS Cache Headroom % | 25% | OS page cache budget |
| Topology | PSS | PSS / PSS + analytics / PSS + hidden |
| Replica Sets | 1 | For total RAM Pool calculation |
| mongos Instances | 0 | For sharded clusters |

**"Use Observed Values"** button auto-fills from live cluster metrics.

### Output

1. **Two Key Numbers** — `cacheSizeGB` (performance lever) and container memory limit (licensing lever)
2. **Memory Breakdown** — Visual bar chart: WT cache, connections, agg buffers, TCMalloc, FS cache
3. **RAM Pool Summary Table** — Total across all nodes and replica sets
4. **Comparison** — Current vs recommended (if you input current container size or Atlas tier)
5. **MCK YAML** (EA on OpenShift) — Copyable custom resource snippet
6. **Atlas Tier Recommendation** (Atlas) — Table showing which tier fits, with recommended tier highlighted

### Sizing Formula

```
cacheSizeGB       = Working Set x (1 + Headroom%)
Container Limit   = ( cacheSizeGB
                    + Connection Overhead (max_conns x ~1 MB)
                    + Aggregation Buffers
                    + Internal Structures
                    + TCMalloc Overhead (~12%) )
                  / (1 - FS Cache Headroom %)
```

## Demo Flow

Recommended 2-phase sequence (~10 min):

### Phase 1: Healthy Baseline (3 min)
1. App auto-connects on open. Show the live dashboard — "This is the cluster at rest"
2. Select **"Healthy — In-Cache Reads"** and start
3. Point to the threshold strips: "We're in the green zone on both"
4. Point to Disk Reads showing near-zero: "Everything served from RAM — no cache misses"

### Phase 2: Stressed (5 min)
1. Select **"Stressed — Write Storm"** and start
2. Watch dirty fill climb into the amber zone (5%+): "Worker threads are now actively writing out dirty pages"
3. Watch it approach/cross 20%: "Now app threads get pulled in — your queries pay an eviction tax"
4. Point to Queued Ops if non-zero: "Operations are queueing — the database can't keep up"
5. Point to Disk Reads spiking: "Heavy I/O to flush dirty pages and read data from disk"
6. Stop load, watch metrics recover

### Phase 3: Sizing Calculator (5 min)
1. Switch to Calculator tab, click "Use Observed Values"
2. Show the two key numbers: cacheSizeGB and container limit
3. Show memory breakdown and RAM Pool table
4. Copy the MCK YAML snippet

> **Atlas demo note:** Latency numbers include network round-trip (~200ms+). The cache-vs-disk difference is visible in Disk Reads and Dirty Fill, not in absolute latency. Frame this: "On your OpenShift clusters with local storage, the latency difference would be dramatic. Here, watch the Disk Reads and Dirty Fill gauges."

## Cleanup

**Always clean up after the demo.**

```bash
# Script
npm run cleanup

# Verify
npm run verify-cleanup

# Or from within the app: click "Clean Up Demo Data" button in the header
```

This drops the `ram_pool_demo` database. No other databases are touched.

## Troubleshooting

| Issue | Solution |
|-------|---------|
| Connection fails | Verify URI in `.env`, check network access, ensure user has `clusterMonitor` role |
| `serverStatus` errors | User needs `clusterMonitor` role. On Atlas, use `atlasAdmin` or custom role |
| Metrics not updating | Check browser console for SSE errors. Try disconnect/reconnect |
| Dirty fill won't climb | Increase write batch size (500-1000) and threads (32-64) in the UI |
| Slow seeding to Atlas | Expected — use fewer docs (`--large-count`), seed the night before |
| Low throughput | Normal for remote clusters. Each op includes network latency. Increase threads. |
| "No collections found" | Run `npm run seed` first |
| Build errors | Ensure Node.js 18+. Delete `node_modules` and reinstall |
| Port conflict | Change `PORT` in `.env` |

## OpenShift Deployment (Optional)

```bash
# Build and push
docker build -t mongodb-ram-observatory:latest .
docker tag mongodb-ram-observatory:latest <registry>/mongodb-ram-observatory:latest
docker push <registry>/mongodb-ram-observatory:latest

# Deploy
oc create secret generic mongodb-ram-observatory-secret --from-literal=uri='mongodb+srv://...'
oc apply -f scripts/openshift/deployment.yaml
oc apply -f scripts/openshift/service.yaml
oc expose service mongodb-ram-observatory
oc get route mongodb-ram-observatory -o jsonpath='{.spec.host}'
```

## Security Notes

- Connection strings are never logged or persisted beyond `.env` (gitignored) and in-memory during the session
- The demo user should be scoped to `ram_pool_demo` + `clusterMonitor` only
- All load generator operations target `ram_pool_demo` — customer data is never accessed
- The app makes no external network requests beyond the MongoDB cluster
- Auto-connect reads the URI server-side from `.env` — it is never sent to the browser
