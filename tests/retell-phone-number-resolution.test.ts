import test from "node:test";
import assert from "node:assert/strict";

import {
  createRetellClient,
  initiateRetellPhoneCall,
  resolveRetellAgentPhoneNumber,
  RetellPhoneNumberResolutionError,
} from "../lib/server/calls/retell.ts";

test("resolveRetellAgentPhoneNumber returns the phone number explicitly associated in outbound_agents", async () => {
  const client = createRetellClient("mock-key", async (input) => {
    const url = String(input);
    if (url.includes("list-phone-numbers")) {
      return Response.json({
        items: [
          {
            phone_number: "+19804856142",
            phone_number_type: "custom",
            nickname: "Boomi Twilio",
            outbound_agents: [
              { agent_id: "agent-boomi", weight: 1 },
            ],
            inbound_agents: [
              { agent_id: "agent-boomi", weight: 1 },
            ],
          },
          {
            phone_number: "+14155550999",
            phone_number_type: "custom",
            outbound_agents: [
              { agent_id: "agent-other", weight: 1 },
            ],
          },
        ],
        has_more: false,
      });
    }
    return Response.json({ error: "not found" }, { status: 404 });
  });

  const resolved = await resolveRetellAgentPhoneNumber(client, "agent-boomi");
  assert.equal(resolved, "+19804856142");
});

test("resolveRetellAgentPhoneNumber rejects when agent is only in inbound_agents and not outbound_agents", async () => {
  const client = createRetellClient("mock-key", async () => {
    return Response.json({
      items: [
        {
          phone_number: "+19804856142",
          inbound_agents: [{ agent_id: "agent-inbound-only" }],
          outbound_agents: [],
        },
      ],
      has_more: false,
    });
  });

  await assert.rejects(
    resolveRetellAgentPhoneNumber(client, "agent-inbound-only"),
    (error: unknown) => {
      assert.equal(error instanceof RetellPhoneNumberResolutionError, true);
      assert.equal((error as RetellPhoneNumberResolutionError).code, "no_phone_number_configured");
      return true;
    },
  );
});

test("resolveRetellAgentPhoneNumber rejects when no phone number is configured for agent", async () => {
  const client = createRetellClient("mock-key", async () => {
    return Response.json({
      items: [
        {
          phone_number: "+14155550100",
          outbound_agents: [{ agent_id: "different-agent" }],
        },
      ],
      has_more: false,
    });
  });

  await assert.rejects(
    resolveRetellAgentPhoneNumber(client, "agent-unconfigured"),
    (error: unknown) => {
      assert.equal(error instanceof RetellPhoneNumberResolutionError, true);
      assert.equal((error as RetellPhoneNumberResolutionError).code, "no_phone_number_configured");
      return true;
    },
  );
});

test("resolveRetellAgentPhoneNumber rejects when multiple conflicting numbers are associated", async () => {
  const client = createRetellClient("mock-key", async () => {
    return Response.json({
      items: [
        {
          phone_number: "+14155550100",
          outbound_agents: [{ agent_id: "agent-duplicate" }],
        },
        {
          phone_number: "+14155550200",
          outbound_agents: [{ agent_id: "agent-duplicate" }],
        },
      ],
      has_more: false,
    });
  });

  await assert.rejects(
    resolveRetellAgentPhoneNumber(client, "agent-duplicate"),
    (error: unknown) => {
      assert.equal(error instanceof RetellPhoneNumberResolutionError, true);
      assert.equal((error as RetellPhoneNumberResolutionError).code, "ambiguous_phone_number_mapping");
      return true;
    },
  );
});

test("resolveRetellAgentPhoneNumber rejects when associated number has invalid E.164 format", async () => {
  const client = createRetellClient("mock-key", async () => {
    return Response.json({
      items: [
        {
          phone_number: "invalid-number-format",
          outbound_agents: [{ agent_id: "agent-malformed-num" }],
        },
      ],
      has_more: false,
    });
  });

  await assert.rejects(
    resolveRetellAgentPhoneNumber(client, "agent-malformed-num"),
    (error: unknown) => {
      assert.equal(error instanceof RetellPhoneNumberResolutionError, true);
      assert.equal((error as RetellPhoneNumberResolutionError).code, "invalid_phone_number_format");
      return true;
    },
  );
});

test("dynamic caller ID resolution and call creation submits verified agent ID and resolved caller ID", async () => {
  let createdCallBody: Record<string, unknown> | undefined;

  const client = createRetellClient("mock-key", async (input, init) => {
    const url = String(input);
    if (url.includes("list-phone-numbers")) {
      return Response.json({
        items: [
          {
            phone_number: "+19804856142",
            phone_number_type: "custom",
            outbound_agents: [{ agent_id: "retell-agent-verified-1" }],
          },
        ],
        has_more: false,
      });
    }

    if (url.includes("create-phone-call")) {
      createdCallBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({
        call_id: "call-created-123",
        agent_id: "retell-agent-verified-1",
        call_status: "registered",
        call_type: "phone_call",
        from_number: "+19804856142",
        to_number: "+14155552671",
        telephony_identifier: { twilio_call_sid: "CA-mock-sid" },
      }, { status: 201 });
    }

    return Response.json({ error: "not found" }, { status: 404 });
  });

  // 1. Resolve phone number dynamically using the server-verified Retell agent ID
  const resolvedFromNumber = await resolveRetellAgentPhoneNumber(client, "retell-agent-verified-1");
  assert.equal(resolvedFromNumber, "+19804856142");

  // 2. Initiate Retell call using resolved from number and selected agent ID
  const result = await initiateRetellPhoneCall(client, {
    fromNumber: resolvedFromNumber,
    toNumber: "+14155552671",
    retellAgentId: "retell-agent-verified-1",
    callId: "app-call-1",
    idempotencyKey: "770e8400-e29b-41d4-a716-446655440000",
  });

  assert.equal(result.call_id, "call-created-123");
  assert.equal(result.agent_id, "retell-agent-verified-1");
  assert.equal(createdCallBody?.from_number, "+19804856142");
  assert.equal(createdCallBody?.to_number, "+14155552671");
  assert.equal(createdCallBody?.override_agent_id, "retell-agent-verified-1");
  assert.equal(createdCallBody?.idempotency_key, "770e8400-e29b-41d4-a716-446655440000");
  assert.equal(createdCallBody?.honor_internal_dnc, true);
  assert.deepEqual(createdCallBody?.metadata, { applicationCallId: "app-call-1" });
});
