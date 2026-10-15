import test from "node:test";
import assert from "node:assert/strict";

import Retell from "retell-sdk";
import {
  getRetellWebhookCallUpdate,
  handleRetellWebhookRequest,
  parseRetellWebhookPayload,
  synchronizeRetellCallEvent,
  type RetellWebhookCallRecord,
  type RetellWebhookPayload,
  type RetellWebhookPersistence,
} from "../lib/server/calls/retell-webhook.ts";

const API_KEY = "test-retell-webhook-key";

function makePayload(overrides: Record<string, unknown> = {}) {
  return {
    event: "call_ended",
    call: {
      call_id: "retell-call-1",
      agent_id: "retell-agent-1",
      metadata: { applicationCallId: "local-call-1" },
      call_type: "phone_call",
      call_status: "ended",
      direction: "outbound",
      from_number: "+14155552671",
      to_number: "+14155550100",
      start_timestamp: 1_800_000_000_000,
      end_timestamp: 1_800_000_065_000,
      duration_ms: 65_000,
      transcript: "Agent: Hello.\nCustomer: Hi.",
      call_analysis: { call_summary: "Customer requested help." },
      recording_url: "https://recordings.example.test/call-1",
      ...overrides,
    },
  };
}

function createFakePersistence(input?: {
  call?: RetellWebhookCallRecord & { organizationId: string; transcript?: string | null };
  linkedAgents?: Record<string, { agentId: string; organizationId: string } | null>;
  applicationCalls?: Record<string, RetellWebhookCallRecord & { organizationId: string }>;
}) {
  const call = input?.call ?? {
    id: "local-call-1",
    status: "initiated",
    agentId: "local-agent-1",
    externalCallId: null,
    organizationId: "org-a",
    transcript: null,
  };
  const calls = new Map<string, typeof call>([[call.id, call]]);
  for (const applicationCall of Object.values(input?.applicationCalls ?? {})) {
    calls.set(applicationCall.id, applicationCall as typeof call);
  }
  const events = new Set<string>();
  const eventPayloads: unknown[] = [];
  const reconciliationEvents: Array<{
    eventType: string;
    externalEventId: string;
    externalCallId: string;
    retellAgentId: string | null;
    organizationId: string | null;
  }> = [];
  let updateCount = 0;
  let lastUpdate: Record<string, unknown> | null = null;
  const persistence: RetellWebhookPersistence = {
    findByExternalCallId: async (callId) => {
      const found = [...calls.values()].find(
        (record) => record.externalCallId === callId,
      );
      return found ?? null;
    },
    findUniqueLinkedAgentId: async (retellAgentId) => {
      const linkedAgent = input?.linkedAgents
        ? input.linkedAgents[retellAgentId] ?? null
        : { agentId: "local-agent-1", organizationId: "org-a" };
      return linkedAgent?.agentId ?? null;
    },
    findApplicationCall: async (applicationCallId, callId, localAgentId) => {
      const found = calls.get(applicationCallId);
      if (
        !found ||
        found.organizationId !== "org-a" ||
        found.agentId !== localAgentId ||
        (found.externalCallId !== null && found.externalCallId !== callId)
      ) {
        return null;
      }
      return found;
    },
    createEvent: async (event) => {
      if (events.has(event.externalEventId)) return false;
      events.add(event.externalEventId);
      eventPayloads.push(event.payload);
      return true;
    },
    recordUnassociatedEvent: async (event) => {
      if (events.has(event.externalEventId)) return false;
      events.add(event.externalEventId);
      const linkedAgent = event.retellAgentId
        ? input?.linkedAgents
          ? input.linkedAgents[event.retellAgentId] ?? null
          : { agentId: "local-agent-1", organizationId: "org-a" }
        : null;
      reconciliationEvents.push({
        ...event,
        organizationId: linkedAgent?.organizationId ?? null,
      });
      return true;
    },
    updateCall: async (callId, currentStatus, payload) => {
      const record = calls.get(callId);
      assert.ok(record);
      const update = getRetellWebhookCallUpdate(currentStatus, payload);
      Object.assign(record, update, { externalCallId: payload.call.call_id });
      updateCount += 1;
      lastUpdate = update;
    },
  };
  return {
    persistence,
    calls,
    events,
    eventPayloads,
    reconciliationEvents,
    get updateCount() { return updateCount; },
    get lastUpdate() { return lastUpdate; },
  };
}

async function signedRequest(body: string, signature?: string) {
  return new Request("https://app.example.test/api/webhooks/retell", {
    method: "POST",
    headers: {
      ...(signature ? { "x-retell-signature": signature } : {}),
    },
    body,
  });
}

async function postWithOfficialSignature(
  rawBody: string,
  persist: (payload: RetellWebhookPayload, rawBody: string) => Promise<"updated" | "queued" | "duplicate">,
) {
  const signature = await Retell.sign(rawBody, API_KEY);
  return handleRetellWebhookRequest(
    await signedRequest(rawBody, signature),
    {
      apiKey: API_KEY,
      verifySignature: async (body, key, providedSignature) =>
        Retell.verify(body, key, providedSignature),
      persist,
    },
  );
}

