import test from "node:test";
import assert from "node:assert/strict";

import {
  APIConnectionError,
  APIError,
} from "retell-sdk";
import {
  createRetellClient,
  getRetellCallFailure,
  initiateRetellPhoneCall,
  RetellCallResponseError,
} from "../lib/server/calls/retell.ts";

const requestInput = {
  fromNumber: "+14155552671",
  toNumber: "+14155550100",
  retellAgentId: "retell-agent-1",
  callId: "internal-call-1",
  idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
};

test("Retell call request uses the saved agent mapping and idempotency key", async () => {
  let body: Record<string, unknown> | undefined;
  const fetcher: typeof fetch = async (_input, init) => {
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({
      call_type: "phone_call",
      call_id: "retell-call-1",
      agent_id: "retell-agent-1",
      agent_version: 1,
      call_status: "registered",
      from_number: "+14155552671",
      to_number: "+14155550100",
      direction: "outbound",
      telephony_identifier: { twilio_call_sid: "CA-test-1" },
    }, { status: 201 });
  };
  const client = createRetellClient("test-api-key", fetcher);

  const response = await initiateRetellPhoneCall(client, {
    ...requestInput,
  });

  assert.equal(response.call_id, "retell-call-1");
  assert.equal(body?.from_number, "+14155552671");
  assert.equal(body?.to_number, "+14155550100");
  assert.equal(body?.override_agent_id, "retell-agent-1");
  assert.equal(body?.idempotency_key, "550e8400-e29b-41d4-a716-446655440000");
  assert.equal(body?.honor_internal_dnc, true);
  assert.deepEqual(body?.metadata, { applicationCallId: "internal-call-1" });
});

test("Retell HTTP failures are surfaced to the server caller", async () => {
  const client = createRetellClient("test-api-key", async () =>
    Response.json({ message: "provider rejected test request" }, { status: 429 }),
  );

  await assert.rejects(
    initiateRetellPhoneCall(client, {
      ...requestInput,
    }),
    (error: unknown) => error instanceof APIError && error.status === 429,
  );
});

test("Retell network uncertainty is distinguished from provider rejection", async () => {
  const client = createRetellClient("test-api-key", async () => {
    throw new Error("simulated network timeout");
  });

  await assert.rejects(
    initiateRetellPhoneCall(client, {
      ...requestInput,
    }),
    (error: unknown) => error instanceof APIConnectionError,
  );
});

test("malformed successful Retell responses are treated as uncertain submission", async () => {
  const client = createRetellClient("test-api-key", async () =>
    Response.json({
      call_id: "",
      agent_id: "retell-agent-1",
      call_status: "registered",
    }, { status: 201 }),
  );

  await assert.rejects(
    initiateRetellPhoneCall(client, requestInput),
    (error: unknown) => {
      assert.equal(error instanceof RetellCallResponseError, true);
      assert.deepEqual(getRetellCallFailure(error), {
        isAmbiguous: true,
        failureCode: "provider_response_unknown",
        failureMessage: "The provider response could not be confirmed. Do not retry with a new request key; check call history.",
      });
      return true;
    },
  );
});

test("provider error details are never copied into safe call failure messages", () => {
  const secretBearingError = new Error("provider response included secret-test-fragment");
  const failure = getRetellCallFailure(secretBearingError);

  assert.equal(JSON.stringify(failure).includes("secret-test-fragment"), false);
  assert.equal(failure.failureMessage, "The provider rejected or could not accept the call request.");
});
