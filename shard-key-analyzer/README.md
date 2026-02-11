# MongoDB Shard Key Analyzer

A web app that helps you pick the right shard key before you shard a MongoDB collection. Connect it to your Atlas cluster or replica set, point it at a collection, and it scores candidate shard keys so you can compare them side-by-side and make a data-driven decision.

![MongoDB Version](https://img.shields.io/badge/MongoDB-7.0+-green)
![Atlas](https://img.shields.io/badge/Replica_Set_or_Sharded-blue)
![License](https://img.shields.io/badge/license-MIT-blue)

## Why This Exists

Choosing a shard key is one of the most consequential decisions you'll make when scaling a MongoDB cluster — and it's hard to undo ([Choose a Shard Key](https://www.mongodb.com/docs/manual/core/sharding-choose-a-shard-key/)). A poor choice can lead to:

- **Hot spots** — all writes funneling to a single shard
- **Scatter-gather queries** — reads hitting every shard instead of just one
- **Scaling ceilings** — low-cardinality keys that limit how far you can distribute data

MongoDB provides the [`analyzeShardKey`](https://www.mongodb.com/docs/manual/reference/command/analyzeshardkey/) and [`configureQueryAnalyzer`](https://www.mongodb.com/docs/manual/reference/command/configurequeryanalyzer/) commands to evaluate candidates, but they're database commands that return raw JSON. This tool wraps them in an interactive UI: you enter candidate keys, it runs the analysis, and it gives you scored results with charts and a recommendation.

## How It Works

Under the hood, the app orchestrates two MongoDB commands:

1. **[`configureQueryAnalyzer`](https://www.mongodb.com/docs/manual/reference/command/configurequeryanalyzer/)** — Turns on query sampling for a collection. While active, MongoDB records a sample of the reads and writes hitting that collection. You control the sampling rate (1–50 queries/second). Supported on both replica sets and sharded clusters.

2. **[`analyzeShardKey`](https://www.mongodb.com/docs/manual/reference/command/analyzeshardkey/)** — You give it a candidate shard key (e.g. `{ customerId: 1 }`), and it reads from **two data sources** to produce metrics:
   - **Key characteristics** (cardinality, frequency, monotonicity) — computed by reading documents directly from your collection. This tells you about the data itself: how many distinct values the key has, whether values are evenly distributed, and whether they increase monotonically.
   - **Read/write distribution** — computed from the sampled queries in `config.sampledQueries` (recorded by `configureQueryAnalyzer`). This tells you how well the candidate key would target reads and writes to individual shards based on your actual query patterns.

   Both data sources matter: key characteristics tell you about the data, read/write distribution tells you about the queries. The analysis is read-only and can target both sharded and unsharded collections. You can run it repeatedly with different candidates.

### Workflow

```
┌─────────────────────────────────────────────────────┐
│  1. Pick a collection (Explorer)                    │
│                                                     │
│  2. Start sampling ─── runs in the background ───┐  │
│     (configureQueryAnalyzer)                     │  │
│                                                  │  │
│  3. Generate traffic ── while sampling captures ─┤  │
│     (Workload simulator or your own app)         │  │
│                                                  │  │
│  4. Analyze candidates ── reads collection docs ──┘  │
│     (analyzeShardKey)      + sampled queries          │
│                                                     │
│  5. Compare results (Report)                        │
└─────────────────────────────────────────────────────┘
```

Sampling stays active in the background through steps 3 and 4. You don't need to stop it before analyzing — `analyzeShardKey` reads whatever queries have been collected so far. More sampled queries means more accurate read/write distribution metrics.

### What a sampled query looks like

When `configureQueryAnalyzer` is active, MongoDB stores sampled queries in `config.sampledQueries`. Each document looks like:

```json
{
  "cmdName": "find",
  "ns": "sample_data.orders",
  "cmd": {
    "filter": { "customerId": "c45fc6a3-89e1-46a1-861a-64ff578e2d31" }
  },
  "expireAt": "2026-03-11T04:14:21.618Z"
}
```

These documents are what `analyzeShardKey` uses (with `readWriteDistribution: true`) to determine how well a candidate shard key targets reads and writes. For example, if most queries filter by `customerId`, then `{ customerId: 1 }` would score well on read targeting.

Sampled queries expire automatically via a TTL index on the `expireAt` field. The default expiration is ~27 days, controlled by the `queryAnalysisSampleExpirationSecs` server parameter. You can also delete them manually from `config.sampledQueries` (requires the `clusterManager` role).

## Features

- **Connect to MongoDB Atlas** — enter your connection string and go
- **Browse collections** — explore databases, schemas, indexes, and field-level stats
- **Query sampling** — configure and monitor real-time query sampling via `configureQueryAnalyzer`
- **Workload simulation** — generate realistic query patterns if you don't have production traffic yet
- **Shard key analysis** — analyze multiple candidates and score them on cardinality, frequency, monotonicity, and query targeting
- **Interactive reports** — radar charts, bar comparisons, and a recommended shard key with explanations
- **Educational guide** — built-in reference on shard key best practices

## Prerequisites

Before using this tool, ensure you have:

| Requirement | Details |
|------------|---------|
| **MongoDB Deployment** | Atlas M30+ cluster, or any replica set (not standalone). Both sharded clusters and replica sets are supported — you can evaluate shard keys *before* sharding. |
| **MongoDB Version** | 7.0 or higher (required for `analyzeShardKey`) |
| **Node.js** | Version 18+ installed locally |
| **Network Access** | Your IP added to Atlas whitelist |
| **Database User** | `clusterManager` role is the simplest option — it covers all commands. Alternatively: `dbAdmin` on the target database (for `configureQueryAnalyzer`) plus `enableSharding` privilege on the collection (for `analyzeShardKey`). See [access control details](#required-permissions) below. |

### Required Permissions

| Command | Minimum Role | Purpose |
|---------|-------------|---------|
| `configureQueryAnalyzer` | `dbAdmin` against the database that contains the collection being analyzed **or** `clusterManager` against the cluster | Start/stop query sampling |
| `analyzeShardKey` | `enableSharding` against the collection being analyzed **or** `clusterManager` against the cluster | Analyze shard key candidates |
| Delete from `config.sampledQueries` | `clusterManager` against the cluster | Clear sampled queries |

The `clusterManager` role covers all three. On Atlas, the **Atlas Admin** built-in role includes `clusterManager`.

## Installation & Setup

### 1. Clone and install

```bash
git clone <your-repo-url>
cd shard-key-analyzer
npm install
```

### 2. Start the development servers

```bash
npm run dev
```

This starts both the backend (Express on port 3001) and frontend (Vite on port 5173) concurrently. Open [http://localhost:5173](http://localhost:5173) in your browser.

To build for production:

```bash
npm run build          # Build the client
npm start              # Start the production server
```

### 3. Connect to your Atlas cluster

Once the app is running, enter your MongoDB Atlas connection string on the connection page. The format is:

```
mongodb+srv://<username>:<password>@<cluster>.xxxxx.mongodb.net/
```

You can find this string in the [Atlas UI](https://cloud.mongodb.com/) under **Database > Connect > Drivers**.

The app will verify:
- Connection is successful
- MongoDB version is 7.0+
- Deployment is a replica set or sharded cluster (not standalone)

## Usage Guide

### 1. Browse Collections (Explorer)

- Navigate the database tree on the left
- Select a collection to view schema, stats, and a quick assessment of potential shard key candidates
- Optionally load sample data for testing

### 2. Start Query Sampling

Start `configureQueryAnalyzer` to record queries against your collection:
1. Go to the **Sampling** page
2. Set your desired sampling rate (1–50 samples/second)
3. Click **Start Sampling** — it runs in the background

Leave sampling active while you generate traffic in the next step.

### 3. Generate Traffic

Sampling needs queries to capture. Either:
- **Use your own application** (recommended for production collections) — run your real app's workload against the collection. This gives the most accurate read/write distribution analysis.
- **Use the Workload Simulator** (for test/sample data only) — go to the **Workload** page, pick a profile, set a duration, and run it. **Do not use the simulator against production collections** — it runs real reads and writes.

You can freely navigate between Sampling and Workload while both are running — they're server-side processes.

### 4. Analyze Shard Key Candidates

Once you have sampled queries (the more the better):
1. Go to the **Analysis** page
2. Pick candidate shard keys from the suggestions, or add custom ones (e.g. `{ customerId: 1 }`)
3. Click **Analyze** — this runs `analyzeShardKey` for each candidate

The analysis is read-only. You can re-run it as many times as you want with different candidates. Sampling doesn't need to be stopped first.

### 5. Review the Report

The report shows:
- **Recommended shard key** with overall score
- **Comparison charts** (radar, bar)
- **Detailed scores** for cardinality, frequency, monotonicity, and read/write targeting
- **Warnings** about potential issues

## Production Impact

If you're using this tool against a production cluster, be aware of the overhead:

| Operation | Impact | Recommendation |
|-----------|--------|----------------|
| `configureQueryAnalyzer` | Adds CPU/IO overhead to intercept and record queries | Use a low sampling rate (1–5/sec) on production |
| `analyzeShardKey` | Read-only, but reads documents proportional to `sampleSize` | Default 10,000 is fine; avoid very large sample sizes during peak hours |
| Workload Simulator | **Runs real reads and writes** against the collection | **Never use on production** — use your real app traffic instead |
| Sample Data Loading | Inserts documents via `insertMany` | Only use with test databases |

The safest production workflow is: connect → start sampling at a low rate → let your real application generate traffic → analyze when ready.

## Understanding the Metrics

These metrics correspond to the key characteristics described in [Choose a Shard Key](https://www.mongodb.com/docs/manual/core/sharding-choose-a-shard-key/) and the output of [`analyzeShardKey`](https://www.mongodb.com/docs/manual/reference/command/analyzeshardkey/).

### Cardinality (25% weight)

The number of distinct shard key values. Higher cardinality allows more chunks and better distribution.

| Score | Meaning |
|-------|---------|
| 80-100 | Excellent - High cardinality, many distinct values |
| 60-79 | Good - Sufficient cardinality for most use cases |
| 40-59 | Fair - Consider compound keys for better distribution |
| 0-39 | Poor - Too few distinct values, will limit scaling |

**Good examples:** UUID fields, user IDs, email addresses
**Bad examples:** Status fields, regions, boolean flags

### Frequency (20% weight)

How evenly distributed the shard key values are. Uneven distribution creates hot spots.

| Score | Meaning |
|-------|---------|
| 80-100 | Even distribution, no hot spots |
| 60-79 | Slight variation, acceptable |
| 40-59 | Some values significantly more common |
| 0-39 | Hot spots detected, one value dominates |

### Monotonicity (15% weight)

Whether values increase/decrease over time. Monotonic keys cause write hot spots.

| Type | Score | Meaning |
|------|-------|---------|
| Not monotonic | 100 | Values are random - writes distributed evenly |
| Unknown | 50 | Could not determine pattern |
| Monotonic | 0 | Sequential values - all inserts go to one shard |

**Monotonic examples:** Timestamps, auto-incrementing IDs, ObjectIds
**Non-monotonic examples:** UUIDs, hashed values, random strings

### Read Targeting (20% weight)

What percentage of read queries can target a single shard.

| Score | Meaning |
|-------|---------|
| 80-100 | Most reads target single shard |
| 60-79 | Good targeting with some scatter-gather |
| 40-59 | Many scatter-gather queries |
| 0-39 | Poor - most queries hit all shards |

### Write Targeting (20% weight)

What percentage of write operations target a single shard.

| Score | Meaning |
|-------|---------|
| 80-100 | Most writes target single shard |
| 60-79 | Good targeting |
| 40-59 | Many scatter-gather writes |
| 0-39 | Poor write targeting |

## API Reference

### Connection

```
GET  /api/connection/status              # Get connection status
POST /api/connection/connect             # Connect to Atlas
POST /api/connection/disconnect          # Disconnect
GET  /api/connection/shards              # List shards
POST /api/connection/verify-permissions  # Verify user permissions
```

### Explorer

```
GET  /api/explorer/databases                          # List databases
GET  /api/explorer/collections/:database              # List collections
GET  /api/explorer/schema/:database/:collection       # Get schema
GET  /api/explorer/stats/:database/:collection        # Get statistics
GET  /api/explorer/indexes/:database/:collection      # Get indexes
GET  /api/explorer/field-analysis/:database/:collection  # Analyze fields
```

### Sampling

```
POST   /api/sampling/start             # Start query sampling
POST   /api/sampling/stop              # Stop sampling
POST   /api/sampling/update-rate       # Update sampling rate
GET    /api/sampling/status            # Get sampling status
GET    /api/sampling/queries           # List sampled queries
GET    /api/sampling/stats             # Get sampling statistics
DELETE /api/sampling/queries           # Clear sampled queries
```

### Workload

```
GET  /api/workload/profiles          # Get available profiles
POST /api/workload/start             # Start workload simulation
POST /api/workload/stop              # Stop simulation
GET  /api/workload/status            # Get workload status
```

### Analysis

```
POST   /api/analysis/analyze           # Analyze multiple candidates
POST   /api/analysis/analyze-single    # Analyze single candidate
GET    /api/analysis/results/:id       # Get analysis results
POST   /api/analysis/check-index       # Check supporting index
DELETE /api/analysis/results           # Clear all analysis results
```

### Sample Data

```
GET  /api/sample-data/datasets       # Get available datasets
POST /api/sample-data/load           # Load sample data
POST /api/sample-data/stop           # Stop data loading
GET  /api/sample-data/status         # Get loading status
```

## Common Scenarios

### E-commerce Application

**Best candidates:**
- `{ customerId: 1 }` - Most queries filter by customer
- `{ customerId: 1, createdAt: 1 }` - Supports date range queries within customer

**Avoid:**
- `{ region: 1 }` - Only 4 values (low cardinality)
- `{ createdAt: 1 }` - Monotonically increasing
- `{ status: 1 }` - Only 5 values, "delivered" dominates

### Multi-tenant SaaS

**Best candidates:**
- `{ tenantId: 1 }` - All queries naturally filter by tenant
- `{ tenantId: 1, entityId: 1 }` - For large tenants with many entities

### IoT / Time-Series

**Best candidates:**
- `{ deviceId: 1, timestamp: 1 }` - Distributes by device, enables time range queries

**Avoid:**
- `{ timestamp: 1 }` - All inserts go to one shard

### Social Media

**Best candidates:**
- `{ userId: 1 }` - User timeline queries are most common
- `{ userId: 1, createdAt: 1 }` - For paginated feed queries

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "No sampled queries" | Ensure sampling is active AND traffic is flowing to the collection |
| "Supporting index required" | Create an index that matches or prefixes your shard key |
| "Connection failed" | Check Atlas network access whitelist for your IP |
| "Unauthorized" | Verify user has `clusterManager` role (covers all commands), or see [Required Permissions](#required-permissions) for minimum roles |
| "Unknown monotonicity" | Collection may be clustered or lacks suitable index for analysis |
| "Version not supported" | Requires MongoDB 7.0+ for analyzeShardKey |
| "Not a sharded cluster" | Requires a replica set or sharded cluster (Atlas M30+ for sharding). Standalone deployments are not supported. |

## Tech Stack

### Backend
- Node.js with Express
- MongoDB Node.js Driver 6.x
- Socket.io for real-time updates

### Frontend
- React 18 with Vite
- Tailwind CSS
- shadcn/ui components
- Recharts for visualizations
- React Query for state management
- React Router for navigation

## Project Structure

```
shard-key-analyzer/
├── server/
│   ├── src/
│   │   ├── index.js              # Express server entry
│   │   ├── routes/               # API routes
│   │   ├── services/             # Business logic
│   │   ├── socket/               # Socket.io handlers
│   │   └── utils/                # Utilities
│   └── examples/                 # Sample datasets & workloads
├── client/
│   ├── src/
│   │   ├── components/           # React components
│   │   ├── pages/                # Page components
│   │   ├── hooks/                # Custom hooks
│   │   ├── lib/                  # Utilities
│   │   └── styles/               # Global styles
│   ├── index.html
│   ├── vite.config.js            # Vite build & dev proxy config
│   ├── tailwind.config.js        # Tailwind CSS config
│   └── postcss.config.js         # PostCSS config
└── README.md
```

## Further Reading

- [Choose a Shard Key](https://www.mongodb.com/docs/manual/core/sharding-choose-a-shard-key/) — traits of a good shard key (cardinality, frequency, monotonicity)
- [Shard Keys](https://www.mongodb.com/docs/manual/core/sharding-shard-key/) — how shard keys work, including hashed vs ranged sharding
- [`analyzeShardKey`](https://www.mongodb.com/docs/manual/reference/command/analyzeshardkey/) — the database command this tool wraps
- [`configureQueryAnalyzer`](https://www.mongodb.com/docs/manual/reference/command/configurequeryanalyzer/) — configure query sampling for read/write distribution metrics
- [Sharding](https://www.mongodb.com/docs/manual/sharding/) — MongoDB sharding overview

## Contributing

Contributions are welcome!

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Acknowledgments

- MongoDB Documentation for comprehensive sharding guides
- The MongoDB Node.js Driver team
- shadcn/ui for beautiful components
