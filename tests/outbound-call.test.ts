import test from "node:test";
import assert from "node:assert/strict";

import {
  runOutboundCallOnce,
  validateOutboundCallForm,
} from "../lib/calls/outbound-form.ts";
import {
  canCreateOutboundCall,
  isMatchingCallReplay,
  isOutboundCallingEnabled,
} from "../lib/server/calls/policy.ts";
import { createRetellClient, initiateRetellPhoneCall } from "../lib/server/calls/retell.ts";
import { callCreateSchema } from "../lib/server/validation/schemas.ts";

const destination = "+14155552671";
const eligibleContact = {
  id: "contact-1",
  phone: destination,
  voiceConsentAt: "2026-10-01T00:00:00.000Z",
  voiceConsentRevokedAt: null,
  doNotCall: false,
};

test("outbound form validation requires a mapped agent, valid E.164 destination, and consent confirmation, while allowing direct calls", () => {
  const valid = {
    agentId: "agent-1",
    destination,
    contact: eligibleContact,
    consentConfirmed: true,
  };
  assert.equal(validateOutboundCallForm(valid), null);
  // Direct call with contact: null is valid
  assert.equal(validateOutboundCallForm({ ...valid, contact: null }), null);
  // Direct call with contact omitted is valid
  assert.equal(validateOutboundCallForm({ agentId: "agent-1", destination, consentConfirmed: true }), null);
  assert.match(
    validateOutboundCallForm({ ...valid, destination: "4155552671" }) ?? "",
    /E\.164/,
  );
  assert.match(
    validateOutboundCallForm({ ...valid, consentConfirmed: false }) ?? "",
    /Confirm/,
  );
  assert.match(
    validateOutboundCallForm({ ...valid, contact: { ...eligibleContact, voiceConsentAt: null } }) ?? "",
    /current, unrevoked consent/,
  );
  assert.match(
    validateOutboundCallForm({ ...valid, contact: { ...eligibleContact, doNotCall: true } }) ?? "",
    /do not call/,
  );
});

test("API schema rejects invalid destinations and missing consent confirmation, while allowing direct destination calls", () => {
  const base = {
    agentId: "agent-1",
    contactId: "contact-1",
    destination,
    consentConfirmed: true,
    idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
  };

  assert.equal(callCreateSchema.safeParse(base).success, true);
  // Direct destination without contactId
  assert.equal(callCreateSchema.safeParse({
    agentId: "agent-1",
    destination,
    consentConfirmed: true,
    idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
  }).success, true);
  // Direct destination with null contactId
  assert.equal(callCreateSchema.safeParse({
    agentId: "agent-1",
    contactId: null,
    destination,
    consentConfirmed: true,
    idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
  }).success, true);
  assert.equal(callCreateSchema.safeParse({ ...base, destination: "+919121998166" }).success, true);
  assert.equal(callCreateSchema.safeParse({ ...base, destination: "+918374605389" }).success, true);
  assert.equal(callCreateSchema.safeParse({ ...base, destination: "4155552671" }).success, false);
  assert.equal(callCreateSchema.safeParse({ ...base, destination: "919121998166" }).success, false);
  assert.equal(callCreateSchema.safeParse({ ...base, destination: "+0123456789" }).success, false);
  assert.equal(callCreateSchema.safeParse({ ...base, destination: "+91 91219 98166" }).success, false);
  assert.equal(callCreateSchema.safeParse({ ...base, destination: "+91-9121998166" }).success, false);
  assert.equal(callCreateSchema.safeParse({ ...base, destination: "+91912199816a" }).success, false);
  assert.equal(callCreateSchema.safeParse({ ...base, consentConfirmed: false }).success, false);
});

test("outbound form validation accepts Indian E.164 destination with matching contact or direct call", () => {
  const indianDestination = "+919121998166";
  const indianContact = {
    id: "contact-in-1",
    phone: indianDestination,
    voiceConsentAt: "2026-10-01T00:00:00.000Z",
    voiceConsentRevokedAt: null,
    doNotCall: false,
  };
  assert.equal(validateOutboundCallForm({
    agentId: "agent-1",
    destination: indianDestination,
    contact: indianContact,
    consentConfirmed: true,
  }), null);

  // Direct Indian number call without contact
  assert.equal(validateOutboundCallForm({
    agentId: "agent-1",
    destination: indianDestination,
    contact: null,
    consentConfirmed: true,
  }), null);

  assert.match(
    validateOutboundCallForm({
      agentId: "agent-1",
      destination: "919121998166",
      contact: indianContact,
      consentConfirmed: true,
    }) ?? "",
    /E\.164/,
  );
});

