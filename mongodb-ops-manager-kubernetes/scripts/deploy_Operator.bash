#!/bin/bash

# Resolve to absolute path so script works when called from PATH
d=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )
cd "${d}"
source init.conf

# MongoDB Controllers for Kubernetes (MCK)
# Docs: https://www.mongodb.com/docs/kubernetes/current/
# Chart: https://github.com/mongodb/helm-charts/tree/main/charts/mongodb-kubernetes
# Repo: https://github.com/mongodb/mongodb-kubernetes

# Create the namespace and context
kubectl config set-context $(kubectl config current-context) --namespace=${namespace}
kubectl create namespace ${namespace} 2>/dev/null || true

# Delete old operator deployment if it exists (MEKO)
kubectl delete deployment mongodb-enterprise-operator -n ${namespace} > /dev/null 2>&1

# Check if Helm is available (required for MCK)
if command -v helm &> /dev/null; then
    echo "Installing MongoDB Controllers for Kubernetes (MCK) via Helm..."

    # Add MongoDB Helm repo
    helm repo add mongodb https://mongodb.github.io/helm-charts 2>/dev/null || true
    helm repo update mongodb

    # Install MCK via Helm (upgrade --install is idempotent)
    # Chart: mongodb/mongodb-kubernetes
    # CRDs are installed by Helm from the chart's crds/ directory
    # Version is set in init.conf (mckVersion)
    helm upgrade --install mongodb-kubernetes mongodb/mongodb-kubernetes \
      --namespace ${namespace} \
      --create-namespace \
      --version ${mckVersion:-1.7.0} \
      --set operator.watchNamespace=${namespace} \
      --wait --timeout 10m

    echo "MCK version: ${mckVersion:-1.7.0}"

    if [[ $? -ne 0 ]]; then
        echo "ERROR: Helm install failed"
        echo "Check: helm status mongodb-kubernetes -n ${namespace}"
        exit 1
    fi
    echo "MCK installed successfully via Helm"
else
    echo "ERROR: Helm is required to install MCK"
    echo "Install Helm: https://helm.sh/docs/intro/install/"
    exit 1
fi

# Wait for CRDs to be established
echo "Waiting for CRDs to be established..."
for crd in mongodb.mongodb.com opsmanagers.mongodb.com mongodbusers.mongodb.com; do
    kubectl wait --for=condition=established --timeout=60s crd/${crd} 2>/dev/null || {
        echo "WARNING: CRD ${crd} not established yet"
    }
done

# Wait for operator deployment to be ready
echo "Waiting for MCK operator to be ready..."
# MCK deployment name is 'mongodb-kubernetes-operator'
if ! kubectl wait --for=condition=available --timeout=300s deployment/mongodb-kubernetes-operator -n ${namespace} 2>/dev/null; then
    echo "ERROR: Operator deployment not ready."
    echo "Check with: kubectl get deployments -n ${namespace}"
    kubectl get pods -n ${namespace}
    exit 1
fi

# Final verification
echo "Verifying CRDs are registered..."
for crd in mongodb.mongodb.com opsmanagers.mongodb.com mongodbusers.mongodb.com; do
    if ! kubectl get crd ${crd} &>/dev/null; then
        echo "ERROR: CRD ${crd} not found"
        exit 1
    fi
done
echo "MCK operator is ready and CRDs are registered."

if [[ ${tls} == true ]] 
then
    which cfssl > /dev/null
    if [[ $? != 0 ]]
    then
        printf "%s\n" "Exiting - Missing cloudformation certificiate tools - install cfssl and cfssljson"
        exit 1
    fi
    ../certs/make_cert_issuer.bash ${namespace} ${issuerName} ${issuerVersion}
    [[ $? != 0 ]] && exit 1
fi
exit 0
