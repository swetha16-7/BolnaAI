import test from "node:test";
import assert from "node:assert/strict";

import {
  reconcilePendingRetellEvents,
  RetellReconciliationInvalidResponseError,
  type RetellAgentOwnership,
  type RetellReconciliationCallRecord,
  type RetellReconciliationEntry,
  type RetellReconciliationPersistence,
} from "../lib/server/calls/retell-reconciliation.ts";
import { redactSensitiveData } from "../lib/server/safe-logging.ts";
import {
  getRetellWebhookCallUpdate,
  type RetellWebhookCall,
} from "../lib/server/calls/retell-webhook.ts";

const NOW = new Date("2026-10-15T06:30:00.000Z");

const providerCall: RetellWebhookCall = {
  call_id: "retell-call-1",
  agent_id: "retell-agent-1",
  call_type: "phone_call" as const,
  call_status: "ended",
  direction: "inbound" as const,
  from_number: "+14155552671",
  to_number: "+14155550100",
  start_timestamp: 1_800_000_000_000,
  end_timestamp: 1_800_000_065_000,
  duration_ms: 65_000,
  transcript: "Agent: Hello.\nCustomer: Hi.",
  call_analysis: { call_summary: "Customer requested support." },
  recording_url: "https://recordings.example.test/call-1",
  metadata: { applicationCallId: "local-call-1" },
};

const linkedOwnership: RetellAgentOwnership = {
  agentId: "local-agent-1",
  organizationId: "org-a",
};

const localCall: RetellReconciliationCallRecord = {
  id: "local-call-1",
  status: "initiated",
  agentId: linkedOwnership.agentId,
  externalCallId: null,
  organizationId: linkedOwnership.organizationId,
};

function createFakePersistence(options: {
  callRecord?: RetellReconciliationCallRecord | null;
  ownership?: RetellAgentOwnership | null;
  retrieveCall?: () => Promise<RetellWebhookCall>;
  organizationId?: string | null;
} = {}) {
  const entry: RetellReconciliationEntry = {
    id: "retell-webhook-entry-1",
    organizationId: options.organizationId === undefined ? "org-a" : options.organizationId,
    details: {
      provider: "retell",
      eventType: "call_ended",
      externalEventId: "call_ended:retell-call-1",
      externalCallId: "retell-call-1",
      retellAgentId: "retell-agent-1",
    },
    claimAction: "",
  };
  let action = "pending_reconciliation";
  let callRecord = options.callRecord === undefined ? { ...localCall } : options.callRecord;
  let commitCount = 0;
  let retrieveCount = 0;
  let failureCategory: string | null = null;
  const events = new Set<string>();

  const persistence: RetellReconciliationPersistence = {
    claimPending: async ({ claimAction }) => {
      if (action !== "pending_reconciliation") return [];
      action = claimAction;
      return [{ ...entry, claimAction }];
    },
    findUniqueAgentOwnership: async () => options.ownership === undefined
      ? linkedOwnership
      : options.ownership,
    findByExternalCallId: async (callId) =>
      callRecord?.externalCallId === callId ? callRecord : null,
    findApplicationCall: async (applicationCallId, callId, ownership) => {
      if (
        !callRecord ||
        applicationCallId !== callRecord.id ||
        ownership.agentId !== callRecord.agentId ||
        ownership.organizationId !== callRecord.organizationId ||
        (callRecord.externalCallId !== null && callRecord.externalCallId !== callId)
      ) {
        return null;
      }
      return callRecord;
    },
    retrieveCall: async () => {
      retrieveCount += 1;
      if (options.retrieveCall) return options.retrieveCall();
      return providerCall;
    },
    commit: async ({ entry: claimedEntry, externalEventId, payload, ownership }) => {
      if (action !== claimedEntry.claimAction) return "stale";
      if (!callRecord || callRecord.organizationId !== ownership.organizationId) {
        return "identity_mismatch";
      }
      if (events.has(externalEventId)) {
        action = "reconciled";
        return "duplicate";
      }
      events.add(externalEventId);
      const update = getRetellWebhookCallUpdate(callRecord.status, payload);
      callRecord = {
        ...callRecord,
        ...update,
        status: update.status ?? callRecord.status,
        externalCallId: payload.call.call_id,
      };
      action = "reconciled";
      commitCount += 1;
      return "reconciled";
    },
    defer: async (claimedEntry, category) => {
      if (action === claimedEntry.claimAction) {
        action = "pending_reconciliation";
        failureCategory = category;
      }
    },
  };

  return {
    persistence,
    get action() { return action; },
    get callRecord() { return callRecord; },
    get commitCount() { return commitCount; },
    get retrieveCount() { return retrieveCount; },
    get failureCategory() { return failureCategory; },
    events,
  };
}

test("reconciliation updates only an existing linked call and marks its queue entry done", async () => {
  const fake = createFakePersistence();
  const result = await reconcilePendingRetellEvents(fake.persistence, { now: NOW });

  assert.deepEqual(result, { claimed: 1, reconciled: 1, duplicates: 0, deferred: 0 });
  assert.equal(fake.action, "reconciled");
  assert.equal(fake.commitCount, 1);
  assert.equal(fake.callRecord?.status, "completed");
  assert.equal(fake.callRecord?.externalCallId, "retell-call-1");
  assert.equal(fake.callRecord?.transcript, providerCall.transcript);
  assert.equal(fake.callRecord?.outcome, "Customer requested support.");
  assert.equal(fake.events.size, 1);
});

