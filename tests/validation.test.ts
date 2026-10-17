import test from "node:test";
import assert from "node:assert/strict";

import { phoneSchema, agentSchema, callCreateSchema } from "../lib/server/validation/schemas.ts";

test("phoneSchema accepts valid E.164 numbers", () => {
  assert.equal(phoneSchema.safeParse("+14155552671").success, true);
  assert.equal(phoneSchema.safeParse("+918374605389").success, true);
});

test("phoneSchema rejects invalid numbers", () => {
  const result = phoneSchema.safeParse("4155552671");
  assert.equal(result.success, false);
});

test("agentSchema validates required agent fields", () => {
  const result = agentSchema.safeParse({
    name: "Sarah",
    type: "Receptionist",
    timezone: "UTC",
    languages: ["English"],
  });

  assert.equal(result.success, true);
});

test("callCreateSchema requires destination, consent confirmation, agent ID, and an idempotency key, while contactId is optional", () => {
  const result = callCreateSchema.safeParse({
    agentId: "agent-1",
    contactId: "contact-1",
    destination: "+14155552671",
    consentConfirmed: true,
    idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
  });

  assert.equal(result.success, true);

  // Direct destination without contactId
  assert.equal(callCreateSchema.safeParse({
    agentId: "agent-1",
    destination: "+14155552671",
    consentConfirmed: true,
    idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
  }).success, true);

  // Direct destination with null contactId
  assert.equal(callCreateSchema.safeParse({
    agentId: "agent-1",
    contactId: null,
    destination: "+14155552671",
    consentConfirmed: true,
    idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
  }).success, true);

  // Missing agentId
  assert.equal(callCreateSchema.safeParse({
    destination: "+14155552671",
    consentConfirmed: true,
    idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
  }).success, false);

  assert.equal(callCreateSchema.safeParse({
    agentId: "agent-1",
    destination: "+14155552671",
    consentConfirmed: true,
    idempotencyKey: "not-a-uuid",
  }).success, false);

  assert.equal(callCreateSchema.safeParse({
    agentId: "agent-1",
    destination: "+14155552671",
    idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
  }).success, false);
});
