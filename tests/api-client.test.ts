import test from "node:test";
import assert from "node:assert/strict";

import { ApiError, api, apiRequest } from "../lib/api-client.ts";

test("apiRequest sends same-origin credentials and parses a JSON response", async () => {
  let requestInit: RequestInit | undefined;
  const result = await apiRequest<{ ok: boolean }>(
    "/api/test",
    { method: "POST", body: JSON.stringify({ value: 1 }) },
    async (_input, init) => {
      requestInit = init;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  );

  assert.deepEqual(result, { ok: true });
  assert.equal(requestInit?.credentials, "same-origin");
  assert.equal(requestInit?.cache, "no-store");
  assert.equal(new Headers(requestInit?.headers).get("Content-Type"), "application/json");
});

test("apiRequest preserves authentication failures for session-expiry handling", async () => {
  await assert.rejects(
    apiRequest("/api/private", {}, async () =>
      new Response(JSON.stringify({ error: "Authentication required." }), { status: 401 }),
    ),
    (error: unknown) => error instanceof ApiError && error.status === 401,
  );
});

test("apiRequest includes server validation details in ApiError", async () => {
  await assert.rejects(
    apiRequest("/api/private", {}, async () =>
      new Response(JSON.stringify({
        error: "Contact data is invalid.",
        details: { firstName: ["First name is required."] },
      }), { status: 400 }),
    ),
    (error: unknown) =>
      error instanceof ApiError &&
      error.message === "Contact data is invalid." &&
      typeof error.details === "object",
  );
});

test("call creation sends its idempotency key only in the request header", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const result = await api.calls.create({
    agentId: "agent-1",
    contactId: "contact-1",
    destination: "+14155552671",
    consentConfirmed: true,
    idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
  }, async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(JSON.stringify({ call: { id: "call-1" }, status: "initiated" }), {
      status: 202,
      headers: { "Content-Type": "application/json" },
    });
  });

  assert.deepEqual(result, { call: { id: "call-1" }, status: "initiated" });
  assert.equal(requestUrl, "/api/calls");
  assert.equal(new Headers(requestInit?.headers).get("Idempotency-Key"), "550e8400-e29b-41d4-a716-446655440000");
  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    agentId: "agent-1",
    contactId: "contact-1",
    destination: "+14155552671",
    consentConfirmed: true,
  });
});

test("call creation allows omitting contactId for direct destination calls", async () => {
  let requestInit: RequestInit | undefined;
  const result = await api.calls.create({
    agentId: "agent-1",
    destination: "+14155552671",
    consentConfirmed: true,
    idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
  }, async (_input, init) => {
    requestInit = init;
    return new Response(JSON.stringify({ call: { id: "call-2" }, status: "initiated" }), {
      status: 202,
      headers: { "Content-Type": "application/json" },
    });
  });

  assert.deepEqual(result, { call: { id: "call-2" }, status: "initiated" });
  assert.deepEqual(JSON.parse(String(requestInit?.body)), {
    agentId: "agent-1",
    destination: "+14155552671",
    consentConfirmed: true,
  });
});

test("call creation preserves unauthorized responses and does not retry with provider credentials", async () => {
  let requestCount = 0;
  await assert.rejects(
    api.calls.create({
      agentId: "agent-1",
      contactId: "contact-1",
      destination: "+14155552671",
      consentConfirmed: true,
      idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
    }, async () => {
      requestCount += 1;
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }),
    (error: unknown) => error instanceof ApiError && error.status === 401,
  );
  assert.equal(requestCount, 1);
});

test("team APIs load membership data and do not put invitation tokens in create requests", async () => {
  const team = {
    members: [{
      id: "membership-1",
      role: "OWNER",
      createdAt: "2026-10-14T00:00:00.000Z",
      user: { id: "user-1", name: "Workspace Owner", email: "owner@example.test" },
    }],
    invitations: [],
    currentRole: "OWNER",
    currentUserId: "user-1",
    canManage: true,
  };
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | undefined;
  try {
    globalThis.fetch = async (input, init) => {
      if (String(input) === "/api/team" && init?.method === "POST") {
        requestBody = JSON.parse(String(init.body)) as Record<string, unknown>;
        return Response.json({ message: "If the invitation can be issued, an invitation email will be sent." }, { status: 202 });
      }
      return Response.json(team);
    };
    const loaded = await api.team.get();
    assert.deepEqual(loaded, team);

    const result = await api.team.invite("member@example.test", "MEMBER");
    assert.deepEqual(requestBody, { email: "member@example.test", role: "MEMBER" });
    assert.equal("token" in requestBody, false);
    assert.equal("token" in result, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
