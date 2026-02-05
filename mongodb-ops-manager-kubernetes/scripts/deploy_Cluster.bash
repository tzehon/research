#!/bin/bash

# Resolve to absolute path so script works when called from PATH
d=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )
cd "${d}"
source init.conf

while getopts 'n:c:m:d:v:l:ks:r:i:o:p:e:gxh-:' opt
do
  case "$opt" in
    n) name="$OPTARG" ;;
    c) cpu="$OPTARG" ;;
    m) mem="$OPTARG" ;;
    d) dsk="$OPTARG" ;;
    v) ver="$OPTARG" ;;
    e) expose="$OPTARG" ;;
    l) ldap="$OPTARG" ;;
    k) kmip=true ;;
    o) orgName="$OPTARG";;
    p) projectName="$OPTARG";;
    g) makeCerts=false ;;
    x) x=true ;; # cleanup
    s) shards="$OPTARG" ;;
    r) mongos="$OPTARG" ;;
    -)
      case "${OPTARG}" in
        search) search=true ;;
        *)
          echo "Unknown option --${OPTARG}"
          exit 1
          ;;
      esac
      ;;
    ?|h)
      echo "Usage: $(basename $0) [-n name] [-c cpu] [-m memory] [-d disk] [-v ver] [ -e horizon ] [-s shards] [-r mongos] [-l ldap[s]] [-k] [-o orgName] [-p projectName] [-g] [-x] [--search]"
      echo "Usage:       -e to generate the external service definitions when using externalDomain or splitHorizon names"
      echo "Usage:           - for replicaSets: use -e horizon or -e external.domain"
      echo "Usage:           - for sharded clusters: use -e mongos"
      echo "Usage:       -g to NOT (re)create the certs."
      echo "Usage:       -x for a total clean up "
      echo "Usage:       --search to deploy MongoDB Search nodes (Preview, ReplicaSet only, requires MongoDB 8.2+)"
      exit 1
      ;;
  esac
done
shift "$(($OPTIND -1))"

if [[ $shards != "" || $mongos != "" ]]
then
    sharded=true
    shards="${shards:-2}"
    mongos="${mongos:-1}"
    name="${name:-mysharded}"
    template="../templates/mdb_template_sh.yaml"
    # mongos and configServer resources (good for a demo)
    msmem="2Gi"
    mscpu="0.5"
    csmem="2Gi"
    cscpu="0.5"
else
    sharded=false
    name="${name:-myreplicset}"
    template="${name:-myreplicaset}"
    template="../templates/mdb_template_rs.yaml"
fi

# Search nodes configuration (Preview feature)
search=${search:-false}
if [[ ${search} == true ]]
then
    # Validate: search only works with ReplicaSet
    if [[ ${sharded} == true ]]
    then
        printf "Error: --search is only supported for ReplicaSets, not sharded clusters.\n"
        printf "       MongoDB Search nodes are tightly coupled with a single replica set.\n"
        exit 1
    fi
    # Validate: search requires MongoDB 8.2+
    searchMinVer="8.2"
    verNum="${ver:-$mdbVersion}"
    verMajorMinor="${verNum%.*}"  # Remove patch version
    verMajorMinor="${verMajorMinor%-ent}"  # Remove -ent suffix if present
    if [[ $(printf '%s\n' "$searchMinVer" "$verMajorMinor" | sort -V | head -n1) != "$searchMinVer" ]]
    then
        printf "Error: --search requires MongoDB 8.2 or higher.\n"
        printf "       Current version: ${verNum}\n"
        printf "       Update mdbVersion in init.conf or use -v 8.2.0-ent\n"
        exit 1
    fi
fi

ver="${ver:-$mdbVersion}"
dbFcv="${ver%.*}"
mem="${mem:-2Gi}"
cpu="${cpu:-1.0}"
dsk="${dsk:-1Gi}"
cleanup=${x:-false}
projectName="${projectName:-$name}"
if [[ ${orgName} != "" ]]
then
    orgInfo=( $( ../bin/get_org.bash -o ${orgName} ) )
    orgId=${orgInfo[1]}
