import test from "node:test";
import assert from "node:assert/strict";

import {
  ACTIVE_CALL_STATUSES,
  isActiveCallStatus,
  isTerminalCallStatus,
  mapRetellCallStatus,
} from "../lib/server/calls/policy.ts";
import {
  synchronizeActiveRetellCalls,
  clearCallSyncCooldown,
  type SynchronizedCallSummary,
} from "../lib/server/calls/retell-sync.ts";
import { prisma } from "../lib/server/db.ts";

test("isActiveCallStatus correctly distinguishes active and terminal states", () => {
  for (const status of ACTIVE_CALL_STATUSES) {
    assert.equal(isActiveCallStatus(status), true, `${status} should be active`);
    assert.equal(isTerminalCallStatus(status), false, `${status} should not be terminal`);
  }

  const terminal = ["completed", "failed", "canceled"];
  for (const status of terminal) {
    assert.equal(isTerminalCallStatus(status), true, `${status} should be terminal`);
    assert.equal(isActiveCallStatus(status), false, `${status} should not be active`);
  }
});

test("mapRetellCallStatus maps poll events accurately", () => {
  assert.equal(mapRetellCallStatus("poll", "ongoing"), "in_progress");
  assert.equal(mapRetellCallStatus("poll", "registered"), "initiated");
  assert.equal(mapRetellCallStatus("poll", "ended", "user_hangup"), "completed");
  assert.equal(mapRetellCallStatus("poll", "ended", "agent_hangup"), "completed");
  assert.equal(mapRetellCallStatus("poll", "ended", "dial_failed"), "failed");
  assert.equal(mapRetellCallStatus("poll", "ended", "dial_no_answer"), "failed");
  assert.equal(mapRetellCallStatus("poll", "ended", "dial_busy"), "failed");
  assert.equal(mapRetellCallStatus("poll", "error"), "failed");
  assert.equal(mapRetellCallStatus("poll", "not_connected"), "failed");
});

test("synchronizeActiveRetellCalls handles empty active calls gracefully", async () => {
  clearCallSyncCooldown();
  // Using an organization ID that has no active calls
  const results = await synchronizeActiveRetellCalls("org-non-existent-9999", "dummy-key");
  assert.deepEqual(results, []);
});

test("synchronizeActiveRetellCalls handles missing API key gracefully", async () => {
  clearCallSyncCooldown();
  const results = await synchronizeActiveRetellCalls("org-any", "");
  assert.deepEqual(results, []);
});

test("synchronizeActiveRetellCalls updates active call to completed when provider reports ended", async () => {
  clearCallSyncCooldown();

  // Create a mock active call in database
  const testOrg = await prisma.organization.findFirst({ select: { id: true } });
  if (!testOrg) return;

  const mockLocalCall = await prisma.call.create({
    data: {
      organizationId: testOrg.id,
      provider: "retell",
      externalCallId: "retell-test-call-ended-1",
      status: "initiated",
      direction: "outbound",
      callerNumber: "+14155550199",
      destination: "+14155550299",
    },
  });

  try {
    const mockClient = {
      call: {
        retrieve: async (_callId: string) => ({
          call_status: "ended",
          disconnection_reason: "user_hangup",
          start_timestamp: 1_800_000_000_000,
          end_timestamp: 1_800_000_035_000,
          duration_ms: 35_000,
          transcript: "Agent: Hello\nUser: Goodbye",
        }),
      },
    };

    const summaries = await synchronizeActiveRetellCalls(testOrg.id, "dummy-key", {
      client: mockClient,
      now: () => new Date("2026-10-15T12:00:00.000Z"),
    });

    const updated = summaries.find((s) => s.id === mockLocalCall.id);
    assert.ok(updated, "Summary should include the updated call");
    assert.equal(updated.newStatus, "completed");
    assert.equal(updated.isTerminal, true);

    const callInDb = await prisma.call.findUnique({ where: { id: mockLocalCall.id } });
    assert.equal(callInDb?.status, "completed");
    assert.equal(callInDb?.durationSeconds, 35);
    assert.equal(callInDb?.transcript, "Agent: Hello\nUser: Goodbye");
    assert.ok(callInDb?.startedAt);
    assert.ok(callInDb?.endedAt);
  } finally {
    await prisma.call.delete({ where: { id: mockLocalCall.id } }).catch(() => {});
  }
});

test("synchronizeActiveRetellCalls handles provider failure gracefully without crashing", async () => {
  clearCallSyncCooldown();

  const testOrg = await prisma.organization.findFirst({ select: { id: true } });
  if (!testOrg) return;

  const mockLocalCall = await prisma.call.create({
    data: {
      organizationId: testOrg.id,
      provider: "retell",
      externalCallId: "retell-test-call-fail-1",
      status: "initiated",
      direction: "outbound",
    },
  });

  try {
    const mockFailingClient = {
      call: {
        retrieve: async () => {
          throw new Error("Retell API network timeout (simulated)");
        },
      },
    };

    const summaries = await synchronizeActiveRetellCalls(testOrg.id, "dummy-key", {
      client: mockFailingClient,
    });

    // Should not crash and should not alter the call record
    assert.equal(summaries.length, 0);
    const callInDb = await prisma.call.findUnique({ where: { id: mockLocalCall.id } });
    assert.equal(callInDb?.status, "initiated");
  } finally {
    await prisma.call.delete({ where: { id: mockLocalCall.id } }).catch(() => {});
  }
});

test("synchronizeActiveRetellCalls isolates by organization", async () => {
  clearCallSyncCooldown();

  const testOrg = await prisma.organization.findFirst({ select: { id: true } });
  if (!testOrg) return;

  const otherOrg = await prisma.organization.create({
    data: {
      name: "Other Org",
      slug: `other-org-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    },
  });
  const isolatedCall = await prisma.call.create({
    data: {
      organizationId: otherOrg.id,
      provider: "retell",
      externalCallId: "retell-test-isolated-1",
      status: "initiated",
      direction: "outbound",
    },
  });

    try {
      let clientCalled = false;
      const mockClient = {
        call: {
          retrieve: async () => {
            clientCalled = true;
            return { call_status: "ended", disconnection_reason: "user_hangup" };
          },
        },
      };

      // Synchronize for testOrg: otherOrg's call must NOT be touched or fetched
      const summaries = await synchronizeActiveRetellCalls(testOrg.id, "dummy-key", {
        client: mockClient,
      });

      assert.equal(summaries.some((s) => s.id === isolatedCall.id), false);
      const unchanged = await prisma.call.findUnique({ where: { id: isolatedCall.id } });
      assert.equal(unchanged?.status, "initiated");
    } finally {
      await prisma.call.delete({ where: { id: isolatedCall.id } }).catch(() => {});
      await prisma.organization.delete({ where: { id: otherOrg.id } }).catch(() => {});
    }
});
