import test from "node:test";
import assert from "node:assert/strict";

import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
} from "retell-sdk";

import {
  buildRetellSystemPrompt,
  resolveRetellVoiceId,
  createRetellClient,
  createRetellAgentWithLlm,
  deleteRetellAgentAndLlm,
  getRetellAgentCreateFailure,
  RetellAgentCreateResponseError,
} from "../lib/server/calls/retell.ts";
import {
  createOrganizationAgent,
  type AgentInput,
} from "../lib/server/agents/service.ts";
import { getRetellApiKey } from "../lib/server/providers/configuration.ts";

const sampleAgentInput: AgentInput = {
  name: "Support Voice Agent",
  type: "Customer Support",
  timezone: "Asia/Kolkata",
  provider: "Deepgram",
  voiceName: "Aura-Asteria",
  speed: 1.1,
  languages: ["English", "Hindi"],
  greeting: "Hello, welcome to support! How can I assist you?",
  systemPrompt: "You are a customer support agent. Answer questions concisely.",
  fallback: "Let me transfer you to a human agent.",
  kbFaqs: [
    { q: "What are your hours?", a: "We are open 9am to 5pm." },
  ],
  workingDays: ["Mon", "Tue", "Wed"],
  hoursStart: "09:00",
  hoursEnd: "17:00",
  status: "active",
};

test("buildRetellSystemPrompt and resolveRetellVoiceId map BolnaAI settings accurately", () => {
  const prompt = buildRetellSystemPrompt(sampleAgentInput);
  assert.match(prompt, /You are a customer support agent/);
  assert.match(prompt, /Fallback instructions:.*transfer you to a human/);
  assert.match(prompt, /What are your hours\?/);
  assert.match(prompt, /We are open 9am to 5pm\./);
  assert.match(prompt, /Operating Hours \(Asia\/Kolkata\): Mon, Tue, Wed from 09:00 to 17:00/);

  // Test voice mapping
  assert.equal(resolveRetellVoiceId("Aura-Asteria"), "11labs-Jenny");
  assert.equal(resolveRetellVoiceId("Aura-Athena"), "11labs-Jenny");
  assert.equal(resolveRetellVoiceId("Aura-Orpheus"), "11labs-Adrian");
  assert.equal(resolveRetellVoiceId("Cartesia-British"), "11labs-George");
  assert.equal(resolveRetellVoiceId("Cartesia-Sonic"), "retell-Cimo");
  assert.equal(resolveRetellVoiceId("11labs-CustomVoice"), "11labs-CustomVoice");
  assert.equal(resolveRetellVoiceId("retell-CustomVoice"), "retell-CustomVoice");
  assert.equal(resolveRetellVoiceId(null), "retell-Cimo");
  assert.equal(resolveRetellVoiceId("Unknown"), "retell-Cimo");
});

test("createRetellAgentWithLlm creates LLM and Agent in sequence using Retell SDK", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];

  const client = createRetellClient("mock-retell-key", async (input, init) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, body });

    if (url.includes("create-retell-llm") || url.includes("/llm")) {
      return Response.json({
        llm_id: "llm_mock_123",
        last_modification_timestamp: Date.now(),
      }, { status: 201 });
    }

    if (url.includes("create-agent") || url.includes("/agent")) {
      return Response.json({
        agent_id: "agent_mock_456",
        agent_name: body.agent_name,
        voice_id: body.voice_id,
        voice_speed: body.voice_speed,
        channel: "voice",
        last_modification_timestamp: Date.now(),
      }, { status: 201 });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  });

  const result = await createRetellAgentWithLlm(client, sampleAgentInput);

  assert.equal(result.retellAgentId, "agent_mock_456");
  assert.equal(result.llmId, "llm_mock_123");
  assert.equal(calls.length, 2);

  // Verify LLM request body
  const llmCall = calls[0];
  assert.equal((llmCall.body as Record<string, unknown>).begin_message, sampleAgentInput.greeting);
  assert.match(String((llmCall.body as Record<string, unknown>).general_prompt), /You are a customer support agent/);

  // Verify Agent request body
  const agentCall = calls[1];
  assert.equal((agentCall.body as Record<string, unknown>).agent_name, sampleAgentInput.name);
  assert.equal((agentCall.body as Record<string, unknown>).voice_id, "11labs-Jenny");
  assert.equal((agentCall.body as Record<string, unknown>).voice_speed, 1.1);
  assert.deepEqual(
    (agentCall.body as Record<string, unknown>).response_engine,
    { type: "retell-llm", llm_id: "llm_mock_123" },
  );
});