test("Retell webhook validates the official signature against the exact raw body", async () => {
  const rawBody = JSON.stringify(makePayload());
  let receivedRawBody = "";
  const signature = await Retell.sign(rawBody, API_KEY);
  const response = await handleRetellWebhookRequest(
    await signedRequest(rawBody, signature),
    {
      apiKey: API_KEY,
      verifySignature: async (body, key, providedSignature) => {
        receivedRawBody = body;
        return Retell.verify(body, key, providedSignature);
      },
      persist: async () => "updated",
    },
  );
  assert.equal(response.status, 204);
  assert.equal(receivedRawBody, rawBody);

  const invalidSignatureResponse = await handleRetellWebhookRequest(
    await signedRequest(rawBody, `${signature}invalid`),
    {
      apiKey: API_KEY,
      verifySignature: (body, key, providedSignature) =>
        Retell.verify(body, key, providedSignature),
      persist: async () => "updated",
    },
  );
  assert.equal(invalidSignatureResponse.status, 401);
});

test("Retell webhook safely rejects missing signatures and malformed event payloads", async () => {
  let persisted = false;
  const dependencies = {
    apiKey: API_KEY,
    verifySignature: async () => true,
    persist: async () => {
      persisted = true;
      return "updated" as const;
    },
  };
  const missingSignature = await handleRetellWebhookRequest(
    await signedRequest(JSON.stringify(makePayload())),
    dependencies,
  );
  assert.equal(missingSignature.status, 401);

  const malformedJson = await handleRetellWebhookRequest(
    await signedRequest("{broken", "present"),
    dependencies,
  );
  assert.equal(malformedJson.status, 400);
  assert.equal(persisted, false);

  const malformedPayload = await postWithOfficialSignature(
    JSON.stringify({ event: "call_ended", call: { call_id: "../bad" } }),
    async () => {
      persisted = true;
      return "updated";
    },
  );
  assert.equal(malformedPayload.status, 400);
  assert.equal(persisted, false);
});

test("Retell call event updates lifecycle and recording fields without storing sensitive payloads", async () => {
  const fake = createFakePersistence();
  const body = JSON.stringify(makePayload());
  const response = await postWithOfficialSignature(body, (payload, rawBody) =>
    synchronizeRetellCallEvent(payload, rawBody, fake.persistence),
  );
  assert.equal(response.status, 204);
  const stored = fake.calls.get("local-call-1");
  assert.equal(stored?.status, "completed");
  assert.equal(stored?.externalCallId, "retell-call-1");
  assert.equal(fake.lastUpdate?.direction, "outbound");
  assert.equal(fake.lastUpdate?.callerNumber, "+14155552671");
  assert.equal(fake.lastUpdate?.destination, "+14155550100");
  assert.equal(fake.lastUpdate?.durationSeconds, 65);
  assert.equal(fake.lastUpdate?.transcript, "Agent: Hello.\nCustomer: Hi.");
  assert.equal(fake.lastUpdate?.outcome, "Customer requested help.");
  assert.equal(fake.lastUpdate?.recordingUrl, "https://recordings.example.test/call-1");
  assert.equal(JSON.stringify(fake.eventPayloads).includes("Customer requested help."), false);
  assert.equal(JSON.stringify(fake.eventPayloads).includes("Agent: Hello."), false);
});

test("duplicate Retell events are idempotent and do not apply the update twice", async () => {
  const fake = createFakePersistence();
  const payload = parseRetellWebhookPayload(JSON.stringify(makePayload()));
  assert.ok(payload);
  const rawBody = JSON.stringify(makePayload());

  assert.equal(
    await synchronizeRetellCallEvent(payload, rawBody, fake.persistence),
    "updated",
  );
  assert.equal(
    await synchronizeRetellCallEvent(payload, rawBody, fake.persistence),
    "duplicate",
  );
  assert.equal(fake.events.size, 1);
  assert.equal(fake.updateCount, 1);
});

test("out-of-order Retell lifecycle events cannot regress a terminal call status", async () => {
  const fake = createFakePersistence();
  const ended = parseRetellWebhookPayload(JSON.stringify(makePayload()));
  const started = parseRetellWebhookPayload(JSON.stringify({
    event: "call_started",
    call: {
      call_id: "retell-call-1",
      agent_id: "retell-agent-1",
      call_status: "ongoing",
      start_timestamp: 1_800_000_000_000,
    },
  }));
  assert.ok(ended);
  assert.ok(started);

  await synchronizeRetellCallEvent(ended, JSON.stringify(makePayload()), fake.persistence);
  await synchronizeRetellCallEvent(started, JSON.stringify(started), fake.persistence);
  assert.equal(fake.calls.get("local-call-1")?.status, "completed");
  assert.equal(fake.updateCount, 2);
});

