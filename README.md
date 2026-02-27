# research

Research projects, mostly carried out by LLM tools.

<!--[[[cog
import os
import subprocess
from pathlib import Path

MODEL = "claude-sonnet-4.5"

def get_first_commit_date(folder):
    result = subprocess.run(
        ["git", "log", "--diff-filter=A", "--follow", "--format=%aI", "--reverse", "--", folder],
        capture_output=True, text=True
    )
    dates = result.stdout.strip().split('\n')
    return dates[0] if dates and dates[0] else None

def get_summary(folder):
    summary_file = Path(folder) / "_summary.md"
    if summary_file.exists():
        return summary_file.read_text().strip()

    readme_file = Path(folder) / "README.md"
    if not readme_file.exists():
        return f"Research project in `{folder}`"

    # Generate summary using LLM
    result = subprocess.run(
        ["llm", "-m", MODEL],
        input=f"Summarize this research project concisely. Write just 1 paragraph (3-5 sentences) followed by an optional short bullet list if there are key findings. Vary your opening - don't start with 'This report' or 'This research'. Include 1-2 links to key tools/projects mentioned.\n\n{readme_file.read_text()}",
        capture_output=True, text=True
    )
    summary = result.stdout.strip()
    if summary:
        summary_file.write_text(summary)
    return summary or f"Research project in `{folder}`"

def get_repo_url():
    result = subprocess.run(
        ["git", "remote", "get-url", "origin"],
        capture_output=True, text=True
    )
    url = result.stdout.strip()
    if url.startswith("git@github.com:"):
        url = url.replace("git@github.com:", "https://github.com/").replace(".git", "")
    elif url.endswith(".git"):
        url = url[:-4]
    return url

# Get all project directories (exclude hidden dirs and files)
projects = []
for item in Path(".").iterdir():
    if item.is_dir() and not item.name.startswith("."):
        date = get_first_commit_date(item.name)
        if date:
            projects.append((date, item.name))

# Sort by date, newest first
projects.sort(reverse=True)

repo_url = get_repo_url()

# Print heading with project count
print(f"## {len(projects)} research projects\n")

for date, folder in projects:
    date_str = date[:10] if date else "unknown"
    print(f"### [{folder}]({repo_url}/tree/main/{folder}) ({date_str})\n")
    print(get_summary(folder))
    print()
]]]-->
## 7 research projects

### [atlas-custom-role-test](https://github.com/tzehon/research/tree/main/atlas-custom-role-test) (2026-02-27)

