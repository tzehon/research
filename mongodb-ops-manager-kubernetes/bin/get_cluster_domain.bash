#!/bin/bash

# Detect and display the Kubernetes cluster's DNS domain.
# Use this to verify that clusterDomain in init.conf matches your cluster.
#
# Usage: get_cluster_domain.bash

# Try CoreDNS configmap (works on EKS, GKE, AKS, kubeadm, etc.)
domain=$(kubectl get cm coredns -n kube-system -o jsonpath='{.data.Corefile}' 2>/dev/null \
    | awk '/kubernetes/ {print $2; exit}')

# Fallback: try kube-dns configmap (older clusters)
if [[ -z "${domain}" ]]; then
    domain=$(kubectl get cm kube-dns -n kube-system -o jsonpath='{.data.stubDomains}' 2>/dev/null \
        | awk -F'"' '{print $2; exit}')
fi

# Default fallback
domain="${domain:-cluster.local}"

printf "%s\n" "${domain}"