fi
fullName=$( printf "${projectName}-${name}"| tr '[:upper:]' '[:lower:]' )
makeCerts=${makeCerts:-true}
[[ ${demo} ]] && serviceType="NodePort"
duplicateServiceObjects=false
mdbKind="MongoDB"

# make manifest from template
mdb="mdb_${fullName}.yaml"
mdbuser1="mdbuser_${fullName}_admin.yaml"
[[ ${ldap} == 'ldap' || ${ldap} == 'ldaps' ]] && mdbuser2="mdbuser_${fullName}_ldap.yaml"

tlsc="#TLS "
tlsr=${tlsc}
[[ ${x509} == true ]] && x509m=', "X509"'
if [[ ${tls} == true ]]
then
    tlsr=""
else
    x509m="" # disable x509 if TLS is off
fi

sslRequireValidMMSServerCertificates=false
allowConnectionsWithoutCertificates=true
tlsMode=${tlsMode:-"requireTLS"}
if [[ ${tlsMode} == "requireTLS" ]]
then
    sslRequireValidMMSServerCertificates=true
    allowConnectionsWithoutCertificates=false
fi

kmipc="#KMIP "
kmipString=${kmipc}
[[ ${kmip} == true ]] && kmipString=""

ldapt="#LDAPT "
ldaptls="none"
ldapString="#LDAP  "
if [[ ${ldap} == 'ldaps' ]]
then
    ldapt=""
    ldaptls="tls"
    ldapm=', "LDAP"'
    ldapString=""
elif [[ ${ldap} == 'ldap' ]]
then
    ldapt="#LDAPT "
    ldaptls="none"
    ldapm=', "LDAP"'
    ldapString=""
fi

# expose services
exposeString="#EXPOSE "
extdomainString="#EXTDOMAIN "
# externalDomain is a per MDB Cluster parameter
unset externalDomain
if [[ ${expose} ]]
then
  exposeString=""
  if [[ ${expose} != "horizon" ]]
  then
    exposeString=""
    export externalDomain="${expose}"
    extdomainString=""
    duplicateServiceObjects=false
  fi
fi

cat ${template} | sed \
  -e "s|MDBKIND|$mdbKind|" \
  -e "s|#EXPOSE |$exposeString|" \
  -e "s|EXTDOMAINNAME|$externalDomain|" \
  -e "s|#EXTDOMAIN |$extdomainString|" \
  -e "s|DOMAINNAME|$clusterDomain|" \
  -e "s|DUPSERVICE|$duplicateServiceObjects|" \
  -e "s|$tlsc|$tlsr|" \
  -e "s|TLSMODE|$tlsMode|" \
  -e "s|ALLOWCON|$allowConnectionsWithoutCertificates|" \
  -e "s|$kmipc|$kmipString|" \
  -e "s|VERSION|$ver|" \
  -e "s|FCV|$dbFcv|" \
  -e "s|RSMEM|$mem|" \
  -e "s|RSCPU|$cpu|" \
  -e "s|RSDISK|$dsk|" \
  -e "s|SHARDS|$shards|" \
  -e "s|MONGOS|$mongos|" \
  -e "s|CSCPU|$cscpu|" \
  -e "s|CSMEM|$csmem|" \
  -e "s|MSCPU|$mscpu|" \
  -e "s|MSMEM|$msmem|" \
  -e "s|NAMESPACE|$namespace|" \
  -e "s|OPSMANAGER|$omName|" \
  -e "s|SERVICETYPE|$serviceType|" \
  -e "s|X509M|$x509m|" \
  -e "s|LDAPM|$ldapm|" \
  -e "s|#LDAP  |$ldapString|" \
  -e "s|#LDAPT |$ldapt|" \
  -e "s|LDAPTLS|$ldaptls|" \
  -e "s|LDAPBINDQUERYUSER|$ldapBindQueryUser|" \
  -e "s|LDAPAUTHZQUERYTEMPLATE|$ldapAuthzQueryTemplate|" \
  -e "s|LDAPUSERTODNMAPPING|$ldapUserToDNMapping|" \
  -e "s|LDAPTIMEOUTMS|$ldapTimeoutMS|" \
  -e "s|LDAPUSERCACHEINVALIDATIONINTERVAL|$ldapUserCacheInvalidationInterval|" \
  -e "s|LDAPSERVER|$ldapServer|" \
  -e "s|LDAPCERTMAPNAME|$ldapCertMapName|" \
  -e "s|LDAPKEY|$ldapKey|" \
  -e "s|PROJECT-NAME|$fullName|" > "$mdb"

