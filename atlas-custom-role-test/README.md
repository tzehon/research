# Atlas Custom DB Role Test Harness

A scriptable test harness that creates and verifies a **collection-scoped read-only role** on MongoDB Atlas using **only the Atlas CLI and mongosh** — no direct REST API or curl calls.

## What It Does

The harness runs four steps (individually or all at once):

| Step | What happens | Tools used |
|------|-------------|------------|
| **step1** | Seeds two test collections with sample data | `mongosh` |
| **step2** | Creates an Atlas custom DB role granting `FIND` on exactly one collection | `atlas customDbRoles` |
| **step3** | Creates a database user with only that custom role | `atlas dbusers` |
| **step4** | Connects as the test user and verifies reads succeed on the allowed collection, and reads/writes fail everywhere else | `mongosh` |
| **cleanup** | Drops the test database, deletes the user, and deletes the custom role | `mongosh` + `atlas` |

Every step is **idempotent** — you can run `./run.sh all` repeatedly without errors.

## Prerequisites

1. **MongoDB Atlas account** with an existing project and a running cluster.
2. **Atlas CLI** installed and authenticated.
   ```bash
   # Install (macOS)
   brew install mongodb-atlas-cli

   # Login
   atlas auth login
   ```
   You need **Organization Owner**, **Project Owner**, or **Project Database Access Admin** access to create custom roles and database users.
3. **mongosh** installed.
   ```bash
   brew install mongosh
   ```
4. **Python 3** — used only for a tiny inline helper that rewrites the connection string for the test user. No packages beyond the standard library are needed.

## Configuration

1. Copy the sample env file:
   ```bash
   cp .env.sample .env
   ```

2. Fill in the **required** values in `.env`:

   ```bash
   # Admin connection string — an admin-level user on your cluster.
   MONGODB_URI_ADMIN="mongodb+srv://admin_user:adminPwd@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority"

   # Atlas project ID (find it in Atlas UI → Project Settings).
   ATLAS_PROJECT_ID="64f1a2b3c4d5e6f7a8b9c0d1"
   ```

3. Optionally override defaults:

   | Variable | Default | Description |
   |----------|---------|-------------|
   | `TEST_DB` | `role_test_db` | Database used for test data |
   | `TEST_ALLOWED_COLLECTION` | `demo_readonly` | Collection the test user **can** read |
   | `TEST_DENIED_COLLECTION` | `other_coll` | Collection the test user **cannot** access |
   | `TEST_ROLE_NAME` | `readDemoCollectionOnly` | Name of the custom role |
   | `TEST_USERNAME` | `test_readonly_user` | Database username for the restricted user |
   | `TEST_PASSWORD` | `testReadOnlyPwd123!` | Password for the restricted user |
   | `ATLAS_PROFILE` | *(default profile)* | Atlas CLI profile name, if you have multiple |

## Usage

```bash
# Make the script executable (first time only)
chmod +x run.sh

# Run individual steps
./run.sh step1      # Seed test data
./run.sh step2      # Create custom DB role
./run.sh step3      # Create database user
./run.sh step4      # Verify permissions

# Run everything end-to-end
./run.sh all

# Tear down all test resources
./run.sh cleanup
```

## What Success Looks Like

When `step4` (or `all`) completes successfully you will see output like this:

```
================================================================
  STEP 4: Verifying permissions as 'test_readonly_user'
================================================================

Building test user connection string ...
  Test URI:            mong****
Running verification script via mongosh ...

--- Test 1: findOne() on role_test_db.demo_readonly (SHOULD SUCCEED) ---
SUCCESS: Retrieved document:
{
  _id: ObjectId('...'),
  item: 'widget-A',
  qty: 10,
  note: 'allowed collection doc 1'
}

--- Test 2: findOne() on role_test_db.other_coll (SHOULD FAIL) ---
Expected failure (read denied): not authorized on role_test_db to execute command ...

--- Test 3: insertOne() on role_test_db.demo_readonly (SHOULD FAIL) ---
Expected failure (write denied): not authorized on role_test_db to execute command ...

================================================================
  RESULTS:  3 passed,  0 failed
================================================================
All tests passed — role is correctly scoped.
```

If any "denied" operation unexpectedly **succeeds**, the output will contain `UNEXPECTED SUCCESS` and the script will exit with a non-zero status.

## How It Works (No REST / No curl)

All Atlas control-plane operations use the **Atlas CLI**:

- **Custom role creation:**
  ```bash
  atlas customDbRoles create readDemoCollectionOnly \
    --projectId <PROJECT_ID> \
    --privilege "FIND@role_test_db.demo_readonly"
  ```

- **Database user creation:**
  ```bash
  atlas dbusers create \
    --username test_readonly_user \
    --password <PASSWORD> \
    --projectId <PROJECT_ID> \
    --role readDemoCollectionOnly
  ```

All data-plane operations use **mongosh** — connecting to the cluster directly.

A small inline **Python 3** snippet (standard library only) rewrites the admin connection string to swap in the test user's credentials for step 4. No external packages are required.

## Troubleshooting

| Symptom | Likely cause |
|---------|-------------|
| `atlas: command not found` | Atlas CLI is not installed or not on your PATH |
| `Error: unauthorized` when running Atlas CLI commands | Your Atlas CLI profile lacks the required access — you need Organization Owner, Project Owner, or Project Database Access Admin |
| Step 4 auth errors on the **allowed** collection | The user/role hasn't propagated yet — wait 10-15 seconds and retry `./run.sh step4` |
| `mongosh: command not found` | mongosh is not installed or not on your PATH |
| `python3: command not found` | Python 3 is required for the URI rewrite helper |

## Project Structure

```
atlas-custom-role-test/
├── run.sh                              # Main harness script
├── scripts/
│   └── verify_as_test_user.mongo.js    # mongosh verification script
├── .env.sample                         # Template for environment variables
├── CLAUDE.md                           # Claude Code project guidance
└── README.md                           # This file
```
