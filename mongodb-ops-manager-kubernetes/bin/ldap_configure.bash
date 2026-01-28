#!/bin/bash

# Resolve bin directory and add to PATH so scripts can find each other
_bindir=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )
PATH="${_bindir}:${PATH}"
source "${_bindir}/../scripts/init.conf"
[[ ${demo} ]] && serviceType="NodePort"

kubectl config set-context $(kubectl config current-context) --namespace=${namespace}

serviceName="openldap-svc-ext"
max=30
n=0
while [ $n -lt $max ]
do
    out=$( kubectl get svc | grep "${serviceName}.*pending" )
    if [[ $? == 1 ]]
    then
        kubectl get $( kubectl get svc -o name | grep "${serviceName}" )
        [[ $? == 1 ]] && exit 1
        break
    fi
    sleep 5
    n=$((n+1))
done

if [[ $serviceType == "NodePort" ]]
then
    slist=( $(get_hns.bash -s "${serviceName}" ) ) 
    hostName="${slist[0]%:*}"
    eval port=$(    kubectl get svc/${serviceName} -o jsonpath={.spec.ports[0].nodePort} )
else
    eval hostName=$(    kubectl get svc/${serviceName} -o jsonpath={.status.loadBalancer.ingress[0].hostname} ) 
    if [[ $hostName == "" ]]
    then
    slist=( $(get_hns.bash -s "${serviceName}" ) ) 
    hostName="${slist[0]%:*}"
    fi
    eval port=$(  kubectl get svc/${serviceName} -o jsonpath={.spec.ports[0].targetPort} )
fi
ldapServer="ldap://${hostName}:${port}"

ldapadd -H ${ldapServer} -x -c -w configpassword -D cn=admin,cn=config <<EOF
dn: cn=module,cn=config
cn: module 
objectClass: olcModuleList
olcModulePath: /opt/bitnami/openldap/lib/openldap
olcModuleLoad: memberof.so
EOF

ldapadd -H ${ldapServer} -x -c -w configpassword -D cn=admin,cn=config <<EOF
dn: olcOverlay=memberof,olcDatabase={2}mdb,cn=config
objectClass: olcOverlayConfig
objectClass: olcMemberOf
olcOverlay: memberof
olcMemberOfRefint: TRUE
EOF

# add User TL
ldapmodify -H ${ldapServer} -x -a -w ${ldapBindQueryPassword} -D cn=admin,dc=example,dc=org <<EOF
dn: cn=Thomas.Luckenbach,ou=users,dc=example,dc=org
cn: Thomas
sn: Luckenbach
givenName: Thomas
objectClass: posixAccount
objectClass: inetOrgPerson
uid: thomas.luckenbach
mail: thomas.luckenbach@mongodb.com
userPassword: Mongodb1$
uidNumber: 1002
gidNumber: 1002
homeDirectory: /Users/tluck
EOF

# add User SL
ldapmodify -H ${ldapServer} -x -a -w ${ldapBindQueryPassword} -D cn=admin,dc=example,dc=org <<EOF
dn: cn=Suzanne.Luckenbach,ou=users,dc=example,dc=org
cn: Suzanne
sn: Luckenbach
givenName: Suzanne
objectClass: posixAccount
objectClass: inetOrgPerson
uid:  suzanne.luckenbach
mail: suzanne.luckenbach@mongodb.com
userPassword: Mongodb1$
uidNumber: 1003
gidNumber: 1003
homeDirectory: /Users/suzanne
EOF

# put users in readers group -  DB users
ldapmodify -H ${ldapServer} -x -c -w ${ldapBindQueryPassword} -D cn=admin,dc=example,dc=org <<EOF
dn: cn=readers,ou=users,dc=example,dc=org
add: member
member: cn=Thomas.Luckenbach,ou=users,dc=example,dc=org
EOF

# create dbusers group and add users  - org ossociations
ldapadd -H ${ldapServer} -x -c -w ${ldapBindQueryPassword} -D cn=admin,dc=example,dc=org <<EOF
dn: cn=dbusers,ou=users,dc=example,dc=org
cn: dbusers
objectClass: groupOfNames
member: cn=User01,ou=users,dc=example,dc=org
member: cn=User02,ou=users,dc=example,dc=org
member: cn=Thomas.Luckenbach,ou=users,dc=example,dc=org
EOF

# create dbadmin group and add users  - org ossociations
ldapadd -H ${ldapServer} -x -c -w ${ldapBindQueryPassword} -D cn=admin,dc=example,dc=org <<EOF
dn: cn=dbadmins,ou=users,dc=example,dc=org
cn: dbadmins
objectClass: groupOfNames
member: cn=dbAdmin,ou=users,dc=example,dc=org
EOF

# create managers group and add users  - org ossociations
ldapadd -H ${ldapServer} -x -c -w ${ldapBindQueryPassword} -D cn=admin,dc=example,dc=org <<EOF
dn: cn=managers,ou=users,dc=example,dc=org
cn: managers
objectClass: groupOfNames
member: cn=Thomas.Luckenbach,ou=users,dc=example,dc=org
member: cn=Suzanne.Luckenbach,ou=users,dc=example,dc=org
EOF

printf "%s\n" "created ldapServer=ldap://${hostName}:${port}"
