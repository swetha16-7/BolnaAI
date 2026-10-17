import test from "node:test";
import assert from "node:assert/strict";

import { handleRetellReconciliationRequest } from "../lib/server/calls/retell-reconciliation-endpoint.ts";

test("dry-run does not invoke database or Retell reconciliation work", async () => {
  let databaseWrites = 0;
  let retellApiRequests = 0;

  const response = await handleRetellReconciliationRequest(
    new Request("https://admin.example.test/api/cron/retell-reconciliation?dryRun=true"),
    async () => {
      databaseWrites += 1;
      retellApiRequests += 1;
      return Response.json({ mode: "reconciled" });
    },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(body, {
    mode: "dry-run",
    dryRun: true,
    claimed: 0,
    reconciled: 0,
    duplicates: 0,
    deferred: 0,
    message:
      "Dry-run mode: no pending entries were inspected or changed, and no Retell API requests were made.",
  });
  assert.equal(databaseWrites, 0);
  assert.equal(retellApiRequests, 0);
});

test("normal reconciliation requests still run the reconciliation callback", async () => {
  let reconciliationRuns = 0;
  const expected = Response.json({ claimed: 1, reconciled: 1 });

  const response = await handleRetellReconciliationRequest(
    new Request("https://admin.example.test/api/cron/retell-reconciliation"),
    async () => {
      reconciliationRuns += 1;
      return expected;
    },
  );

  assert.equal(response, expected);
  assert.equal(reconciliationRuns, 1);
});