MongoDB Atlas administrators can now validate fine-grained database permissions using this automated test harness that creates a **collection-scoped read-only role** and verifies access controls through repeatable, idempotent tests. The tool relies exclusively on the [Atlas CLI](https://www.mongodb.com/docs/atlas/cli/stable/) and [mongosh](https://www.mongodb.com/docs/mongodb-shell/) (no direct API calls), orchestrating four steps: seeding test data, creating a custom role with `FIND` privileges on a single collection, provisioning a restricted database user, and programmatically confirming that read operations succeed only on the permitted collection while writes and access to other collections are properly denied. Designed for CI/CD integration and repeatability, the harness supports running individual steps or the complete end-to-end workflow with automatic cleanup.

**Key capabilities:**
- Creates custom Atlas DB roles granting granular collection-level permissions
- Validates three security boundaries: allowed reads succeed, unauthorized reads fail, write attempts are blocked
- Fully idempotent—safe to run repeatedly without manual cleanup between executions
- Requires only Atlas CLI authentication and an admin connection string (no Python dependencies beyond stdlib)

### [shard-key-analyzer](https://github.com/tzehon/research/tree/main/shard-key-analyzer) (2026-02-11)

Selecting the right shard key is critical for scaling MongoDB, yet the native `analyzeShardKey` and `configureQueryAnalyzer` commands return raw JSON that's difficult to interpret. The [MongoDB Shard Key Analyzer](https://www.mongodb.com/docs/manual/reference/command/analyzeshardkey/) wraps these commands in an interactive web interface that lets you compare candidate shard keys side-by-side with visual scoring across cardinality, frequency, monotonicity, and query targeting metrics. Built with React and Express, the tool connects to Atlas M30+ clusters or replica sets (MongoDB 7.0+), samples real query patterns in the background, and generates data-driven recommendations with radar charts and detailed explanations—helping teams avoid hot spots, scatter-gather queries, and scaling ceilings before committing to a shard key that's difficult to change.

**Key capabilities:**
- **Query sampling**: Captures real read/write patterns via [`configureQueryAnalyzer`](https://www.mongodb.com/docs/manual/reference/command/configurequeryanalyzer/) at configurable rates (1–50 queries/second)
- **Multi-candidate analysis**: Scores multiple shard keys simultaneously on five weighted metrics (cardinality 25%, frequency 20%, monotonicity 15%, read/write targeting 20% each)
- **Built-in workload simulator**: Generates realistic traffic patterns for testing, with warnings against production use
- **Production-ready**: Read-only analysis operations with configurable sample sizes and low-overhead sampling modes

### [mongodb-ops-manager-kubernetes](https://github.com/tzehon/research/tree/main/mongodb-ops-manager-kubernetes) (2025-11-30)

MongoDB Ops Manager can be deployed on Kubernetes using the [MongoDB Controllers for Kubernetes (MCK)](https://www.mongodb.com/docs/kubernetes/current/) operator, and this learning-focused project provides automated scripts for setting up a complete environment including TLS encryption via [cert-manager](https://cert-manager.io/docs/), backup infrastructure with oplog/blockstore, LDAP integration, and external access configurations. The deployment creates an Ops Manager instance with a 3-node application database, automated backup capabilities for point-in-time recovery, and supports both ReplicaSet and sharded cluster topologies with optional MongoDB Search (preview) functionality for full-text and vector search. A single `_launch.bash` script orchestrates the entire deployment from cluster creation through Ops Manager setup and production database provisioning, while connection helper scripts automatically handle credential extraction and TLS certificate management for external access.

**Key capabilities:**
- Full automation: GKE cluster creation, MCK operator deployment, Ops Manager with AppDB, and production clusters
- Automated TLS certificate lifecycle using cert-manager with self-signed or custom CA support
- Split-horizon DNS for ReplicaSets and LoadBalancer exposure for sharded clusters with automatic certificate updates
- Optional OpenLDAP integration for enterprise authentication testing
- MongoDB Search (preview) support with automated testing script for full-text and vector search validation
- Comprehensive cleanup utilities for restarting failed deployments or tearing down environments

### [mongodb-failover-tester](https://github.com/tzehon/research/tree/main/mongodb-failover-tester) (2025-11-28)

MongoDB driver defaults already provide failover resilience without any configuration needed - this full-stack application proves it by comparing default settings against misconfigured overrides during real [MongoDB Atlas](https://www.mongodb.com/atlas) failovers. Using separate MongoClient instances with different configurations, the app triggers actual primary failovers via the Atlas Admin API and runs continuous read/write operations to demonstrate that the default 30-second `serverSelectionTimeoutMS` and automatic retry settings handle elections gracefully, while overriding these with short timeouts (2s) and disabled retries causes failures. Built with Node.js, React, TypeScript, and Socket.IO, it provides real-time visualization of cluster topology changes and side-by-side operation results.

**Key findings:**
- Default driver settings (`retryWrites: true`, `retryReads: true`, `serverSelectionTimeoutMS: 30000`) handle failovers with zero failures
- Overriding with `serverSelectionTimeoutMS: 2000` and `retryWrites/retryReads: false` causes operations to fail during the ~8-10 second election window
- The 30-second default timeout provides safety margin for network variability and cloud orchestration delays beyond the fast election itself
- Modern [MongoDB drivers](https://www.mongodb.com/docs/drivers/) (4.2+ for writes, 6.0+ for reads) are pre-configured for production resilience

### [ops-manager-alerts-creation](https://github.com/tzehon/research/tree/main/ops-manager-alerts-creation) (2025-11-28)

A Python automation tool streamlines the deployment of [MongoDB Ops Manager](https://www.mongodb.com/products/ops-manager) alert configurations across multiple projects by reading threshold definitions from an Excel spreadsheet and creating alerts via the Ops Manager API. The script uses HTTP Digest authentication to generate JSON configurations for various alert types including replica set health, host metrics, disk partition monitoring, and Ops Manager-specific backup/agent alerts. It supports dry-run mode for previewing changes, tracks created alert IDs for selective cleanup, and includes utilities for discovering correct metric names by inspecting manually-created alerts through the API.

**Key capabilities:**
- Creates alerts from Excel configurations with low/high priority thresholds
- Supports 30+ alert types covering replication lag, CPU usage, disk IOPS, connection counts, and agent health
- Includes safe deletion options (automation-created only vs. all alerts)
- Handles SSL certificates and provides metric name discovery tools for troubleshooting
- Differs from Atlas automation by using direct API authentication instead of CLI and supporting Ops Manager-specific alert types

### [atlas-alerts-creation](https://github.com/tzehon/research/tree/main/atlas-alerts-creation) (2025-11-27)

Organizations managing multiple MongoDB Atlas projects face a time-consuming challenge: manually implementing the 20+ recommended alert configurations requires cross-referencing documentation, mapping metrics to conditions, and repeating the process for each project. This automation tool solves that problem by allowing teams to define alert configurations once in an Excel spreadsheet and deploy them consistently across any number of Atlas projects in seconds using the [MongoDB Atlas CLI](https://www.mongodb.com/docs/atlas/cli/current/).

**Key Features:**
- Automated deployment of 20+ recommended Atlas alerts from Excel configuration
- Dry-run mode to validate JSON generation before deployment
- Selective deletion of automation-created alerts while preserving Atlas defaults
- Customizable notification emails and role-based alerting
- Duplicate detection to prevent redundant alert creation
- Support for metric-based, event-based, and threshold-based alert types

### [invoice_processor](https://github.com/tzehon/research/tree/main/invoice_processor) (2025-11-27)

A [Streamlit](https://streamlit.io/) application leverages [Claude's vision API](https://docs.anthropic.com/en/docs/build-with-claude/vision) to directly process PDF invoices and receipts without text extraction, using structured outputs to guarantee valid JSON responses. The system employs a sophisticated merchant classification pipeline that combines vector embeddings (via paraphrase-multilingual-mpnet-base-v2), MongoDB Atlas Vector Search, and LLM verification to automatically identify merchants across 50+ languages and name variations. Users can upload PDFs for automatic metadata extraction and merchant classification, then query their transaction data using natural language that gets converted to MongoDB aggregation pipelines.

**Key Technical Features:**
- Direct PDF vision processing preserves complex layouts and formatting
- Multilingual merchant matching with 0.85+ similarity threshold for automatic classification
- Vector search with 768-dimensional embeddings stored in MongoDB Atlas
- Natural language querying with real-time MongoDB pipeline generation
- Automatic synonym learning that improves merchant recognition over time

<!--[[[end]]]-->
