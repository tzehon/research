# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

```bash
cd scripts
cp sample_init.conf init.conf  # Configure credentials first

# Deployment
./0_make_k8s.bash              # Create GKE cluster
./_launch.bash                 # Deploy full stack (MCK + Ops Manager + backup)

# Individual deployments
./deploy_Operator.bash         # MCK operator + cert-manager
./deploy_OM.bash               # Ops Manager + AppDB
./deploy_Cluster.bash -n myreplicaset -v 8.2.0-ent  # MongoDB cluster
./deploy_Cluster.bash -n myreplicaset -v 8.2.0-ent --search  # With search nodes (Preview)

# Cleanup
./_cleanup.bash -k             # K8s resources only (before redeploying)
./_cleanup.bash -f             # Local files only
./_cleanup.bash -a             # Full cleanup (K8s + files)
./_cleanup.bash -c             # Delete GKE cluster
```

### Utility Scripts (bin/)
```bash
bin/get_key.bash               # Get Ops Manager API keys
bin/get_connection_string.bash -n <cluster>  # Get connection string
bin/connect_external.bash -n <cluster>       # Connect via mongosh
bin/get_cluster_domain.bash    # Detect K8s cluster DNS domain
bin/deploy_ldap.bash           # Deploy OpenLDAP server
bin/test_search.bash -n <cluster>            # Test MongoDB Search (Preview)
```

## Architecture

Deploys MongoDB Ops Manager on Kubernetes using MongoDB Controllers for Kubernetes (MCK):
- **MCK Operator**: Manages MongoDB resources via CRDs (Helm-based)
- **cert-manager**: TLS certificate lifecycle management
- **Ops Manager**: Web UI + Application Database (3-node replica set)
- **Backup Infrastructure**: Oplog store + Blockstore for point-in-time recovery
- **MongoDB Search (Preview)**: `mongot` pods for full-text and vector search (ReplicaSet only, requires 8.2+)

### Directory Structure
- `scripts/` - Core deployment scripts and `init.conf` configuration
- `templates/` - YAML templates for Ops Manager, clusters, users, services
- `certs/` - Certificate generation scripts and cert-manager config
- `bin/` - Utility scripts for querying and connecting
- `helm/` - Helm chart values

### Configuration
All settings in `scripts/init.conf`:
- Credentials (`user`, `password`)
- K8s namespace, service type (LoadBalancer/NodePort)
- TLS mode, backup enable/disable
- External domain for split-horizon DNS
