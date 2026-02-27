// verify_as_test_user.mongo.js
//
// Runs as the restricted test user. Verifies:
//   1. Read from the allowed collection succeeds.
//   2. Read from the denied collection fails (auth error).
//   3. Write to the allowed collection fails (auth error).
//
// Expects environment variables (with defaults):
//   TEST_DB                   = "role_test_db"
//   TEST_ALLOWED_COLLECTION   = "demo_readonly"
//   TEST_DENIED_COLLECTION    = "other_coll"

const dbName     = process.env.TEST_DB                 || "role_test_db";
const allowedCol = process.env.TEST_ALLOWED_COLLECTION || "demo_readonly";
const deniedCol  = process.env.TEST_DENIED_COLLECTION  || "other_coll";

const testDb = db.getSiblingDB(dbName);

let passed = 0;
let failed = 0;

// ── Test 1: Read from allowed collection (should succeed) ──────────────────

print("");
print("--- Test 1: findOne() on " + dbName + "." + allowedCol + " (SHOULD SUCCEED) ---");
try {
  const doc = testDb.getCollection(allowedCol).findOne();
  if (doc) {
    print("SUCCESS: Retrieved document:");
    printjson(doc);
    passed++;
  } else {
    print("UNEXPECTED: findOne() returned null — collection may be empty.");
    failed++;
  }
} catch (e) {
  print("UNEXPECTED FAILURE: " + e.message);
  failed++;
}

// ── Test 2: Read from denied collection (should fail) ──────────────────────

print("");
print("--- Test 2: findOne() on " + dbName + "." + deniedCol + " (SHOULD FAIL) ---");
try {
  const doc = testDb.getCollection(deniedCol).findOne();
  print("UNEXPECTED SUCCESS: Was able to read from denied collection!");
  printjson(doc);
  failed++;
} catch (e) {
  print("Expected failure (read denied): " + e.message);
  passed++;
}

// ── Test 3: Write to allowed collection (should fail — role is read-only) ──

print("");
print("--- Test 3: insertOne() on " + dbName + "." + allowedCol + " (SHOULD FAIL) ---");
try {
  testDb.getCollection(allowedCol).insertOne({ item: "rogue-insert", qty: 0 });
  print("UNEXPECTED SUCCESS: Was able to write to the allowed collection!");
  failed++;
} catch (e) {
  print("Expected failure (write denied): " + e.message);
  passed++;
}

// ── Summary ────────────────────────────────────────────────────────────────

print("");
print("================================================================");
print("  RESULTS:  " + passed + " passed,  " + failed + " failed");
print("================================================================");

if (failed > 0) {
  print("WARNING: Some tests did not behave as expected. Review output above.");
  quit(1);
} else {
  print("All tests passed — role is correctly scoped.");
}
