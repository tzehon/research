#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# Atlas Custom DB Role Test Harness
#
# Tests a collection-scoped read-only role using ONLY Atlas CLI and mongosh.
# No curl / REST calls.
###############################################################################

# ── Source .env if present ───────────────────────────────────────────────────
if [[ -f "$(dirname "$0")/.env" ]]; then
  # shellcheck disable=SC1091
  source "$(dirname "$0")/.env"
fi

# ── Defaults ─────────────────────────────────────────────────────────────────
TEST_DB="${TEST_DB:-role_test_db}"
TEST_ALLOWED_COLLECTION="${TEST_ALLOWED_COLLECTION:-demo_readonly}"
TEST_DENIED_COLLECTION="${TEST_DENIED_COLLECTION:-other_coll}"
TEST_ROLE_NAME="${TEST_ROLE_NAME:-readDemoCollectionOnly}"
TEST_USERNAME="${TEST_USERNAME:-test_readonly_user}"
TEST_PASSWORD="${TEST_PASSWORD:-testReadOnlyPwd123!}"

# ── Helpers ──────────────────────────────────────────────────────────────────

banner() {
  echo ""
  echo "================================================================"
  echo "  $1"
  echo "================================================================"
  echo ""
}

mask() {
  # Replace the value with asterisks, keeping the first 4 chars if long enough
  local val="$1"
  if [[ ${#val} -le 4 ]]; then
    echo "****"
  else
    echo "${val:0:4}****"
  fi
}

# Build Atlas CLI profile flag if ATLAS_PROFILE is set
atlas_profile_flag() {
  if [[ -n "${ATLAS_PROFILE:-}" ]]; then
    echo "--profile ${ATLAS_PROFILE}"
  fi
}

require_env() {
  local var_name="$1"
  if [[ -z "${!var_name:-}" ]]; then
    echo "ERROR: Required environment variable ${var_name} is not set." >&2
    echo "       See .env.sample for guidance." >&2
    exit 1
  fi
}

# ── Step 1: Setup test data ─────────────────────────────────────────────────

setup_data() {
  banner "STEP 1: Setting up test data in ${TEST_DB}"

  require_env MONGODB_URI_ADMIN

  echo "  Database:            ${TEST_DB}"
  echo "  Allowed collection:  ${TEST_ALLOWED_COLLECTION}"
  echo "  Denied collection:   ${TEST_DENIED_COLLECTION}"
  echo "  Admin URI:           $(mask "${MONGODB_URI_ADMIN}")"
  echo ""
  echo "Running mongosh to seed data ..."
  echo ""

  mongosh "${MONGODB_URI_ADMIN}" --quiet --eval "
    const dbName     = '${TEST_DB}';
    const allowedCol = '${TEST_ALLOWED_COLLECTION}';
    const deniedCol  = '${TEST_DENIED_COLLECTION}';

    const testDb = db.getSiblingDB(dbName);

    // Drop and recreate allowed collection
    testDb.getCollection(allowedCol).drop();
    testDb.createCollection(allowedCol);
    testDb.getCollection(allowedCol).insertMany([
      { item: 'widget-A', qty: 10, note: 'allowed collection doc 1' },
      { item: 'widget-B', qty: 25, note: 'allowed collection doc 2' }
    ]);
    print('Inserted 2 docs into ' + dbName + '.' + allowedCol);

    // Drop and recreate denied collection
    testDb.getCollection(deniedCol).drop();
    testDb.createCollection(deniedCol);
    testDb.getCollection(deniedCol).insertOne(
      { item: 'secret-X', qty: 99, note: 'denied collection doc' }
    );
    print('Inserted 1 doc into ' + dbName + '.' + deniedCol);

    print('');
    print('Step 1 complete.');
  "
}

# ── Step 2: Create custom DB role ───────────────────────────────────────────

create_custom_role() {
  banner "STEP 2: Creating custom DB role '${TEST_ROLE_NAME}'"

  require_env ATLAS_PROJECT_ID

  local profile_flag
  profile_flag=$(atlas_profile_flag)

  echo "  Project ID:          ${ATLAS_PROJECT_ID}"
  echo "  Role name:           ${TEST_ROLE_NAME}"
  echo "  Privilege:           FIND@${TEST_DB}.${TEST_ALLOWED_COLLECTION}"
  echo ""

  # Delete existing role (ignore errors on first run)
  echo "Deleting role if it already exists ..."
  echo "  > atlas customDbRoles delete \"${TEST_ROLE_NAME}\" --projectId \"${ATLAS_PROJECT_ID}\" --force ${profile_flag}"
  # shellcheck disable=SC2086
  atlas customDbRoles delete "${TEST_ROLE_NAME}" \
    --projectId "${ATLAS_PROJECT_ID}" \
    --force ${profile_flag} 2>/dev/null || true
  echo ""

  # Create the role
  echo "Creating role ..."
  echo "  > atlas customDbRoles create \"${TEST_ROLE_NAME}\" --projectId \"${ATLAS_PROJECT_ID}\" --privilege \"FIND@${TEST_DB}.${TEST_ALLOWED_COLLECTION}\" ${profile_flag}"
  # shellcheck disable=SC2086
  atlas customDbRoles create "${TEST_ROLE_NAME}" \
    --projectId "${ATLAS_PROJECT_ID}" \
    --privilege "FIND@${TEST_DB}.${TEST_ALLOWED_COLLECTION}" \
    ${profile_flag}

  echo ""
  echo "Step 2 complete."
}

# ── Step 3: Create DB user ──────────────────────────────────────────────────

create_db_user() {
  banner "STEP 3: Creating DB user '${TEST_USERNAME}' with role '${TEST_ROLE_NAME}'"

  require_env ATLAS_PROJECT_ID

  local profile_flag
  profile_flag=$(atlas_profile_flag)

  echo "  Project ID:          ${ATLAS_PROJECT_ID}"
  echo "  Username:            ${TEST_USERNAME}"
  echo "  Password:            $(mask "${TEST_PASSWORD}")"
  echo "  Role:                ${TEST_ROLE_NAME}"
  echo ""

  # Delete existing user (ignore errors on first run)
  echo "Deleting user if it already exists ..."
  echo "  > atlas dbusers delete \"${TEST_USERNAME}\" --projectId \"${ATLAS_PROJECT_ID}\" --authDB admin --force ${profile_flag}"
  # shellcheck disable=SC2086
  atlas dbusers delete "${TEST_USERNAME}" \
    --projectId "${ATLAS_PROJECT_ID}" \
    --authDB admin \
    --force ${profile_flag} 2>/dev/null || true
  echo ""

  # Create user with only the custom role
  echo "Creating user ..."
  echo "  > atlas dbusers create --username \"${TEST_USERNAME}\" --password \"****\" --projectId \"${ATLAS_PROJECT_ID}\" --role \"${TEST_ROLE_NAME}\" ${profile_flag}"
  # shellcheck disable=SC2086
  atlas dbusers create \
    --username "${TEST_USERNAME}" \
    --password "${TEST_PASSWORD}" \
    --projectId "${ATLAS_PROJECT_ID}" \
    --role "${TEST_ROLE_NAME}" \
    ${profile_flag}

  echo ""
  echo "Step 3 complete."
}

# ── Step 4: Verify as test user ─────────────────────────────────────────────

verify_as_test_user() {
  banner "STEP 4: Verifying permissions as '${TEST_USERNAME}'"

  require_env MONGODB_URI_ADMIN

  echo "Building test user connection string ..."

  # Use Python to rewrite the admin URI with test user credentials.
  # Works with Python 3.x (urllib.parse).
  TEST_URI=$(python3 -c "
import sys
from urllib.parse import urlparse, urlunparse, quote_plus

uri = sys.argv[1]
user = quote_plus(sys.argv[2])
pwd  = quote_plus(sys.argv[3])
db   = sys.argv[4]

parsed = urlparse(uri)

# Rebuild netloc: user:password@host(:port)
host_part = parsed.hostname
if parsed.port:
    host_part += ':' + str(parsed.port)
new_netloc = user + ':' + pwd + '@' + host_part

# Preserve query options
new = parsed._replace(
    scheme=parsed.scheme,
    netloc=new_netloc,
    path='/' + db,
)
print(urlunparse(new))
" "${MONGODB_URI_ADMIN}" "${TEST_USERNAME}" "${TEST_PASSWORD}" "${TEST_DB}")

  echo "  Test URI:            $(mask "${TEST_URI}")"
  echo ""

  local script_dir
  script_dir="$(cd "$(dirname "$0")" && pwd)"

  echo "Running verification script via mongosh ..."
  echo "  > mongosh <TEST_URI> --quiet ${script_dir}/scripts/verify_as_test_user.mongo.js"
  echo ""

  TEST_DB="${TEST_DB}" \
  TEST_ALLOWED_COLLECTION="${TEST_ALLOWED_COLLECTION}" \
  TEST_DENIED_COLLECTION="${TEST_DENIED_COLLECTION}" \
    mongosh "${TEST_URI}" --quiet "${script_dir}/scripts/verify_as_test_user.mongo.js"
}

# ── Cleanup ──────────────────────────────────────────────────────────────────

cleanup() {
  banner "CLEANUP: Removing test data, user, and role"

  require_env MONGODB_URI_ADMIN
  require_env ATLAS_PROJECT_ID

  local profile_flag
  profile_flag=$(atlas_profile_flag)

  # Drop the test database
  echo "Dropping database '${TEST_DB}' via mongosh ..."
  echo "  > mongosh <ADMIN_URI> --eval 'db.getSiblingDB(\"${TEST_DB}\").dropDatabase()'"
  mongosh "${MONGODB_URI_ADMIN}" --quiet --eval "
    db.getSiblingDB('${TEST_DB}').dropDatabase();
    print('Database ${TEST_DB} dropped.');
  "
  echo ""

  # Delete the DB user
  echo "Deleting DB user '${TEST_USERNAME}' ..."
  echo "  > atlas dbusers delete \"${TEST_USERNAME}\" --projectId \"${ATLAS_PROJECT_ID}\" --authDB admin --force ${profile_flag}"
  # shellcheck disable=SC2086
  atlas dbusers delete "${TEST_USERNAME}" \
    --projectId "${ATLAS_PROJECT_ID}" \
    --authDB admin \
    --force ${profile_flag} 2>/dev/null || true
  echo ""

  # Delete the custom role
  echo "Deleting custom role '${TEST_ROLE_NAME}' ..."
  echo "  > atlas customDbRoles delete \"${TEST_ROLE_NAME}\" --projectId \"${ATLAS_PROJECT_ID}\" --force ${profile_flag}"
  # shellcheck disable=SC2086
  atlas customDbRoles delete "${TEST_ROLE_NAME}" \
    --projectId "${ATLAS_PROJECT_ID}" \
    --force ${profile_flag} 2>/dev/null || true
  echo ""

  echo "Cleanup complete."
}

# ── Main dispatch ────────────────────────────────────────────────────────────

usage() {
  cat <<EOF
Usage: $(basename "$0") <command>

Commands:
  step1    Setup test data (seed collections via mongosh)
  step2    Create Atlas custom DB role (via Atlas CLI)
  step3    Create Atlas DB user with the custom role (via Atlas CLI)
  step4    Verify permissions as the test user (via mongosh)
  all      Run step1 through step4 sequentially
  cleanup  Remove test data, DB user, and custom role

Environment:
  See .env.sample for required and optional variables.
EOF
}

case "${1:-}" in
  step1)   setup_data ;;
  step2)   create_custom_role ;;
  step3)   create_db_user ;;
  step4)   verify_as_test_user ;;
  all)
    setup_data
    create_custom_role
    create_db_user
    echo ""
    echo "Waiting 10 seconds for Atlas to propagate the new user ..."
    sleep 10
    verify_as_test_user
    banner "ALL STEPS COMPLETE"
    ;;
  cleanup) cleanup ;;
  *)       usage; exit 1 ;;
esac