test("unknown valid calls are durably queued without creating or updating call records", async () => {
  const fake = createFakePersistence({
    call: {
      id: "another-call",
      status: "initiated",
      agentId: "local-agent-1",
      externalCallId: "some-other-call",
      organizationId: "org-a",
    },
  });
  const payload = parseRetellWebhookPayload(JSON.stringify(makePayload()));
  assert.ok(payload);

  assert.equal(
    await synchronizeRetellCallEvent(payload, JSON.stringify(makePayload()), fake.persistence),
    "queued",
  );
  assert.equal(fake.events.size, 1);
  assert.equal(fake.reconciliationEvents.length, 1);
  assert.equal(fake.reconciliationEvents[0].organizationId, "org-a");
  assert.equal(JSON.stringify(fake.reconciliationEvents).includes("+14155552671"), false);
  assert.equal(JSON.stringify(fake.reconciliationEvents).includes("Agent: Hello."), false);
  assert.equal(JSON.stringify(fake.reconciliationEvents).includes("Customer requested help."), false);
  assert.equal(fake.calls.size, 1);
  assert.equal(fake.updateCount, 0);

  const response = await postWithOfficialSignature(
    JSON.stringify(makePayload()),
    (webhookPayload, rawBody) =>
      synchronizeRetellCallEvent(webhookPayload, rawBody, fake.persistence),
  );
  assert.equal(response.status, 204);
  assert.equal(fake.calls.size, 1);
  assert.equal(fake.updateCount, 0);
});

test("duplicate unassociated Retell events are durably queued only once", async () => {
  const fake = createFakePersistence({
    call: {
      id: "another-call",
      status: "initiated",
      agentId: "local-agent-1",
      externalCallId: "some-other-call",
      organizationId: "org-a",
    },
  });
  const rawBody = JSON.stringify(makePayload());

  const firstResponse = await postWithOfficialSignature(
    rawBody,
    (payload, body) => synchronizeRetellCallEvent(payload, body, fake.persistence),
  );
  const duplicateResponse = await postWithOfficialSignature(
    rawBody,
    (payload, body) => synchronizeRetellCallEvent(payload, body, fake.persistence),
  );

  assert.equal(firstResponse.status, 204);
  assert.equal(duplicateResponse.status, 204);
  assert.equal(fake.reconciliationEvents.length, 1);
  assert.equal(fake.events.size, 1);
  assert.equal(fake.updateCount, 0);
});

test("missing transcript data does not erase an existing transcript while analysis fields update", async () => {
  const fake = createFakePersistence({
    call: {
      id: "local-call-1",
      status: "completed",
      agentId: "local-agent-1",
      externalCallId: "retell-call-1",
      organizationId: "org-a",
      transcript: "Previously stored transcript.",
    },
  });
  const payload = parseRetellWebhookPayload(JSON.stringify({
    event: "call_analyzed",
    call: {
      call_id: "retell-call-1",
      agent_id: "retell-agent-1",
      call_status: "ended",
      call_analysis: { call_summary: "Analysis is available." },
    },
  }));
  assert.ok(payload);

  await synchronizeRetellCallEvent(payload, JSON.stringify(payload), fake.persistence);
  assert.equal(fake.lastUpdate?.transcript, undefined);
  assert.equal(fake.lastUpdate?.outcome, "Analysis is available.");
  assert.equal(fake.calls.get("local-call-1")?.transcript, "Previously stored transcript.");
});

test("Retell agent ownership and application call metadata cannot cross organization boundaries", async () => {
  const foreignRecord = {
    id: "foreign-call",
    status: "initiated",
    agentId: "foreign-agent",
    externalCallId: "retell-call-1",
    organizationId: "org-b",
  };
  const fake = createFakePersistence({
    call: foreignRecord,
    linkedAgents: {
      "retell-agent-1": { agentId: "local-agent-1", organizationId: "org-a" },
    },
  });
  const payload = parseRetellWebhookPayload(JSON.stringify(makePayload()));
  assert.ok(payload);
  assert.equal(
    await synchronizeRetellCallEvent(payload, JSON.stringify(payload), fake.persistence),
    "queued",
  );
  assert.equal(fake.events.size, 1);
  assert.equal(fake.reconciliationEvents.length, 1);
  assert.equal(fake.reconciliationEvents[0].organizationId, null);
  assert.equal(fake.reconciliationEvents[0].retellAgentId, null);
  assert.equal(fake.updateCount, 0);

  const spoofedMetadata = parseRetellWebhookPayload(JSON.stringify({
    event: "call_ended",
    call: {
      ...makePayload().call,
      call_id: "unknown-call",
      agent_id: "unlinked-agent",
      metadata: { applicationCallId: "foreign-call" },
    },
  }));
  assert.ok(spoofedMetadata);
  assert.equal(
    await synchronizeRetellCallEvent(spoofedMetadata, JSON.stringify(spoofedMetadata), fake.persistence),
    "queued",
  );
  assert.equal(fake.events.size, 2);
  assert.equal(fake.reconciliationEvents.length, 2);
  assert.equal(fake.reconciliationEvents[1].organizationId, null);
  assert.equal(fake.updateCount, 0);
});