cat ../templates/mdbuser_template_admin.yaml | sed \
    -e "s|NAME|${fullName}|" \
    -e "s|USER|${dbuser}|" > "$mdbuser1"

if [[ ${ldap} == 'ldap' || ${ldap} == 'ldaps' ]]
then
  cat ../templates/mdbuser_template_ldap.yaml | sed \
      -e "s|NAME|${fullName}|" \
      -e "s|USER|${ldapUser}|" > "$mdbuser2"
fi

# clean up old stuff
if [[ ${cleanup} == true ]]
then
  printf "Cleaning up ... \n"
  kubectl -n ${namespace} delete ${mdbKind} "${fullName}" --now > /dev/null 2>&1
  for type in sts pods svc secrets configmaps pvc mdbu
  do
    kubectl -n ${namespace} delete $( kubectl -n ${namespace} get $type -o name | grep "${fullName}" ) --now > /dev/null 2>&1
  done
  if [[ ${tls} == true ]]
  then
  for type in csr certificaterequests certificates secrets
  do
    kubectl -n ${namespace} delete $( kubectl -n ${namespace} get $type -o name | grep "${fullName}" ) --now > /dev/null 2>&1
  done
  fi
  ../bin/delete_project.bash -p ${projectName}
  printf "... Done.\n"
  exit
fi

# Create map for OM Org/Project
printf "Using Ops Manager at: ${opsMgrUrl} \n"
printf "%s\n" "Deploying cluster: ${fullName}, version: ${ver}, cores: ${cpu}, memory: ${mem}, disk: ${dsk}"
[[ ${shards} ]] && printf "%s\n" "    shards: ${shards}, mongos: ${mongos}"
printf "%s\n" "    in org: ${deploymentOrgName}, project: ${projectName} with: expose: ${expose}, LDAP: ${ldapType}"

# Search nodes info message
if [[ ${sharded} == false ]]
then
    if [[ ${search} == true ]]
    then
        printf "\n%s\n" "MongoDB Search nodes will be deployed after cluster reaches Running state. (Preview)"
    else
        printf "\n%s\n" "Note: MongoDB Search nodes can be enabled with --search (Preview, requires MongoDB 8.2+). Skipping search deployment."
    fi
fi
printf "\n"