test("createRetellAgentWithLlm cleans up created LLM if agent creation fails", async () => {
  let llmDeleted = false;

  const client = createRetellClient("mock-retell-key", async (input, init) => {
    const url = String(input);
    const method = init?.method?.toUpperCase() || "GET";

    if (method === "POST" && (url.includes("/llm") || url.includes("create-retell-llm"))) {
      return Response.json({ llm_id: "llm_to_clean_up" }, { status: 201 });
    }

    if (method === "POST" && (url.includes("/agent") || url.includes("create-agent"))) {
      return Response.json({ message: "Agent creation rejected by Retell" }, { status: 400 });
    }

    if (method === "DELETE" && url.includes("llm_to_clean_up")) {
      llmDeleted = true;
      return new Response(null, { status: 204 });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  });

  await assert.rejects(
    createRetellAgentWithLlm(client, sampleAgentInput),
    /Agent creation rejected by Retell/,
  );
  assert.equal(llmDeleted, true, "Orphaned LLM should be deleted when agent creation fails");
});

test("createOrganizationAgent creates local agent, ProviderLink, and AuditLog on success", async () => {
  const createdRecords: Record<string, unknown[]> = {
    agent: [],
    providerLink: [],
    auditLog: [],
  };

  const client = createRetellClient("mock-retell-key", async (input) => {
    const url = String(input);
    if (url.includes("/llm") || url.includes("create-retell-llm")) {
      return Response.json({ llm_id: "llm_test_999" }, { status: 201 });
    }
    return Response.json({
      agent_id: "agent_retell_888",
      channel: "voice",
    }, { status: 201 });
  });

  const mockDb = {
    agent: {
      findFirst: async () => null,
    },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        agent: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            const agentRecord = { id: "local-agent-1", ...data };
            createdRecords.agent.push(agentRecord);
            return agentRecord;
          },
          findUniqueOrThrow: async () => ({
            id: "local-agent-1",
            name: sampleAgentInput.name,
            type: sampleAgentInput.type,
            status: "active",
            timezone: sampleAgentInput.timezone,
            languages: sampleAgentInput.languages,
            provider: sampleAgentInput.provider,
            voiceName: sampleAgentInput.voiceName,
            speed: sampleAgentInput.speed,
            greeting: sampleAgentInput.greeting,
            systemPrompt: sampleAgentInput.systemPrompt,
            fallback: sampleAgentInput.fallback,
            kbLinks: "",
            kbFiles: [],
            kbFaqs: sampleAgentInput.kbFaqs,
            workingDays: sampleAgentInput.workingDays,
            hoursStart: sampleAgentInput.hoursStart,
            hoursEnd: sampleAgentInput.hoursEnd,
            holidays: "",
            callsToday: 0,
            createdAt: new Date(),
            providerLinks: [{ providerId: "agent_retell_888" }],
          }),
        },
        providerLink: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            createdRecords.providerLink.push(data);
            return data;
          },
        },
        auditLog: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            createdRecords.auditLog.push(data);
            return data;
          },
        },
      };
      return callback(tx);
    },
  } as unknown as Parameters<typeof createOrganizationAgent>[0]["db"];

  const result = await createOrganizationAgent({
    organizationId: "org-alpha",
    userId: "user-1",
    data: sampleAgentInput,
    idempotencyKey: "idem-key-1",
    retellClient: client,
    db: mockDb,
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.status, 201);
    assert.equal(result.agent.id, "local-agent-1");
    assert.equal(result.agent.retellAgentId, "agent_retell_888");
  }

  assert.equal(createdRecords.agent.length, 1);
  assert.equal(createdRecords.providerLink.length, 1);
  assert.equal(
    (createdRecords.providerLink[0] as Record<string, unknown>).providerId,
    "agent_retell_888",
  );
  assert.equal(
    (createdRecords.providerLink[0] as Record<string, unknown>).provider,
    "retell",
  );
  assert.equal(createdRecords.auditLog.length, 1);
});

