import test from "node:test";
import assert from "node:assert/strict";

import {
  mapRetellCallStatus,
  validateTransferDestination,
} from "../lib/server/calls/policy.ts";
import {
  getRetellWebhookCallUpdate,
  parseRetellWebhookPayload,
  synchronizeRetellCallEvent,
  type RetellWebhookCallRecord,
  type RetellWebhookPersistence,
} from "../lib/server/calls/retell-webhook.ts";

function createMockPersistence(callRecord?: RetellWebhookCallRecord) {
  const storedCall: RetellWebhookCallRecord = callRecord ?? {
    id: "local-call-123",
    status: "in_progress",
    agentId: "local-agent-1",
    externalCallId: "retell-call-transfer-1",
  };

  const calls = new Map<string, RetellWebhookCallRecord>([[storedCall.id, { ...storedCall }]]);
  const createdEvents: Array<{ callId: string; eventType: string; payload: any }> = [];
  let updatedRecord: any = null;

  const persistence: RetellWebhookPersistence = {
    findByExternalCallId: async (callId) => {
      const found = [...calls.values()].find((c) => c.externalCallId === callId);
      return found ? { ...found } : null;
    },
    findUniqueLinkedAgentId: async () => "local-agent-1",
    findApplicationCall: async () => null,
    createEvent: async (input) => {
      createdEvents.push(input);
      return true;
    },
    recordUnassociatedEvent: async () => true,
    updateCall: async (callId, currentStatus, payload) => {
      const update = getRetellWebhookCallUpdate(currentStatus, payload);
      const existing = calls.get(callId);
      if (existing) {
        Object.assign(existing, update);
        updatedRecord = { ...existing, ...update };
      }
    },
  };

  return {
    persistence,
    calls,
    createdEvents,
    get updatedRecord() {
      return updatedRecord;
    },
  };
}

// 1. Destination validation tests
test("validateTransferDestination: validates Indian (+91) and US (+1) E.164 phone numbers", () => {
  const indianResult = validateTransferDestination("+919876543210");
  assert.equal(indianResult.valid, true);
  assert.equal(indianResult.formattedNumber, "+919876543210");
  assert.equal(indianResult.country, "IN");

  const usResult = validateTransferDestination("+14155552671");
  assert.equal(usResult.valid, true);
  assert.equal(usResult.formattedNumber, "+14155552671");
  assert.equal(usResult.country, "US");

  // Formatted with spaces / hyphens
  const formattedIndian = validateTransferDestination("+91 98765-43210");
  assert.equal(formattedIndian.valid, true);
  assert.equal(formattedIndian.formattedNumber, "+919876543210");

  // SIP URI
  const sipResult = validateTransferDestination("sip:support@sip.example.com");
  assert.equal(sipResult.valid, true);
  assert.equal(sipResult.formattedNumber, "sip:support@sip.example.com");
});

test("validateTransferDestination: rejects invalid destination formats and disallowed countries", () => {
  // Missing country code (e.g. 10-digit local number)
  const missingCode = validateTransferDestination("9876543210");
  assert.equal(missingCode.valid, false);
  assert.match(missingCode.error ?? "", /E\.164/i);

  // Empty string
  const emptyDest = validateTransferDestination("");
  assert.equal(emptyDest.valid, false);
  assert.match(emptyDest.error ?? "", /required/i);

  // Disallowed country (UK +44 when only US, IN allowed)
  const ukDest = validateTransferDestination("+442079460000", ["US", "IN"]);
  assert.equal(ukDest.valid, false);
  assert.match(ukDest.error ?? "", /not allowed by policy/i);
});

// 2. Lifecycle status mapping tests
test("mapRetellCallStatus: maps transfer events accurately", () => {
  assert.equal(mapRetellCallStatus("transfer_started", "ongoing"), "in_progress");
  assert.equal(mapRetellCallStatus("transfer_bridged", "ongoing"), "in_progress");
  assert.equal(mapRetellCallStatus("transfer_cancelled", "ongoing"), "in_progress");

  // Successful transfer completion
  assert.equal(mapRetellCallStatus("call_ended", "ended", "call_transfer"), "completed");

  // Failed transfers
  assert.equal(mapRetellCallStatus("call_ended", "ended", "transfer_failed"), "failed");
  assert.equal(mapRetellCallStatus("call_ended", "ended", "provider_error"), "failed");

  // Provider ongoing statuses
  assert.equal(mapRetellCallStatus("poll", "transferring"), "in_progress");
  assert.equal(mapRetellCallStatus("poll", "bridged"), "in_progress");
});