if [[ ${tls} == true ]]
then
  kubectl -n ${namespace} delete configmap "${fullName}" > /dev/null 2>&1
  kubectl -n ${namespace} create configmap "${fullName}" \
        --from-literal="baseUrl=${opsMgrUrl}" \
        --from-literal="orgId=${orgId}" \
        --from-literal="projectName=${projectName}" \
        --from-literal="sslMMSCAConfigMap=${omName}-ca" \
        --from-literal="sslRequireValidMMSServerCertificates=${sslRequireValidMMSServerCertificates}" 2> /dev/null

  if [[ ${sharded} == true ]]
  then
    if [[ ${makeCerts} == true ]]
    then
      # mdb-{metadata.name}-mongos-cert
      # mdb-{metadata.name}-config-cert
      # mdb-{metadata.name}-<x>-cert x=0,1 (2 shards)
      for ctype in agent mongos config $( seq -s " " 0 $(( $shards-1)) )
      do
      # Create a secret for the member certs for TLS
      cert="-cert"
      [[ "${ctype}" == "agent" ]] && cert="-certs"
      "${PWD}/../certs/make_sharded_certs.bash" "${fullName}" ${ctype} ${cert}
      kubectl -n ${namespace} apply -f "${PWD}/../certs/certs_mdb-${fullName}-${ctype}${cert}.yaml"
      done
    fi
  else
    # ReplicaSet
    # create new certs if the service does not exist
    if [[ ${makeCerts} == true ]]
    then
      kubectl -n ${namespace} delete secret mdb-${fullName}-cert > /dev/null 2>&1
      "${PWD}/../certs/make_cluster_certs.bash" "${fullName}"
      kubectl -n ${namespace} apply -f "${PWD}/../certs/certs_mdb-${fullName}-cert.yaml"

      ctype="agent"
      cert="-certs"
      kubectl -n ${namespace} delete secret mdb-${fullName}-${ctype}${cert} > /dev/null 2>&1
      "${PWD}/../certs/make_sharded_certs.bash" "${fullName}" ${ctype} ${cert}
      kubectl -n ${namespace} apply -f "${PWD}/../certs/certs_mdb-${fullName}-${ctype}${cert}.yaml"
    fi
  fi # end if sharded or replicaset

else
# no tls here
    kubectl -n ${namespace} delete configmap "${fullName}" > /dev/null 2>&1
    kubectl -n ${namespace} create configmap "${fullName}" \
    --from-literal="orgId=${orgId}" \
    --from-literal="projectName=${projectName}" \
    --from-literal="baseUrl=${opsMgrUrl}" 2> /dev/null
fi # tls

# create secrets and config map for KMIP server
if [[ ${kmip} == true ]]
then
    kubectl -n ${namespace} delete configmap ${fullName}-kmip-ca-pem >/dev/null 2>&1
    kubectl -n ${namespace} create configmap ${fullName}-kmip-ca-pem --from-file="ca.pem=certs/kmip_ca.pem"
    kubectl -n ${namespace} delete secret generic ${fullName}-kmip-client-pem >/dev/null 2>&1
    kubectl -n ${namespace} create secret generic ${fullName}-kmip-client-pem --from-file="cert.pem=certs/kmip_cert.pem"
fi

# Create a a secret for a db user credentials
kubectl -n ${namespace} delete secret         ${fullName}-admin > /dev/null 2>&1
kubectl -n ${namespace} create secret generic ${fullName}-admin \
    --from-literal=name="${dbuser}" \
    --from-literal=password="${dbpassword}" 2> /dev/null

# Create the User Resources
kubectl -n ${namespace} delete mdbu ${fullName}-admin > /dev/null 2>&1
kubectl -n ${namespace} apply -f "${mdbuser1}" 2> /dev/null

if [[ ${ldap} == 'ldap' || ${ldap} == 'ldaps' ]]
then
  kubectl -n ${namespace} delete mdbu ${fullName}-ldap > /dev/null 2>&1
  kubectl -n ${namespace} apply -f "${mdbuser2}"
  kubectl -n ${namespace} delete secret "${fullName}-ldapsecret" > /dev/null 2>&1
  kubectl -n ${namespace} create secret generic "${fullName}-ldapsecret" \
    --from-literal=password="${ldapBindQueryPassword}" 2> /dev/null
fi

# Create the DB Resource
kubectl -n ${namespace} apply -f "${mdb}"
# for SplitHorizons - append horizons and reissue certs with horizons
sleep 3
if [[ ${expose} && ${sharded} == false ]]
then
  printf "%s\n" "Generating ${serviceType} Service ports ..."
  serviceOut=$( ../bin/expose_service.bash -n "${fullName}" -g ${makeCerts} )
  if [[ $? != 0 ]]
  then
    printf "* * * Error - Failed to get services.\n"
    exit 1
  fi
  printf "${serviceOut}\n"| head -n 5
  if [[ ${externalDomain} ]]
  then
    printf "\nMake sure external DNS is configured for your replicaSet\n"
    printf "  - Match repSet names to the service External-IP\n"
    printf "  - The repSet names are : ${fullName}-[012].${externalDomain}\n"
    ../bin/update_dns.bash -n "${fullName}"
  else
    kubectl -n ${namespace} apply -f "${mdb}" # re-apply for splitHorizon addition
    printf "\nAdded this configuration to the manifest ${mdb}:\n"
    eval tail -n 5 "${mdb}"
  fi
  printf "... Done.\n"