test("createOrganizationAgent rolls back newly created Retell resources when database persistence fails", async () => {
  const deletedResources: string[] = [];

  const client = createRetellClient("mock-retell-key", async (input, init) => {
    const url = String(input);
    const method = init?.method?.toUpperCase() || "GET";

    if (method === "POST" && (url.includes("/llm") || url.includes("create-retell-llm"))) {
      return Response.json({ llm_id: "llm_fail_db" }, { status: 201 });
    }
    if (method === "POST" && (url.includes("/agent") || url.includes("create-agent"))) {
      return Response.json({ agent_id: "agent_fail_db", channel: "voice" }, { status: 201 });
    }
    if (method === "DELETE") {
      deletedResources.push(url);
      return new Response(null, { status: 204 });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  });

  const failingDb = {
    agent: {
      findFirst: async () => null,
    },
    $transaction: async () => {
      throw new Error("Database connection lost during commit");
    },
  } as unknown as Parameters<typeof createOrganizationAgent>[0]["db"];

  const result = await createOrganizationAgent({
    organizationId: "org-alpha",
    userId: "user-1",
    data: sampleAgentInput,
    retellClient: client,
    db: failingDb,
  });

  assert.equal(result.success, false);
  if (!result.success) {
    assert.equal(result.status, 500);
    assert.match(result.error, /Unable to save created agent/);
  }

  // Verify that the rollback deleted the newly created Retell agent and LLM
  assert.equal(deletedResources.length, 2);
  assert.ok(deletedResources.some((url) => url.includes("agent_fail_db")));
  assert.ok(deletedResources.some((url) => url.includes("llm_fail_db")));
});

test("createOrganizationAgent implements idempotency replay without re-calling Retell", async () => {
  let retellCalls = 0;

  const client = createRetellClient("mock-retell-key", async () => {
    retellCalls += 1;
    return Response.json({ agent_id: "agent_should_not_be_called" }, { status: 201 });
  });

  const existingAgentRecord = {
    id: "existing-agent-123",
    name: "Existing Agent",
    type: "Support",
    status: "active",
    timezone: "UTC",
    languages: ["English"],
    provider: "Deepgram",
    voiceName: "Aura-Asteria",
    speed: 1,
    greeting: "Hi",
    systemPrompt: "",
    fallback: "",
    kbLinks: "",
    kbFiles: [],
    kbFaqs: [],
    workingDays: [],
    hoursStart: null,
    hoursEnd: null,
    holidays: "",
    callsToday: 0,
    createdAt: new Date(),
    providerLinks: [{ providerId: "agent_retell_existing" }],
  };

  const dbWithExisting = {
    agent: {
      findFirst: async () => existingAgentRecord,
    },
  } as unknown as Parameters<typeof createOrganizationAgent>[0]["db"];

  const result = await createOrganizationAgent({
    organizationId: "org-alpha",
    userId: "user-1",
    data: sampleAgentInput,
    idempotencyKey: "already-used-idempotency-key",
    retellClient: client,
    db: dbWithExisting,
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.status, 200); // Idempotent match returns 200
    assert.equal(result.agent.id, "existing-agent-123");
    assert.equal(result.agent.retellAgentId, "agent_retell_existing");
  }

  assert.equal(retellCalls, 0, "Retell must NOT be called when idempotency key is already stored");
});

test("tenant isolation prevents replaying idempotency keys across organizations", async () => {
  let queriedOrgId: string | undefined;

  const client = createRetellClient("mock-retell-key", async (input) => {
    const url = String(input);
    if (url.includes("/llm") || url.includes("create-retell-llm")) {
      return Response.json({ llm_id: "llm_org_beta" }, { status: 201 });
    }
    return Response.json({ agent_id: "agent_org_beta", channel: "voice" }, { status: 201 });
  });

  const db = {
    agent: {
      findFirst: async ({ where }: { where: { organizationId?: string } }) => {
        queriedOrgId = where.organizationId;
        // Key exists in org-alpha, but query is for org-beta -> return null
        if (where.organizationId === "org-alpha") {
          return { id: "agent-in-alpha", providerLinks: [{ providerId: "retell-alpha" }] };
        }
        return null;
      },
    },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        agent: {
          create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "agent-in-beta", ...data }),
          findUniqueOrThrow: async () => ({
            id: "agent-in-beta",
            name: sampleAgentInput.name,
            type: sampleAgentInput.type,
            status: "active",
            timezone: "UTC",
            languages: [],
            provider: "Deepgram",
            voiceName: "Aura-Asteria",
            speed: 1,
            greeting: null,
            systemPrompt: null,
            fallback: null,
            kbLinks: null,
            kbFiles: [],
            kbFaqs: [],
            workingDays: [],
            hoursStart: null,
            hoursEnd: null,
            holidays: null,
            callsToday: 0,
            createdAt: new Date(),
            providerLinks: [{ providerId: "agent_org_beta" }],
          }),
        },
        providerLink: { create: async () => ({}) },
        auditLog: { create: async () => ({}) },
      };
      return callback(tx);
    },
  } as unknown as Parameters<typeof createOrganizationAgent>[0]["db"];

  const result = await createOrganizationAgent({
    organizationId: "org-beta",
    userId: "user-2",
    data: sampleAgentInput,
    idempotencyKey: "cross-tenant-key",
    retellClient: client,
    db,
  });

  assert.equal(queriedOrgId, "org-beta", "Must scope lookup strictly to caller organization");
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.agent.id, "agent-in-beta");
    assert.equal(result.agent.retellAgentId, "agent_org_beta");
  }
});