// 3. Webhook synchronization for successful transfer
test("synchronizeRetellCallEvent: successfully processes transfer_started and transfer_bridged", async () => {
  const mock = createMockPersistence();

  const startPayload = parseRetellWebhookPayload(
    JSON.stringify({
      event: "transfer_started",
      call: {
        call_id: "retell-call-transfer-1",
        agent_id: "retell-agent-1",
        call_status: "ongoing",
        direction: "inbound",
        from_number: "+919876543210",
        transfer_destination: "+919123456789",
        start_timestamp: 1_800_000_000_000,
      },
    }),
  );
  assert.ok(startPayload);

  const startResult = await synchronizeRetellCallEvent(
    startPayload,
    JSON.stringify(startPayload),
    mock.persistence,
  );
  assert.equal(startResult, "updated");
  assert.equal(mock.createdEvents.length, 1);
  assert.equal(mock.createdEvents[0].eventType, "transfer_started");
  assert.equal(mock.createdEvents[0].payload.transferDestination, "+919123456789");

  const bridgedPayload = parseRetellWebhookPayload(
    JSON.stringify({
      event: "transfer_bridged",
      call: {
        call_id: "retell-call-transfer-1",
        agent_id: "retell-agent-1",
        call_status: "ongoing",
        transfer_destination: "+919123456789",
        start_timestamp: 1_800_000_000_000,
      },
    }),
  );
  assert.ok(bridgedPayload);

  const bridgeResult = await synchronizeRetellCallEvent(
    bridgedPayload,
    JSON.stringify(bridgedPayload),
    mock.persistence,
  );
  assert.equal(bridgeResult, "updated");
  assert.equal(mock.createdEvents.length, 2);
  assert.equal(mock.createdEvents[1].eventType, "transfer_bridged");
});

// 4. Webhook synchronization for completed call transfer
test("synchronizeRetellCallEvent: marks call completed with transfer outcome upon call_transfer disconnection", async () => {
  const mock = createMockPersistence();

  const transferEndedPayload = parseRetellWebhookPayload(
    JSON.stringify({
      event: "call_ended",
      call: {
        call_id: "retell-call-transfer-1",
        agent_id: "retell-agent-1",
        call_status: "ended",
        disconnection_reason: "call_transfer",
        transfer_destination: "+919123456789",
        start_timestamp: 1_800_000_000_000,
        end_timestamp: 1_800_000_090_000,
        duration_ms: 90_000,
      },
    }),
  );
  assert.ok(transferEndedPayload);

  await synchronizeRetellCallEvent(
    transferEndedPayload,
    JSON.stringify(transferEndedPayload),
    mock.persistence,
  );

  const updated = mock.updatedRecord;
  assert.equal(updated.status, "completed");
  assert.equal(updated.durationSeconds, 90);
  assert.match(updated.outcome ?? "", /\+919123456789/);
});

// 5. Webhook synchronization for failed transfer
test("synchronizeRetellCallEvent: marks call failed when transfer_failed disconnection reason is received", async () => {
  const mock = createMockPersistence();

  const transferFailedPayload = parseRetellWebhookPayload(
    JSON.stringify({
      event: "call_ended",
      call: {
        call_id: "retell-call-transfer-1",
        agent_id: "retell-agent-1",
        call_status: "ended",
        disconnection_reason: "transfer_failed",
        transfer_destination: "+919123456789",
        start_timestamp: 1_800_000_000_000,
        end_timestamp: 1_800_000_015_000,
        duration_ms: 15_000,
      },
    }),
  );
  assert.ok(transferFailedPayload);

  await synchronizeRetellCallEvent(
    transferFailedPayload,
    JSON.stringify(transferFailedPayload),
    mock.persistence,
  );

  const updated = mock.updatedRecord;
  assert.equal(updated.status, "failed");
  assert.equal(updated.failureCode, "transfer_failed");
  assert.match(updated.failureMessage ?? "", /transfer failed/i);
});

// 6. Provider error during transfer
test("synchronizeRetellCallEvent: handles provider_error during call transfer", async () => {
  const mock = createMockPersistence();

  const providerErrorPayload = parseRetellWebhookPayload(
    JSON.stringify({
      event: "call_ended",
      call: {
        call_id: "retell-call-transfer-1",
        agent_id: "retell-agent-1",
        call_status: "error",
        disconnection_reason: "provider_error",
        transfer_destination: "+919123456789",
        start_timestamp: 1_800_000_000_000,
        end_timestamp: 1_800_000_005_000,
      },
    }),
  );
  assert.ok(providerErrorPayload);

  await synchronizeRetellCallEvent(
    providerErrorPayload,
    JSON.stringify(providerErrorPayload),
    mock.persistence,
  );

  const updated = mock.updatedRecord;
  assert.equal(updated.status, "failed");
  assert.equal(updated.failureCode, "provider_error");
});