fi

# remove any certificate requests
if [[ ${tls} == true ]]
then
  kubectl -n ${namespace} delete csr $( kubectl -n ${namespace} get csr -o name | grep "${fullName}" ) > /dev/null 2>&1
  kubectl -n ${namespace} delete certificaterequest $( kubectl -n ${namespace} get certificaterequest -o name | grep "${fullName}" ) > /dev/null 2>&1
fi

# Monitor the progress
resource="${mdbKind}/${fullName}"
printf "\n%s\n" "Monitoring the progress of resource ${resource} ..."
notapproved="Not all certificates have been approved"
certificate="Certificate"
n=0
max=80
while [ $n -lt $max ]
do
    kubectl -n ${namespace} get "${resource}"
    pstatus=$( kubectl -n ${namespace} get "${resource}" -o jsonpath={'.status.phase'} )
    message=$( kubectl -n ${namespace} get "${resource}" -o jsonpath={'.status.message'} )
    printf "%s\n" "status.message: $message"
    if [[ "$pstatus" == "Running" ]];
    then
        printf "Status: %s\n" "$pstatus"
        break
    fi
    sleep 15
    n=$((n+1))
done

sleep 5
printf "\n"

# For sharded clusters with external access, regenerate mongos certs with external DNS
if [[ ${sharded} == true && ${tls} == true && ${makeCerts} == true ]]
then
    printf "%s\n" "Regenerating mongos certificates with external DNS names..."
    # Wait for mongos services to get external IPs
    for i in $(seq 0 $((mongos-1))); do
        svc_name="${fullName}-mongos-${i}-svc-external"
        n=0
        max=30
        while [ $n -lt $max ]; do
            ip=$(kubectl -n ${namespace} get svc/${svc_name} -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null)
            [[ -n "$ip" ]] && break
            sleep 5
            n=$((n+1))
        done
    done
    # Get external DNS names for all mongos
    ext_dns=()
    for i in $(seq 0 $((mongos-1))); do
        svc_name="${fullName}-mongos-${i}-svc-external"
        hn=$(../bin/get_hns.bash -s "${svc_name}" 2>/dev/null | tr -d '[:space:]' | cut -d: -f1)
        [[ -n "$hn" ]] && ext_dns+=("$hn")
    done
    if [[ ${#ext_dns[@]} -gt 0 ]]; then
        printf "%s\n" "External DNS names: ${ext_dns[*]}"
        "${PWD}/../certs/make_sharded_certs.bash" "${fullName}" mongos -cert "${ext_dns[@]}"
        kubectl -n ${namespace} apply -f "${PWD}/../certs/certs_mdb-${fullName}-mongos-cert.yaml"
        printf "%s\n" "Mongos certificates updated with external DNS names."
    fi
fi

# Deploy MongoDB Search nodes if --search was specified (ReplicaSet only)
if [[ ${search} == true && ${sharded} == false ]]
then
    printf "\n%s\n" "__________________________________________________________________________________________"
    printf "%s\n" "Deploying MongoDB Search nodes (Preview)..."

    # Create search user template files
    mdbsearchuser="mdbuser_${fullName}_search.yaml"
    mdbsearch="mdbsearch_${fullName}.yaml"
    searchUser="search-sync-source"
    searchPasswordSecret="${fullName}-search-sync-source-password"
    searchPassword="SearchSync1\$"
    searchTlsSecret="${fullName}-search-tls"

    # Create search user password secret
    kubectl -n ${namespace} delete secret "${searchPasswordSecret}" > /dev/null 2>&1
    kubectl -n ${namespace} create secret generic "${searchPasswordSecret}" \
        --from-literal=password="${searchPassword}" 2> /dev/null

    # Create search user with searchCoordinator role
    # Note: SECRETNAME must be replaced before NAME to avoid collision
    cat ../templates/mdbuser_template_search.yaml | sed \
        -e "s|SECRETNAME|${searchPasswordSecret}|g" \
        -e "s|NAME|${fullName}|g" \
        -e "s|USER|${searchUser}|g" > "${mdbsearchuser}"

    kubectl -n ${namespace} delete mdbu ${fullName}-search > /dev/null 2>&1
    kubectl -n ${namespace} apply -f "${mdbsearchuser}"
    printf "%s\n" "Created search sync user: ${searchUser}"

    # Issue TLS certificate for search nodes
    if [[ ${tls} == true ]]
    then
        searchDnsName="${fullName}-search-svc.${namespace}.svc.${clusterDomain}"
        kubectl -n ${namespace} apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: ${fullName}-search-tls
  namespace: ${namespace}
spec:
  secretName: ${searchTlsSecret}
  issuerRef:
    name: ${issuerName}
    kind: Issuer
  duration: 240h0m0s
  renewBefore: 120h0m0s
  usages:
    - digital signature
    - key encipherment
    - server auth
    - client auth
  dnsNames:
    - "${searchDnsName}"
EOF
        printf "%s\n" "Issued TLS certificate for search nodes"
        # Wait for certificate to be ready
        kubectl -n ${namespace} wait --for=condition=Ready certificate/${fullName}-search-tls --timeout=120s 2>/dev/null
    fi

    # Create MongoDBSearch resource
    cat ../templates/mdbsearch_template.yaml | sed \
        -e "s|RESOURCENAME|${fullName}|g" \
        -e "s|MDBNAMESPACE|${namespace}|g" \
        -e "s|SEARCHUSER|${searchUser}|g" \
        -e "s|SEARCHPASSWORDSECRET|${searchPasswordSecret}|g" \
        -e "s|SEARCHTLSSECRET|${searchTlsSecret}|g" > "${mdbsearch}"

    # Apply MongoDBSearch resource
    kubectl -n ${namespace} apply -f "${mdbsearch}"
    printf "%s\n" "Applied MongoDBSearch resource: ${fullName}"

    # Wait for MongoDBSearch to reach Running
    printf "%s\n" "Waiting for MongoDBSearch to reach Running state..."
    n=0
    max=40
    while [ $n -lt $max ]
    do
        kubectl -n ${namespace} get mdbs "${fullName}" 2>/dev/null
        searchStatus=$( kubectl -n ${namespace} get mdbs "${fullName}" -o jsonpath='{.status.phase}' 2>/dev/null )
        if [[ "$searchStatus" == "Running" ]]
        then
            printf "%s\n" "MongoDBSearch status: Running"
            break
        fi
        sleep 15
        n=$((n+1))
    done

    if [[ "$searchStatus" == "Running" ]]
    then
        printf "\n%s\n" "MongoDB Search nodes deployed successfully!"
        printf "%s\n" "To verify search is working, run: bin/test_search.bash -n ${fullName}"
    else
        printf "\n%s\n" "Warning: MongoDBSearch did not reach Running state within timeout."
        printf "%s\n" "Check status: kubectl -n ${namespace} describe mdbs ${fullName}"
        printf "%s\n" "Check logs: kubectl -n ${namespace} logs ${fullName}-search-0"
    fi
fi

cs=$( ../bin/get_connection_string.bash -n "${fullName}" )
if [[ "$cs" == *external* ]]
then
    printf "\n%s\n\n" "$cs"
    printf "%s\n" "To see if access is working, connect directly by running: connect_external.bash -n \"${fullName}\""
    printf "%s\n" "                      or connect from the pod by running: connect_from_pod.bash -n \"${fullName}\""
else
    printf "\n%s\n\n" "$cs"
    printf "%s\n" "To see if access is working, connect from the pod by running: connect_from_pod.bash -n \"${fullName}\""
fi
exit 0