test("provider errors are mapped to safe user-facing error messages", () => {
  const timeoutFailure = getRetellAgentCreateFailure(
    new APIConnectionTimeoutError({ message: "Timed out" }),
  );
  assert.equal(timeoutFailure.status, 504);
  assert.match(timeoutFailure.message, /timed out/i);

  const connectionFailure = getRetellAgentCreateFailure(
    new APIConnectionError({ message: "Network connection refused" }),
  );
  assert.equal(connectionFailure.status, 502);
  assert.match(connectionFailure.message, /Could not connect to Retell/i);

  const authFailure = getRetellAgentCreateFailure(
    new APIError(401, { message: "Invalid key" }, "mock-key", new Headers()),
  );
  assert.equal(authFailure.status, 502);
  assert.match(authFailure.message, /RETELL_API_KEY is active/i);

  const rateLimitFailure = getRetellAgentCreateFailure(
    new APIError(429, { message: "Rate limit" }, "mock-key", new Headers()),
  );
  assert.equal(rateLimitFailure.status, 503);
  assert.match(rateLimitFailure.message, /rate-limited/i);

  const responseFailure = getRetellAgentCreateFailure(
    new RetellAgentCreateResponseError("Invalid agent creation response"),
  );
  assert.equal(responseFailure.status, 502);
});

test("getRetellApiKey returns null when missing without throwing", () => {
  assert.equal(getRetellApiKey({}), null);
  assert.equal(getRetellApiKey({ RETELL_API_KEY: "" }), null);
  assert.equal(getRetellApiKey({ RETELL_API_KEY: "   " }), null);
  assert.equal(getRetellApiKey({ RETELL_API_KEY: "active-key" }), "active-key");
});

test("concurrent duplicate submissions with the same idempotency key create only one Retell agent", async () => {
  let retellAgentCreations = 0;

  const client = createRetellClient("mock-retell-key", async (input) => {
    const url = String(input);
    if (url.includes("/llm") || url.includes("create-retell-llm")) {
      return Response.json({ llm_id: "llm_concurrent_test" }, { status: 201 });
    }
    // Simulate slight network delay
    await new Promise((resolve) => setTimeout(resolve, 50));
    retellAgentCreations += 1;
    return Response.json({ agent_id: "agent_concurrent_test", channel: "voice" }, { status: 201 });
  });

  const db = {
    agent: {
      findFirst: async () => null,
    },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        agent: {
          create: async ({ data }: { data: Record<string, unknown> }) => ({ id: "concurrent-agent", ...data }),
          findUniqueOrThrow: async () => ({
            id: "concurrent-agent",
            name: sampleAgentInput.name,
            type: sampleAgentInput.type,
            status: "active",
            timezone: "UTC",
            languages: [],
            provider: "Deepgram",
            voiceName: "Aura-Asteria",
            speed: 1,
            greeting: null,
            systemPrompt: null,
            fallback: null,
            kbLinks: null,
            kbFiles: [],
            kbFaqs: [],
            workingDays: [],
            hoursStart: null,
            hoursEnd: null,
            holidays: null,
            callsToday: 0,
            createdAt: new Date(),
            providerLinks: [{ providerId: "agent_concurrent_test" }],
          }),
        },
        providerLink: { create: async () => ({}) },
        auditLog: { create: async () => ({}) },
      };
      return callback(tx);
    },
  } as unknown as Parameters<typeof createOrganizationAgent>[0]["db"];

  const [res1, res2] = await Promise.all([
    createOrganizationAgent({
      organizationId: "org-alpha",
      userId: "user-1",
      data: sampleAgentInput,
      idempotencyKey: "concurrent-key-1",
      retellClient: client,
      db,
    }),
    createOrganizationAgent({
      organizationId: "org-alpha",
      userId: "user-1",
      data: sampleAgentInput,
      idempotencyKey: "concurrent-key-1",
      retellClient: client,
      db,
    }),
  ]);

  assert.equal(res1.success, true);
  assert.equal(res2.success, true);
  assert.equal(retellAgentCreations, 1, "Only one Retell agent must be created for concurrent duplicate requests");
});

