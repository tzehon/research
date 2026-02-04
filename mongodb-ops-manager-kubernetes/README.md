# MongoDB Ops Manager on Kubernetes

> **Note:** This project is designed for learning, demonstration, and development purposes. For production deployments, consult the [official MongoDB documentation](https://www.mongodb.com/docs/kubernetes/current/) for recommended architectures, security practices, and operational procedures.

Deploy MongoDB Ops Manager and managed MongoDB clusters on Kubernetes using MongoDB Controllers for Kubernetes (MCK). This project provides a quick-start setup including TLS encryption, backup infrastructure, LDAP integration, and external access options.

## Key Features

- **Ops Manager 8.0.x** with Application Database (3-node replica set)
- **Automated Backup** with oplog + blockstore infrastructure for point-in-time recovery
- **TLS/SSL Encryption** via cert-manager with self-signed or custom CA
- **LDAP Integration** for both Ops Manager and database user authentication
- **External Access** via split-horizon DNS or LoadBalancer/NodePort services
- **ReplicaSet & Sharded Clusters** for demonstration and testing
- **MongoDB Search (Preview)** - Full-text and vector search via `mongot` pods

## Architecture

```
                         Kubernetes Cluster
+------------------------------------------------------------------+
|                                                                  |
|  +------------------------------------------------------------+  |
|  |  MongoDB Controllers (MCK) - Helm deployed                 |  |
|  +------------------------------------------------------------+  |
|                              |                                   |
|         +--------------------+--------------------+              |
|         v                    v                    v              |
|  +-------------+      +-------------+      +-------------+       |
|  | Ops Manager |      | Backup      |      | Production  |       |
|  |-------------|      |-------------|      |-------------|       |
|  | OM Pod:8443 |      | Oplog (3)   |      | ReplicaSet  |       |
|  | AppDB (3)   |      | Blockstore  |      | Sharded     |       |
|  +-------------+      +-------------+      +-------------+       |
|                                                                  |
|  +------------------------------------------------------------+  |
|  |  cert-manager - TLS lifecycle management                   |  |
|  +------------------------------------------------------------+  |
|                                                                  |
|  +-------------+  (Optional)                                     |
|  | OpenLDAP    |  Enterprise auth for OM + DB users              |
|  +-------------+                                                 |
|                                                                  |
+------------------------------------------------------------------+
```

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Kubernetes | 1.16+ | Tested on GKE |
| kubectl | Latest | Kubernetes CLI |
| Helm | 3.x | For MCK operator installation |
| gcloud | Latest | For GKE cluster creation |
| cfssl | Latest | Required for root CA generation (TLS enabled by default) |

### Resource Requirements

| CPU | Memory | Disk |
|-----|--------|------|
| 48-64 cores | 192-256 GB | 2-5 TB |

## Quick Start

```bash
# 1. Clone and configure
cd mongodb-ops-manager-kubernetes/scripts
cp sample_init.conf init.conf
vi init.conf  # Set your credentials and preferences

# 2. Create K8s cluster and deploy everything (with MongoDB Search)
./0_make_k8s.bash && ./_launch.bash --search

# 3. Get Ops Manager URL
grep opsMgrExtUrl init.conf

# 4. Get API Key (for creating alerts, API access, etc.)
bin/get_key.bash
# Or from K8s secret:
kubectl get secret mongodb-opsmanager-admin-key -n mongodb \
  -o jsonpath='{.data.publicKey}' | base64 -d && echo
kubectl get secret mongodb-opsmanager-admin-key -n mongodb \
  -o jsonpath='{.data.privateKey}' | base64 -d && echo
```

## Installation

### Step 1: Configure Environment

Copy and customize the configuration file:

```bash
cp scripts/sample_init.conf scripts/init.conf
```

Key settings to configure:

| Setting | Description | Default |
|---------|-------------|---------|
| `user` | Ops Manager admin email | - |
| `password` | Ops Manager admin password | - |
| `namespace` | K8s namespace for deployment | `mongodb` |
| `serviceType` | `LoadBalancer` or `NodePort` | `LoadBalancer` |
| `tls` | Enable TLS encryption | `true` |
| `omBackup` | Enable backup infrastructure | `true` |
| `clusterDomain` | External domain name | `mdb.com` |
| `owner` | GKE cluster owner tag | - |

### Step 2: Create Kubernetes Cluster

For GKE clusters:

```bash
cd scripts
./0_make_k8s.bash            # Uses owner from init.conf
./0_make_k8s.bash -o jane    # Override owner via flag
```

The `-o` flag overrides the `owner` setting from `init.conf`. One of the two must be set. To delete a cluster, use `-d`:

```bash
./0_make_k8s.bash -d
```

This creates a GKE cluster with appropriate node pools. For other providers (EKS, OpenShift), ensure your cluster meets the resource requirements above.

### Step 3: Deploy the Stack

**Option A: Full automated deployment**
```bash
./_launch.bash
```

**Option B: Step-by-step deployment**
```bash
# Deploy MCK operator + cert-manager
./deploy_Operator.bash

# Deploy Ops Manager + AppDB
./deploy_OM.bash

# Deploy production clusters
./deploy_Cluster.bash -n myreplicaset -v 8.0.4-ent
```

### Step 4: Access Ops Manager

```bash
# Get external URL
kubectl get svc opsmanager-svc-ext -n mongodb

# Or from init.conf (after deployment)
grep opsMgrExtUrl init.conf
```

Access via browser: `https://<EXTERNAL-IP>:8443`
- Login with credentials from `init.conf`
- Accept the self-signed certificate warning

## Deployment Flow

This section documents the full execution sequence when running `./0_make_k8s.bash && ./_launch.bash --search`.

### Phase 1: `0_make_k8s.bash` — Create GKE Cluster

| Order | File | Purpose |
|-------|------|---------|
| 1 | `scripts/init.conf` | Sourced for GKE project, region, zone variables |
| 2 | `gcloud` CLI | Creates a GKE cluster (default name `mdb-central`) and fetches kubectl credentials |

### Phase 2: `_launch.bash --search` — Deploy the Full Stack

`_launch.bash` sources `init.conf`, parses `--search` to set `searchFlag="--search"`, then orchestrates 8 timed steps:

#### Step 1: Operator — `deploy_Operator.bash`

| Order | File | Purpose |
|-------|------|---------|
| 1 | `scripts/init.conf` | Namespace, MCK version, TLS settings |
| 1a | `kubectl` | Creates namespace, sets context, removes old MEKO operator if present |
| 2 | Helm chart `mongodb/mongodb-kubernetes` | Installs the MCK operator, waits for CRDs and operator deployment to be ready |
| 3 | `certs/make_cert_issuer.bash` | (if TLS) Sets up cert-manager and a CA Issuer |
| 3a | `certs/generate_ca.bash` | Generates the CA key pair |
| 3b | cert-manager manifest (remote) | Installs cert-manager CRDs and controllers |

#### Step 2: Ops Manager — `deploy_OM.bash`

| Order | File | Purpose |
|-------|------|---------|
| 1 | `scripts/init.conf` | OM version, credentials, email/LDAP config |
| 1a | `kubectl create secret` | Creates `admin-user-credentials` secret from `init.conf` (username, password, name) |
| 2 | `certs/make_OM_certs.bash` | (if TLS) Generates certs for OM, AppDB, queryable backup |
| 2a | `certs/gen_cert.bash` + `certs/cert_template.yaml` | Produces Certificate CRDs from template |
| 3 | `templates/mdbom_template.yaml` | Template with placeholders (`VERSION`, `NAME`, etc.) replaced by values from `init.conf` to produce the final `OpsManager` manifest |
| 4 | `kubectl apply` | Applies the manifest, waits for OM to reach `Running` |
| 5 | `bin/update_initconf_hostnames.bash` | Gets external IP/hostname, updates `init.conf` and `/etc/hosts` |
| 5a | `bin/get_hns.bash` | Helper to extract hostnames from K8s services |

#### Step 2b: Backup Infrastructure (if `omBackup=true`)

| Order | File | Purpose |
|-------|------|---------|
| 1 | `bin/deploy_org.bash` | Creates an Ops Manager org for backup databases |
| 1a | `bin/get_key.bash` | Reads API keys from K8s secrets |
| 1b | `bin/create_org.bash` → `bin/get_org.bash` | REST API calls to create the org |
| 1c | `bin/add_user_to_org.bash` | Adds admin user as `ORG_OWNER` |
| 2 | `scripts/deploy_Cluster.bash` (oplog options) | Deploys the oplog store replica set |
| 3 | `scripts/deploy_Cluster.bash` (blockstore options) | Deploys the blockstore replica set |

#### Step 3: Organization — `bin/deploy_org.bash`

Creates the main deployment org (same scripts as Step 2b item 1).

#### Step 4: ReplicaSet — `deploy_Cluster.bash --search`

This is the key step affected by the `--search` flag. Rows in **bold** are search-specific.

| Order | File | Purpose |
|-------|------|---------|
| 1 | `scripts/init.conf` | Cluster name, version, credentials, LDAP config |
| 2 | `bin/get_org.bash` | Looks up the org ID via Ops Manager API |
| 3 | `certs/make_cluster_certs.bash` | (if TLS) Certs for each RS member |
| 3a | `certs/make_sharded_certs.bash` (agent mode) | Agent cert generation |
| 3b | `certs/gen_cert.bash` + `certs/cert_template.yaml` | Certificate CRDs |
| 3c | `kubectl create configmap` | Project ConfigMap with `baseUrl`, `orgId`, `projectName` (and TLS CA settings if TLS) |
| 3d | `kubectl create secret` | `<cluster>-admin` password secret for the database admin user |
| 4 | `templates/mdbuser_template_admin.yaml` | Placeholders replaced to produce admin `MongoDBUser` manifest |
| 5 | `templates/mdbuser_template_ldap.yaml` | (if LDAP) Placeholders replaced to produce LDAP `MongoDBUser` manifest |
| 6 | `templates/mdb_template_rs.yaml` | Placeholders replaced to produce the `MongoDB` ReplicaSet manifest |
| 7 | `bin/expose_service.bash` → `bin/get_hns.bash` | Configures split-horizon DNS for external access |
| 8 | `kubectl` polling | Waits for `MongoDB/<name>` to reach `Running` |
| **9** | **`templates/mdbuser_template_search.yaml`** | **`--search` only:** Creates the `search-sync-source` MongoDBUser with `searchCoordinator` role |
| **10** | **cert-manager Certificate** | **`--search` only:** TLS cert for `<name>-search-svc` |
| **11** | **`templates/mdbsearch_template.yaml`** | **`--search` only:** Placeholders replaced to produce the `MongoDBSearch` manifest (mongot pods) |
| **12** | **`kubectl` polling** | **`--search` only:** Waits for `MongoDBSearch/<name>` to reach `Running` |
| 13 | `bin/get_connection_string.bash` → `bin/get_hns.bash` | Prints the final connection string |

#### Step 5: Sharded Cluster — `deploy_Cluster.bash` (no `--search`)

Uses `templates/mdb_template_sh.yaml`. Key differences from the ReplicaSet flow in Step 4:

- **Cert generation** — calls `certs/make_sharded_certs.bash` once per component (agent, mongos, config, shard-0, shard-1, ...) instead of `make_cluster_certs.bash`
- **No `expose_service.bash`** — mongos are exposed via LoadBalancer services defined in the manifest, not split-horizon DNS
- **Post-deploy mongos cert regeneration** — waits for mongos LoadBalancers to get external IPs, then regenerates mongos TLS certs with the external DNS names
- **No `--search`** — search is not passed to the sharded cluster (ReplicaSet-only in this setup)

#### Step 6: Hostname Update — `bin/update_initconf_hostnames.bash`

Final pass to update `init.conf` and `/etc/hosts` with all external hostnames for Ops Manager, the replica set, and sharded cluster.

### Summary of `--search`-specific additions

The `--search` flag only affects `deploy_Cluster.bash` for the ReplicaSet. It adds three extra resources after the MongoDB cluster is running:

1. **`mdbuser_template_search.yaml`** — A `MongoDBUser` with role `searchCoordinator` and username `search-sync-source`
2. **A cert-manager `Certificate`** — TLS cert for the search service endpoint
3. **`mdbsearch_template.yaml`** — A `MongoDBSearch` CR that deploys standalone `mongot` pods with their own CPU/memory/storage requirements

Everything else in the pipeline is identical to a non-search run.

## Directory Structure

```
mongodb-ops-manager-kubernetes/
├── scripts/                    # Core deployment scripts
│   ├── sample_init.conf        # Configuration template
│   ├── 0_make_k8s.bash         # GKE cluster creation
│   ├── deploy_Operator.bash    # MCK + cert-manager deployment
│   ├── deploy_OM.bash          # Ops Manager deployment
│   ├── deploy_Cluster.bash     # MongoDB cluster deployment
│   ├── _launch.bash            # Full deployment orchestration
│   ├── _cleanup.bash           # Cleanup utilities
│   └── crds.yaml               # Custom Resource Definitions
├── templates/                  # YAML templates
│   ├── mdbom_template.yaml     # Ops Manager resource
│   ├── mdb_template_rs.yaml    # ReplicaSet cluster
│   ├── mdb_template_sh.yaml    # Sharded cluster
│   ├── mdbuser_template_*.yaml # Database users
│   ├── openldap.yaml           # LDAP server
│   └── svc_expose_*.yaml       # Service exposure
├── certs/                      # Certificate management
│   ├── cert-manager.yaml       # cert-manager deployment
│   ├── generate_ca.bash        # CA generation
│   ├── make_*_certs.bash       # Certificate scripts
│   └── cert_template.yaml      # Certificate template
├── bin/                        # Utility scripts
│   ├── deploy_org.bash         # Organization setup
│   ├── deploy_ldap.bash        # LDAP deployment
│   ├── get_*.bash              # Query helpers
│   ├── create_*.bash           # Resource creation
│   └── connect_*.bash          # Connection helpers
├── helm/                       # Helm charts
│   └── enterprise-database/    # MongoDB Enterprise chart
└── misc/                       # Diagnostic utilities
```

## Configuration Options

### TLS Configuration

TLS is enabled by default using cert-manager:

```bash
# In init.conf
tls="true"
tlsMode="requireTLS"  # Options: requireTLS, preferTLS, allowTLS
```

To use a custom CA:
1. Place your CA files in `certs/`
2. Run `certs/make_cert_issuer.bash`

### External Access

**Split-Horizon (ReplicaSet)**
```bash
# Configures internal + external DNS names
./deploy_Cluster.bash -n myreplicaset -e horizon
```

**LoadBalancer (Sharded)**
```bash
# Exposes mongos via LoadBalancer with automatic TLS cert update
./deploy_Cluster.bash -n mysharded -s 2 -r 2
```

The deployment script automatically:
- Creates LoadBalancer services for each mongos
- Waits for external IPs to be assigned
- Regenerates mongos TLS certificates with external DNS names
- Enables external connections without manual certificate steps

### LDAP Integration

```bash
# Deploy OpenLDAP server
bin/deploy_ldap.bash

# Pre-configured users:
# - dbAdmin, User01, User02 (password: Mongodb1)
# - Groups: dbadmins, dbusers, readers, managers
```

### MongoDB Search (Preview)

> **Note:** MongoDB Search is currently a Preview feature. The feature and documentation may change during the Preview period.

Deploy MongoDB Search nodes (`mongot`) to enable full-text search and vector search capabilities on ReplicaSets.

**Requirements:**
- MongoDB 8.2+ Enterprise Edition
- Ops Manager 8.0.14+ (required for `searchCoordinator` role support)
- ReplicaSet only (sharded clusters not supported)
- MCK Operator 1.6+

**Deploy with Search:**
```bash
# Full stack deployment with search (fastest way to get started)
./0_make_k8s.bash && ./_launch.bash --search

# Or deploy individual cluster with search
./deploy_Cluster.bash -n myreplicaset -v 8.2.0-ent --search
```

**Verify Search is Working:**
```bash
# Run the automated test script
bin/test_search.bash -n myproject1-myreplicaset

# Keep test data for manual inspection
bin/test_search.bash -n myproject1-myreplicaset -k
```

The test script:
1. Inserts test documents
2. Creates a search index
3. Waits for index to become ready (handles eventual consistency)
4. Runs a `$search` query
5. Verifies results
6. Cleans up test data

**Example output:**
```
Testing MongoDB Search on myproject1-myreplicaset...

[1/5] Connecting to cluster...
      $ mongosh "mongodb://..."
      OK - Connected

[2/5] Inserting test documents...
      $ db.getSiblingDB('search_test').movies.insertMany([...])
      OK - Inserted 3 test documents

[3/5] Creating search index...
      $ db.getSiblingDB('search_test').movies.createSearchIndex('test_search_index', ...)
      OK - Search index created

[4/5] Waiting for index to be ready...
      $ db.getSiblingDB('search_test').movies.getSearchIndexes()
      status: 'BUILDING' (10s elapsed, waiting...)
      status: 'READY' (25s elapsed)

[5/5] Running $search query...
      $ db.movies.aggregate([{ $search: { text: { query: 'matrix', path: ... } } }])
      OK - Found 'The Matrix' document

==============================================
MongoDB Search is working correctly!
==============================================
```

**Monitoring Search Nodes:**
```bash
# Check MongoDBSearch resource status
kubectl -n mongodb get mdbs

# Check search pod status
kubectl -n mongodb get pods | grep search

# View search pod logs
kubectl -n mongodb logs <cluster-name>-search-0

# Prometheus metrics (enabled by default on port 9946)
kubectl -n mongodb port-forward <cluster-name>-search-0 9946:9946
curl http://localhost:9946/metrics
```

**Resources created:**
| Resource | Purpose |
|----------|---------|
| `MongoDBSearch` CR | Manages mongot StatefulSet |
| `<cluster>-search-0` pod | mongot process for indexing and queries |
| `<cluster>-search-sync-source` user | User with `searchCoordinator` role |
| `<cluster>-search-tls` secret | TLS certificate for mongot |

## Backup Infrastructure

Automatically deployed with `_launch.bash`:

| Component | Purpose | Size |
|-----------|---------|------|
| **Oplog Store** | Continuous/point-in-time recovery | 3-node RS |
| **Blockstore** | Snapshot storage | 3-node RS |
| **Backup Daemon** | Runs in OM pod | 1 instance |

Default schedule:
- Snapshots: Every 24 hours
- Retention: 2 days (snapshots), 2 weeks (weekly), 1 month (monthly)
- Point-in-time: 1 day window

## Unattended Deployment

During deployment, `_launch.bash` modifies `/etc/hosts` to add hostname entries for local access to Ops Manager and MongoDB clusters. This requires `sudo` and will prompt for your password.

### Why sudo is needed

The deployment adds entries like:
```
34.168.33.127    opsmanager-svc.mongodb.svc.mdb.com opsmanager-svc om.mongodb.mdb.com
```

This allows you to access services using friendly hostnames instead of raw IPs.

### Running fully unattended

To avoid password prompts during automated deployments:

1. **Configure sudoers** (recommended):
   ```bash
   sudo visudo
   # Add this line (replace YOUR_USERNAME with your actual username):
   YOUR_USERNAME ALL=(ALL) NOPASSWD: /usr/bin/sed, /usr/bin/tee
   ```

2. **Verify it works**:
   ```bash
   sudo tee -a /dev/null <<< "test"  # Should not prompt for password
   ```

3. **Chain cluster creation and deployment**:
   ```bash
   ./0_make_k8s.bash && ./_launch.bash --search
   ```

> **Security note:** This grants passwordless sudo only for `sed` and `tee` commands. If you're the only user on the machine, this is low risk. For shared systems, you can restrict further to specific files:
> ```
> YOUR_USERNAME ALL=(ALL) NOPASSWD: /usr/bin/tee -a /etc/hosts, /usr/bin/sed * /etc/hosts
> ```

## Common Operations

### Retrieve API Keys

```bash
# From config file (after deployment)
cat scripts/deploy_*.conf | grep -E "publicKey|privateKey"

# From K8s secret
kubectl get secret mongodb-opsmanager-admin-key -n mongodb \
  -o jsonpath='{.data.publicKey}' | base64 -d

# Using helper script
bin/get_key.bash
```

### Connect to Clusters

```bash
# List available clusters
kubectl get mongodb -n mongodb

# Connect to ReplicaSet (external - from outside K8s)
bin/connect_external.bash -n myproject1-myreplicaset

# Connect to Sharded Cluster (connects to mongos)
bin/connect_external.bash -n myproject2-mysharded

# Get connection string only (without opening shell)
bin/get_connection_string.bash -n myproject1-myreplicaset

# Connect with LDAP authentication
bin/connect_external.bash -n myproject1-myreplicaset -l

# Connect from within K8s (pod-to-pod)
bin/connect_from_pod.bash -n myproject1-myreplicaset

# Get internal connection string
bin/get_connection_string.bash -n myproject1-myreplicaset -i
```

The connection scripts automatically:
- Extract credentials from Kubernetes secrets
- Download TLS certificates (CA + client cert) to `certs/`
- Build the full connection string with TLS parameters

### Cleanup

Use `_cleanup.bash` to clean up resources before redeploying or to tear down the environment:

```bash
# Restart deployment (recommended before re-running _launch.bash)
# Uninstalls Helm release, deletes namespace, waits for cleanup
./_cleanup.bash -k

# Clean local files only (certs, manifests, configs)
./_cleanup.bash -f

# Full cleanup (Kubernetes resources + local files)
./_cleanup.bash -a

# Delete GKE cluster(s) entirely
./_cleanup.bash -c
```

| Option | Description |
|--------|-------------|
| `-k` | **Kubernetes only**: Uninstalls MCK Helm release, deletes namespace, waits for termination |
| `-f` | **Files only**: Removes generated certs, manifests, and config files |
| `-a` | **All**: Full cleanup of both K8s resources and local files (prompts for confirmation) |
| `-c` | **Cluster**: Deletes the GKE cluster(s) entirely (prompts for confirmation) |

**Typical workflow to restart a failed deployment:**
```bash
./_cleanup.bash -k   # Clean up Kubernetes resources
./_launch.bash       # Re-run the deployment
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Pods stuck in `Pending` | Check node resources: `kubectl describe nodes` |
| Ops Manager not ready | Wait for AppDB: `kubectl get mongodb -n mongodb -w` |
| TLS certificate errors | Regenerate certs: `certs/generate_ca.bash && certs/make_OM_certs.bash` |
| External access not working | Check service type: `kubectl get svc -n mongodb` |
| LDAP auth failing | Verify LDAP pod: `kubectl get pods -n mongodb | grep ldap` |

### Diagnostic Commands

```bash
# Check MCK operator
kubectl get deployments mongodb-kubernetes-operator -n mongodb
kubectl logs -l app.kubernetes.io/name=mongodb-kubernetes -n mongodb

# Check Ops Manager status
kubectl get opsmanagers -n mongodb
kubectl describe opsmanager opsmanager -n mongodb

# Check MongoDB clusters
kubectl get mongodb -n mongodb
kubectl describe mongodb <cluster-name> -n mongodb

# Collect diagnostic data
misc/mdb_operator_diagnostic_data.sh
```

## Versions

| Component | Version | Documentation |
|-----------|---------|---------------|
| MongoDB Controllers for Kubernetes (MCK) | 1.6.0 | [Docs](https://www.mongodb.com/docs/kubernetes/current/) |
| Ops Manager | 8.0.14 | [Release Notes](https://www.mongodb.com/docs/ops-manager/current/release-notes/application/) |
| MongoDB Enterprise | 8.2.0-ent | [Compatibility](https://www.mongodb.com/docs/ops-manager/current/reference/mongodb-compatibility/) |
| cert-manager | v1.16.2 | [Docs](https://cert-manager.io/docs/) |
| MongoDB Search (Preview) | 0.55.0 | [Docs](https://www.mongodb.com/docs/kubernetes/current/fts-vs-deployment/) |

## Related Projects

Other MongoDB projects in this research repository:

| Project | Description |
|---------|-------------|
| [ops-manager-alerts-creation](../ops-manager-alerts-creation/) | Automate Ops Manager alert creation from Excel configs |
| [atlas-alerts-creation](../atlas-alerts-creation/) | Automate MongoDB Atlas alert deployment |
| [mongodb-failover-tester](../mongodb-failover-tester/) | Test MongoDB driver failover resilience |

## References

- [MongoDB Controllers for Kubernetes Documentation](https://www.mongodb.com/docs/kubernetes/current/)
- [MongoDB Ops Manager Documentation](https://www.mongodb.com/docs/ops-manager/current/)
- [cert-manager Documentation](https://cert-manager.io/docs/)
- [Helm Charts Repository](https://github.com/mongodb/helm-charts)
- [MongoDB Kubernetes Operator GitHub](https://github.com/mongodb/mongodb-kubernetes)
