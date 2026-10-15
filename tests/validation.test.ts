import test from "node:test";
import assert from "node:assert/strict";

import { phoneSchema, agentSchema, callCreateSchema } from "../lib/server/validation/schemas.ts";

test("phoneSchema accepts valid E.164 numbers", () => {
  const result = phoneSchema.safeParse("+14155552671");
  assert.equal(result.success, true);
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

test("callCreateSchema requires destination, consent confirmation, organization ids, and an idempotency key", () => {
  const result = callCreateSchema.safeParse({
    agentId: "agent-1",
    contactId: "contact-1",
    destination: "+14155552671",
    consentConfirmed: true,
    idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
  });

  assert.equal(result.success, true);
  assert.equal(callCreateSchema.safeParse({
    agentId: "agent-1",
    contactId: "contact-1",
    destination: "+14155552671",
    consentConfirmed: true,
    idempotencyKey: "not-a-uuid",
  }).success, false);
  assert.equal(callCreateSchema.safeParse({
    agentId: "agent-1",
    contactId: "contact-1",
    destination: "+14155552671",
    idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
  }).success, false);
});
