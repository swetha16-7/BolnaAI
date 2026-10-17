import test from "node:test";
import assert from "node:assert/strict";

import { APIConnectionTimeoutError, APIError } from "retell-sdk";
import {
  createRetellClient,
  getRetellCallHistoryFailure,
  listRetellCalls,
  retrieveRetellCall,
  RetellCallOwnershipError,
} from "../lib/server/calls/retell.ts";
import { selectUniquelyOwnedRetellAgents } from "../lib/server/calls/retell-ownership.ts";

test("Retell call history is paginated, limited to linked agents, and whitelists response fields", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const client = createRetellClient("test-retell-key", async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({
      has_more: true,
      pagination_key: "cursor-next",
      items: [
        {
          call_id: "call-owned",
          agent_id: "retell-agent-owned",
          call_type: "phone_call",
          call_status: "ended",
          direction: "inbound",
          from_number: "+14155550100",
          to_number: "+14155550200",
          start_timestamp: 1_800_000_000_000,
          end_timestamp: 1_800_000_065_000,
          duration_ms: 65_000,
          transcript: "Hello there.",
          call_analysis: { call_summary: "Customer asked for support." },
          recording_url: "https://recordings.example.test/call-owned",
          access_token: "must-not-leak",
          metadata: { system_prompt: "must-not-leak" },
        },
        {
          call_id: "call-unowned",
          agent_id: "retell-agent-unowned",
          call_type: "phone_call",
          call_status: "ended",
          from_number: "+14155550300",
          to_number: "+14155550400",
        },
      ],
    });
  });

  const result = await listRetellCalls(client, {
    agentNames: new Map([["retell-agent-owned", "Support agent"]]),
    limit: 25,
    paginationKey: "cursor-current",
  });

  assert.deepEqual(requestBody, {
    limit: 25,
    sort_order: "descending",
    filter_criteria: {
      agent: [{ agent_id: "retell-agent-owned" }],
    },
    pagination_key: "cursor-current",
  });
  assert.equal(result.hasMore, true);
  assert.equal(result.nextCursor, "cursor-next");
  assert.equal(result.calls.length, 1);
  assert.deepEqual(result.calls[0], {
    callId: "call-owned",
    agentId: "retell-agent-owned",
    agentName: "Support agent",
    callType: "phone_call",
    direction: "inbound",
    status: "completed",
    fromNumber: "+14155550100",
    toNumber: "+14155550200",
    startTimestamp: 1_800_000_000_000,
    endTimestamp: 1_800_000_065_000,
    durationSeconds: 65,
    transcript: "Hello there.",
    summary: "Customer asked for support.",
    recordingUrl: "https://recordings.example.test/call-owned",
  });
  assert.equal(JSON.stringify(result).includes("must-not-leak"), false);
  assert.equal(JSON.stringify(result).includes("call-unowned"), false);
});

test("Retell listing skips provider access when the organization has no safe agent mappings", async () => {
  let requested = false;
  const client = createRetellClient("test-retell-key", async () => {
    requested = true;
    return Response.json({});
  });
  const result = await listRetellCalls(client, {
    agentNames: new Map(),
    limit: 25,
  });

  assert.deepEqual(result, { calls: [], hasMore: false, nextCursor: null });
  assert.equal(requested, false);
});

test("Retell call ownership excludes ambiguous, duplicate, and foreign-organization links", () => {
  const result = selectUniquelyOwnedRetellAgents("org-a", [
    { id: "agent-a", name: "Support", providerLinks: [{ providerId: "retell-a" }] },
    { id: "agent-b", name: "Ambiguous", providerLinks: [{ providerId: "retell-duplicate" }] },
    { id: "agent-c", name: "No link", providerLinks: [] },
    {
      id: "agent-d",
      name: "Multiple links",
      providerLinks: [{ providerId: "retell-d1" }, { providerId: "retell-d2" }],
    },
  ], [
    { providerId: "retell-a", agent: { id: "agent-a", organizationId: "org-a" } },
    { providerId: "retell-duplicate", agent: { id: "agent-b", organizationId: "org-a" } },
    { providerId: "retell-duplicate", agent: { id: "agent-other", organizationId: "org-b" } },
    { providerId: "retell-foreign", agent: { id: "agent-other", organizationId: "org-b" } },
  ]);

  assert.deepEqual([...result], [["retell-a", "Support"]]);
});

test("Retell call detail verifies the requested call and its linked agent", async () => {
  const client = createRetellClient("test-retell-key", async () => Response.json({
    call_id: "call-details",
    agent_id: "retell-agent-owned",
    call_type: "web_call",
    call_status: "ongoing",
    start_timestamp: 1_800_000_000_000,
    transcript: "A web call transcript.",
    call_analysis: { call_summary: "A brief summary." },
    recording_url: "https://recordings.example.test/details",
  }));

  const call = await retrieveRetellCall(client, "call-details", "Support agent", "retell-agent-owned");
  assert.equal(call.callId, "call-details");
  assert.equal(call.agentId, "retell-agent-owned");
  assert.equal(call.callType, "web_call");
  assert.equal(call.status, "in_progress");
  assert.equal(call.summary, "A brief summary.");
  assert.equal(call.transcript, "A web call transcript.");
  assert.equal(call.recordingUrl, "https://recordings.example.test/details");

  await assert.rejects(
    retrieveRetellCall(client, "call-details", "Support agent", "another-agent"),
    (error: unknown) => error instanceof RetellCallOwnershipError,
  );
});

test("Retell call details reject non-HTTPS recording URLs and provider errors stay generic", async () => {
  const client = createRetellClient("test-retell-key", async () => Response.json({
    call_id: "call-no-recording",
    agent_id: "retell-agent-owned",
    call_type: "phone_call",
    call_status: "ended",
    recording_url: "http://recordings.example.test/audio",
  }));
  const call = await retrieveRetellCall(client, "call-no-recording", "Support agent");
  assert.equal(call.recordingUrl, null);

  const timeout = new APIConnectionTimeoutError({
    message: "timeout contained test-retell-key",
  });
  const failure = getRetellCallHistoryFailure(timeout);
  assert.equal(failure.status, 504);
  assert.equal(JSON.stringify(failure).includes("test-retell-key"), false);

  const authenticationFailure = getRetellCallHistoryFailure(
    new APIError(
      401,
      { message: "provider error contained test-retell-key" },
      "test-retell-key",
      new Headers(),
    ),
  );
  assert.equal(authenticationFailure.status, 502);
  assert.match(authenticationFailure.message, /Verify RETELL_API_KEY/);
  assert.equal(JSON.stringify(authenticationFailure).includes("test-retell-key"), false);

  const internalFailure = getRetellCallHistoryFailure(
    new Error("internal failure contained test-retell-key"),
  );
  assert.equal(internalFailure.status, 500);
  assert.equal(JSON.stringify(internalFailure).includes("test-retell-key"), false);
});
