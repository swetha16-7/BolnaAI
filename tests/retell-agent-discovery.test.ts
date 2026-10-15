import test from "node:test";
import assert from "node:assert/strict";

import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
} from "retell-sdk";
import {
  createRetellClient,
  getRetellAgentListFailure,
  listRetellAgents,
} from "../lib/server/calls/retell.ts";
import { getRetellApiKey } from "../lib/server/providers/configuration.ts";
import { retellAgentLinkSchema } from "../lib/server/validation/schemas.ts";

test("Retell discovery returns only safe agent summary fields across pages", async () => {
  const requests: Array<{ url: string; body: unknown }> = [];
  const client = createRetellClient("test-retell-key", async (input, init) => {
    requests.push({
      url: String(input),
      body: JSON.parse(String(init?.body)),
    });
    const page = requests.length;
    return Response.json(page === 1
      ? {
          has_more: true,
          pagination_key: "next-page",
          items: [{
            agent_id: "agent_first",
            agent_name: "Support",
            channel: "voice",
            tags: {},
            system_prompt: "private provider configuration",
          }],
        }
      : {
          has_more: false,
          items: [{
            agent_id: "agent_second",
            agent_name: "Chat",
            channel: "chat",
            tags: {},
            system_prompt: "another private provider configuration",
          }],
        });
  });

  const agents = await listRetellAgents(client);

  assert.deepEqual(agents, [
    { retellAgentId: "agent_first", name: "Support", channel: "voice" },
    { retellAgentId: "agent_second", name: "Chat", channel: "chat" },
  ]);
  assert.equal(requests.length, 2);
  assert.equal(new URL(requests[0].url).searchParams.get("limit"), "100");
  assert.equal(new URL(requests[1].url).searchParams.get("limit"), "100");
  assert.equal(new URL(requests[1].url).searchParams.get("pagination_key"), "next-page");
  assert.deepEqual(requests[1].body, {});
  assert.equal(JSON.stringify(agents).includes("private provider configuration"), false);
});

test("Retell discovery fails safely for malformed and repeating pagination responses", async () => {
  const malformedClient = createRetellClient("test-retell-key", async () =>
    Response.json({ has_more: true, items: [] }),
  );
  await assert.rejects(listRetellAgents(malformedClient), {
    name: "RetellAgentListResponseError",
  });

  const repeatingClient = createRetellClient("test-retell-key", async () =>
    Response.json({ has_more: true, pagination_key: "same-page", items: [] }),
  );
  await assert.rejects(listRetellAgents(repeatingClient), {
    name: "RetellAgentListResponseError",
  });
});

test("Retell provider failures are converted to safe discovery errors", () => {
  const networkError = new APIConnectionError({
    message: "connection failed with test-retell-key",
  });
  const providerError = new APIError(
    401,
    { message: "provider error contained test-retell-key" },
    "test-retell-key",
    new Headers(),
  );
  const timeoutFailure = getRetellAgentListFailure(
    new APIConnectionTimeoutError({ message: "timeout with test-retell-key" }),
  );
  const authenticationFailure = getRetellAgentListFailure(providerError);
  const internalFailure = getRetellAgentListFailure(
    new Error("internal failure contained test-retell-key"),
  );

  for (const failure of [
    getRetellAgentListFailure(networkError),
    authenticationFailure,
    timeoutFailure,
    internalFailure,
  ]) {
    assert.equal(JSON.stringify(failure).includes("test-retell-key"), false);
  }
  assert.equal(authenticationFailure.status, 502);
  assert.match(authenticationFailure.message, /Verify RETELL_API_KEY/);
  assert.equal(internalFailure.status, 500);
  assert.match(internalFailure.message, /internal error/i);
  assert.equal(timeoutFailure.status, 504);
  assert.match(getRetellAgentListFailure(networkError).message, /Could not connect to Retell/);

  const rateLimitFailure = getRetellAgentListFailure(
    new APIError(429, { message: "rate limited" }, "test-retell-key", new Headers()),
  );
  assert.equal(rateLimitFailure.status, 503);
});

test("Retell API key lookup reports missing configuration without returning values", () => {
  assert.equal(getRetellApiKey({}), null);
  assert.equal(getRetellApiKey({ RETELL_API_KEY: "  " }), null);
  assert.equal(getRetellApiKey({ RETELL_API_KEY: "  test-retell-key  " }), "test-retell-key");
});

test("Retell linking accepts only bounded safe provider IDs", () => {
  assert.equal(retellAgentLinkSchema.safeParse({ retellAgentId: "agent_valid-123" }).success, true);
  assert.equal(retellAgentLinkSchema.safeParse({ retellAgentId: "   " }).success, false);
  assert.equal(retellAgentLinkSchema.safeParse({ retellAgentId: "agent/invalid" }).success, false);
  assert.equal(retellAgentLinkSchema.safeParse({ retellAgentId: "x".repeat(101) }).success, false);
});
