import test from "node:test";
import assert from "node:assert/strict";

import {
  generateSecureClientUuid,
  SecureRandomUnavailableError,
} from "../lib/utils.ts";
import { callCreateSchema } from "../lib/server/validation/schemas.ts";

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test("generateSecureClientUuid uses crypto.randomUUID when available", () => {
  let randomUuidCalled = false;
  const mockCrypto = {
    randomUUID: () => {
      randomUuidCalled = true;
      return "11111111-2222-4333-8444-555555555555";
    },
    getRandomValues: <T extends ArrayBufferView | null>(arr: T): T => arr,
  };

  const result = generateSecureClientUuid(mockCrypto);
  assert.equal(randomUuidCalled, true);
  assert.equal(result, "11111111-2222-4333-8444-555555555555");
});

test("generateSecureClientUuid falls back to getRandomValues when randomUUID is unavailable (plain HTTP context)", () => {
  let getRandomValuesCalled = false;
  const mockCrypto = {
    randomUUID: undefined,
    getRandomValues: <T extends ArrayBufferView | null>(arr: T): T => {
      getRandomValuesCalled = true;
      if (arr && "byteLength" in arr) {
        const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
        for (let i = 0; i < u8.length; i++) {
          u8[i] = (i * 17 + 5) & 0xff;
        }
      }
      return arr;
    },
  };

  const result = generateSecureClientUuid(mockCrypto);
  assert.equal(getRandomValuesCalled, true);
  assert.match(result, UUID_V4_REGEX);

  // Validate the generated UUID passes the server's callCreateSchema validation
  const validation = callCreateSchema.safeParse({
    agentId: "agent-1",
    destination: "+14155552671",
    consentConfirmed: true,
    idempotencyKey: result,
  });
  assert.equal(validation.success, true);
});

test("generateSecureClientUuid produces valid RFC 4122 v4 UUIDs across multiple iterations", () => {
  const mockCrypto = {
    randomUUID: undefined,
    getRandomValues: <T extends ArrayBufferView | null>(arr: T): T => {
      if (arr && "byteLength" in arr) {
        const u8 = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
        for (let i = 0; i < u8.length; i++) {
          u8[i] = Math.floor(Math.random() * 256);
        }
      }
      return arr;
    },
  };

  for (let i = 0; i < 50; i++) {
    const uuid = generateSecureClientUuid(mockCrypto);
    assert.match(uuid, UUID_V4_REGEX, `Generated invalid UUID: ${uuid}`);
    assert.equal(uuid.charAt(14), "4", "Must be version 4");
    assert.ok(["8", "9", "a", "b"].includes(uuid.charAt(19).toLowerCase()), "Must have variant 10xx");
  }
});

test("generateSecureClientUuid throws SecureRandomUnavailableError and refuses to fall back to Math.random when no secure crypto exists", () => {
  // Empty crypto object (no randomUUID, no getRandomValues)
  assert.throws(
    () => generateSecureClientUuid({}),
    (error: unknown) => {
      assert.ok(error instanceof SecureRandomUnavailableError);
      assert.match(
        (error as SecureRandomUnavailableError).message,
        /Cryptographically secure random number generation is not supported/,
      );
      return true;
    },
  );

  // Null crypto source (simulating browser where window.crypto is absent)
  assert.throws(
    () => generateSecureClientUuid(null as unknown as undefined),
    (error: unknown) => {
      assert.ok(error instanceof SecureRandomUnavailableError);
      return true;
    },
  );
});

test("client submission handles SecureRandomUnavailableError and returns user-friendly error without submitting", async () => {
  let submitted = false;
  let clientError: string | null = null;

  // Simulate handleMakeCall error flow
  const simulateSubmission = async (cryptoSource: unknown) => {
    try {
      const idempotencyKey = generateSecureClientUuid(cryptoSource as Parameters<typeof generateSecureClientUuid>[0]);
      submitted = true;
      return idempotencyKey;
    } catch (error) {
      clientError = error instanceof Error
        ? error.message
        : "Unable to generate a secure request key. Check your browser security settings.";
      return null;
    }
  };

  const result = await simulateSubmission(null);
  assert.equal(result, null);
  assert.equal(submitted, false);
  assert.match(clientError ?? "", /Cryptographically secure random/);
});