test("reconciliation retry is idempotent and does not update the call twice", async () => {
  const fake = createFakePersistence();
  const first = await reconcilePendingRetellEvents(fake.persistence, { now: NOW });
  const retry = await reconcilePendingRetellEvents(fake.persistence, { now: NOW });

  assert.equal(first.reconciled, 1);
  assert.deepEqual(retry, { claimed: 0, reconciled: 0, duplicates: 0, deferred: 0 });
  assert.equal(fake.commitCount, 1);
  assert.equal(fake.events.size, 1);
});

test("ambiguous agent ownership keeps the entry pending and does not update a call", async () => {
  const fake = createFakePersistence({ ownership: null });
  const result = await reconcilePendingRetellEvents(fake.persistence, { now: NOW });

  assert.equal(result.deferred, 1);
  assert.equal(fake.action, "pending_reconciliation");
  assert.equal(fake.failureCategory, "ambiguous_agent_ownership");
  assert.equal(fake.commitCount, 0);
});

test("missing local calls remain pending and are never created", async () => {
  const fake = createFakePersistence({ callRecord: null });
  const result = await reconcilePendingRetellEvents(fake.persistence, { now: NOW });

  assert.equal(result.deferred, 1);
  assert.equal(fake.failureCategory, "local_call_not_found");
  assert.equal(fake.callRecord, null);
  assert.equal(fake.commitCount, 0);
});

test("provider failures preserve the queue entry for retry", async () => {
  const fake = createFakePersistence({
    retrieveCall: async () => {
      throw new Error("provider failure");
    },
  });
  const result = await reconcilePendingRetellEvents(fake.persistence, { now: NOW });

  assert.equal(result.deferred, 1);
  assert.equal(fake.failureCategory, "provider_unavailable");
  assert.equal(fake.action, "pending_reconciliation");
  assert.equal(fake.commitCount, 0);
});

test("invalid provider call data stays pending for later retry", async () => {
  const fake = createFakePersistence({
    retrieveCall: async () => {
      throw new RetellReconciliationInvalidResponseError();
    },
  });
  const result = await reconcilePendingRetellEvents(fake.persistence, { now: NOW });

  assert.equal(result.deferred, 1);
  assert.equal(fake.failureCategory, "invalid_provider_response");
  assert.equal(fake.action, "pending_reconciliation");
  assert.equal(fake.commitCount, 0);
});

test("organization mismatch prevents cross-tenant call updates", async () => {
  const fake = createFakePersistence({ organizationId: "org-b" });
  const result = await reconcilePendingRetellEvents(fake.persistence, { now: NOW });

  assert.equal(result.deferred, 1);
  assert.equal(fake.failureCategory, "organization_mismatch");
  assert.equal(fake.callRecord?.status, "initiated");
  assert.equal(fake.commitCount, 0);
});

test("concurrent reconciliation attempts claim a pending entry only once", async () => {
  const fake = createFakePersistence({
    retrieveCall: async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return providerCall;
    },
  });

  const [first, second] = await Promise.all([
    reconcilePendingRetellEvents(fake.persistence, { now: NOW }),
    reconcilePendingRetellEvents(fake.persistence, { now: NOW }),
  ]);

  assert.equal(first.claimed + second.claimed, 1);
  assert.equal(first.reconciled + second.reconciled, 1);
  assert.equal(fake.commitCount, 1);
  assert.equal(fake.retrieveCount, 1);
});

test("terminal local statuses are preserved when reconciliation sees stale provider status", async () => {
  const fake = createFakePersistence({
    callRecord: { ...localCall, status: "completed", externalCallId: "retell-call-1" },
    retrieveCall: async () => ({
      ...providerCall,
      call_status: "ongoing",
      transcript: undefined,
      call_analysis: undefined,
    }),
  });
  const result = await reconcilePendingRetellEvents(fake.persistence, { now: NOW });

  assert.equal(result.reconciled, 1);
  assert.equal(fake.callRecord?.status, "completed");
});

test("redactSensitiveData removes provider secrets and caller details from log payloads", () => {
  const redacted = redactSensitiveData({
    DB_URL: "postgresql://user:secret@host:5432/db",
    CRON_SECRET: "cron-secret",
    RETELL_API_KEY: "retell-key",
    transcript: "Agent: Hello +14155552671",
    nested: {
      authorization: "Bearer abc123",
      from_number: "+14155552671",
      call_summary: "Customer reported help.",
    },
  });

  const rendered = JSON.stringify(redacted);
  assert.equal(rendered.includes("cron-secret"), false);
  assert.equal(rendered.includes("retell-key"), false);
  assert.equal(rendered.includes("abc123"), false);
  assert.equal(rendered.includes("14155552671"), false);
  assert.equal(rendered.includes("Customer reported help."), false);
  assert.equal(rendered.includes("[REDACTED]"), true);
});