test("HTML5 input pattern strictly validates E.164 phone numbers including Indian numbers", () => {
  const pattern = "[+][1-9][0-9]{7,14}";
  const html5Regex = new RegExp(`^(?:${pattern})$`, "u");

  assert.equal(html5Regex.test("+919121998166"), true);
  assert.equal(html5Regex.test("+918374605389"), true);
  assert.equal(html5Regex.test("+14155552671"), true);
  assert.equal(html5Regex.test("919121998166"), false);
  assert.equal(html5Regex.test("+0123456789"), false);
  assert.equal(html5Regex.test("+91 91219 98166"), false);
  assert.equal(html5Regex.test("+91912199816a"), false);
});

test("outbound authorization rejects unauthenticated and member roles", () => {
  assert.equal(canCreateOutboundCall("OWNER"), true);
  assert.equal(canCreateOutboundCall("ADMIN"), true);
  assert.equal(canCreateOutboundCall("MANAGER"), true);
  assert.equal(canCreateOutboundCall("MEMBER"), false);
  assert.equal(canCreateOutboundCall(""), false);
});

test("outbound calling remains disabled unless both server approvals are true", () => {
  assert.equal(isOutboundCallingEnabled({
    OUTBOUND_CALLS_ENABLED: "false",
    OUTBOUND_CALLING_POLICY_APPROVED: "false",
  }), false);
  assert.equal(isOutboundCallingEnabled({
    OUTBOUND_CALLS_ENABLED: "true",
    OUTBOUND_CALLING_POLICY_APPROVED: "false",
  }), false);
  assert.equal(isOutboundCallingEnabled({
    OUTBOUND_CALLS_ENABLED: "true",
    OUTBOUND_CALLING_POLICY_APPROVED: "true",
  }), true);
});

test("an idempotency replay is accepted only for the same agent, contact, and destination, including direct calls", () => {
  const existing = {
    agentId: "agent-1",
    contactId: "contact-1",
    destination,
  };
  assert.equal(isMatchingCallReplay(existing, existing), true);
  assert.equal(isMatchingCallReplay(existing, { ...existing, destination: "+442079460000" }), false);
  assert.equal(isMatchingCallReplay(existing, { ...existing, contactId: "contact-2" }), false);

  // Direct call replay with null contactId
  const directExisting = {
    agentId: "agent-1",
    contactId: null,
    destination,
  };
  assert.equal(isMatchingCallReplay(directExisting, { agentId: "agent-1", destination }), true);
  assert.equal(isMatchingCallReplay(directExisting, { agentId: "agent-1", contactId: null, destination }), true);
  assert.equal(isMatchingCallReplay(directExisting, { agentId: "agent-1", contactId: "contact-1", destination }), false);
});

test("simultaneous form submissions run only one request", async () => {
  const pending = { current: false };
  let requests = 0;
  let releaseRequest: (() => void) | undefined;
  const first = runOutboundCallOnce(pending, async () => {
    requests += 1;
    await new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    return "submitted";
  });
  const duplicate = await runOutboundCallOnce(pending, async () => {
    requests += 1;
    return "duplicate";
  });

  assert.equal(duplicate, null);
  assert.equal(requests, 1);
  releaseRequest?.();
  assert.equal(await first, "submitted");
  assert.equal(pending.current, false);
});

test("successful submission uses a mocked Retell transport and validates provider ownership", async () => {
  let outgoingBody: Record<string, unknown> | undefined;
  let requestUrl = "";
  const client = createRetellClient("mock-retell-key", async (input, init) => {
    requestUrl = String(input);
    outgoingBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({
      call_id: "retell-call-1",
      agent_id: "retell-agent-1",
      call_status: "registered",
      call_type: "phone_call",
    }, { status: 201 });
  });

  const result = await initiateRetellPhoneCall(client, {
    fromNumber: "+14155550100",
    toNumber: destination,
    retellAgentId: "retell-agent-1",
    callId: "local-call-1",
    idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
  });

  assert.equal(result.call_id, "retell-call-1");
  assert.equal(requestUrl.includes("retell"), true);
  assert.equal(outgoingBody?.from_number, "+14155550100");
  assert.equal(outgoingBody?.to_number, destination);
  assert.equal(outgoingBody?.override_agent_id, "retell-agent-1");
  assert.equal(outgoingBody?.idempotency_key, "550e8400-e29b-41d4-a716-446655440000");
});
