import test from "node:test";
import assert from "node:assert/strict";
import { APIConnectionError, APIConnectionTimeoutError, APIError } from "retell-sdk";
import type Retell from "retell-sdk";

import {
  deleteAgentPermanently,
  AgentNotFoundError,
  ActiveCallConflictError,
  RetellNotConfiguredError,
  RetellAgentDeleteError,
} from "../lib/server/agents/delete.ts";
import {
  deleteRetellAgent,
  getRetellAgentDeleteFailure,
} from "../lib/server/calls/retell.ts";

function createMockDb(initialData: {
  agents?: any[];
  calls?: any[];
  phoneNumbers?: any[];
  appointments?: any[];
  providerLinks?: any[];
  auditLogs?: any[];
} = {}) {
  const agents = JSON.parse(JSON.stringify(initialData.agents || []));
  const calls = JSON.parse(JSON.stringify(initialData.calls || []));
  const phoneNumbers = JSON.parse(JSON.stringify(initialData.phoneNumbers || []));
  const appointments = JSON.parse(JSON.stringify(initialData.appointments || []));
  const providerLinks = JSON.parse(JSON.stringify(initialData.providerLinks || []));
  const auditLogs = JSON.parse(JSON.stringify(initialData.auditLogs || []));

  const db: any = {
    agents,
    calls,
    phoneNumbers,
    appointments,
    providerLinks,
    auditLogs,
    agent: {
      findFirst: async ({ where, include }: any) => {
        const found = agents.find((a: any) => {
          if (where.id && a.id !== where.id) return false;
          if (where.organizationId && a.organizationId !== where.organizationId) return false;
          return true;
        });
        if (!found) return null;
        const res = { ...found };
        if (include?.providerLinks) {
          res.providerLinks = providerLinks.filter(
            (p: any) => p.agentId === found.id && (!include.providerLinks.where?.provider || p.provider === include.providerLinks.where.provider)
          );
        }
        return res;
      },
      delete: async ({ where }: any) => {
        const idx = agents.findIndex((a: any) => a.id === where.id);
        if (idx === -1) throw new Error("Agent not found");
        return agents.splice(idx, 1)[0];
      },
    },
    call: {
      findFirst: async ({ where }: any) => {
        return calls.find((c: any) => {
          if (where.organizationId && c.organizationId !== where.organizationId) return false;
          if (where.agentId && c.agentId !== where.agentId) return false;
          if (where.status?.in && !where.status.in.includes(c.status)) return false;
          return true;
        }) ?? null;
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const c of calls) {
          if (where.organizationId && c.organizationId !== where.organizationId) continue;
          if (where.agentId && c.agentId !== where.agentId) continue;
          Object.assign(c, data);
          count++;
        }
        return { count };
      },
    },
    phoneNumber: {
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const p of phoneNumbers) {
          if (where.organizationId && p.organizationId !== where.organizationId) continue;
          if (where.assignedAgentId && p.assignedAgentId !== where.assignedAgentId) continue;
          Object.assign(p, data);
          count++;
        }
        return { count };
      },
    },
    appointment: {
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const app of appointments) {
          if (where.organizationId && app.organizationId !== where.organizationId) continue;
          if (where.agentId && app.agentId !== where.agentId) continue;
          Object.assign(app, data);
          count++;
        }
        return { count };
      },
    },
    providerLink: {
      findFirst: async ({ where }: any) => {
        return providerLinks.find((p: any) => {
          if (where.provider && p.provider !== where.provider) return false;
          if (where.providerId && p.providerId !== where.providerId) return false;
          if (where.agentId?.not && p.agentId === where.agentId.not) return false;
          return true;
        }) ?? null;
      },
      deleteMany: async ({ where }: any) => {
        let count = 0;
        for (let i = providerLinks.length - 1; i >= 0; i--) {
          if (where.agentId && providerLinks[i].agentId === where.agentId) {
            providerLinks.splice(i, 1);
            count++;
          }
        }
        return { count };
      },
    },
    auditLog: {
      create: async ({ data }: any) => {
        auditLogs.push(data);
        return data;
      },
    },
    $transaction: async (fn: any) => {
      const snapAgents = JSON.parse(JSON.stringify(agents));
      const snapCalls = JSON.parse(JSON.stringify(calls));
      const snapPhones = JSON.parse(JSON.stringify(phoneNumbers));
      const snapAppointments = JSON.parse(JSON.stringify(appointments));
      const snapLinks = JSON.parse(JSON.stringify(providerLinks));
      const snapLogs = JSON.parse(JSON.stringify(auditLogs));

      try {
        return await fn(db);
      } catch (err) {
        agents.length = 0; agents.push(...snapAgents);
        calls.length = 0; calls.push(...snapCalls);
        phoneNumbers.length = 0; phoneNumbers.push(...snapPhones);
        appointments.length = 0; appointments.push(...snapAppointments);
        providerLinks.length = 0; providerLinks.push(...snapLinks);
        auditLogs.length = 0; auditLogs.push(...snapLogs);
        throw err;
      }
    },
  };

  return db;
}

function createMockRetellClient(options: {
  onDelete?: (agentId: string) => Promise<void> | void;
} = {}) {
  const deletedIds: string[] = [];
  const client = {
    agent: {
      delete: async (agentId: string) => {
        deletedIds.push(agentId);
        if (options.onDelete) {
          await options.onDelete(agentId);
        }
      },
    },
    deletedIds,
  };
  return client as unknown as Retell & { deletedIds: string[] };
}

// ---------------------------------------------------------------------------
// 1. Successful agent deletion cleans DB, Retell, unassigns refs, records audit log
// ---------------------------------------------------------------------------
test("1. Successful agent deletion cleans DB, deletes unshared Retell agent, unassigns relations, and records audit log", async () => {
  const retellClient = createMockRetellClient();
  const db = createMockDb({
    agents: [
      { id: "agent-boomi", organizationId: "org-1", name: "Boomi" },
      { id: "agent-sara", organizationId: "org-1", name: "sara" },
    ],
    providerLinks: [
      { id: "link-1", agentId: "agent-boomi", provider: "retell", providerId: "agent_retell_boomi_123" },
      { id: "link-2", agentId: "agent-sara", provider: "retell", providerId: "agent_retell_sara_456" },
    ],
    phoneNumbers: [
      { id: "phone-1", organizationId: "org-1", assignedAgentId: "agent-boomi", number: "+1234567890" },
      { id: "phone-2", organizationId: "org-1", assignedAgentId: "agent-sara", number: "+1987654321" },
    ],
    appointments: [
      { id: "apt-1", organizationId: "org-1", agentId: "agent-boomi", title: "AC repair" },
    ],
    calls: [
      { id: "call-1", organizationId: "org-1", agentId: "agent-boomi", status: "completed", transcript: "Hello" },
    ],
  });

  const result = await deleteAgentPermanently("agent-boomi", "org-1", "user-admin", {
    db,
    retellClient,
  });

  assert.deepEqual(result, {
    success: true,
    deleted: true,
    id: "agent-boomi",
    name: "Boomi",
  });

  // Retell deletion called with correct remote agent ID
  assert.deepEqual(retellClient.deletedIds, ["agent_retell_boomi_123"]);

  // Local agent removed
  assert.equal(db.agents.some((a: any) => a.id === "agent-boomi"), false);

  // ProviderLink removed
  assert.equal(db.providerLinks.some((l: any) => l.agentId === "agent-boomi"), false);

  // Phone number unassigned (not deleted!)
  const phone1 = db.phoneNumbers.find((p: any) => p.id === "phone-1");
  assert.equal(phone1.assignedAgentId, null);
  assert.equal(phone1.number, "+1234567890");

  // Appointment unassigned (not deleted!)
  const apt1 = db.appointments.find((a: any) => a.id === "apt-1");
  assert.equal(apt1.agentId, null);
  assert.equal(apt1.title, "AC repair");

  // Historical call record and transcript preserved
  const call1 = db.calls.find((c: any) => c.id === "call-1");
  assert.equal(call1.agentId, null);
  assert.equal(call1.status, "completed");
  assert.equal(call1.transcript, "Hello");

  // Audit log recorded
  assert.equal(db.auditLogs.length, 1);
  assert.deepEqual(db.auditLogs[0], {
    organizationId: "org-1",
    userId: "user-admin",
    entity: "Agent",
    action: "DELETE",
    details: {
      agentId: "agent-boomi",
      name: "Boomi",
      retellAgentId: "agent_retell_boomi_123",
    },
  });
});

// ---------------------------------------------------------------------------
// 2. Retell failure aborts deletion and leaves DB untouched
// ---------------------------------------------------------------------------
test("2. Retell failure aborts DB deletion and returns clear error without modifying database", async () => {
  const retellClient = createMockRetellClient({
    onDelete: () => {
      throw new APIError(500, { message: "Internal server error on Retell" }, "key", new Headers());
    },
  });

  const db = createMockDb({
    agents: [{ id: "agent-boomi", organizationId: "org-1", name: "Boomi" }],
    providerLinks: [{ id: "link-1", agentId: "agent-boomi", provider: "retell", providerId: "agent_retell_boomi" }],
    phoneNumbers: [{ id: "phone-1", organizationId: "org-1", assignedAgentId: "agent-boomi" }],
  });

  await assert.rejects(
    deleteAgentPermanently("agent-boomi", "org-1", "user-admin", { db, retellClient }),
    (err: any) => {
      assert.ok(err instanceof RetellAgentDeleteError);
      assert.equal(err.status, 502);
      assert.match(err.message, /Retell is temporarily unavailable \(HTTP 500\)/);
      return true;
    },
  );

  // Database must remain intact!
  assert.equal(db.agents.length, 1);
  assert.equal(db.agents[0].id, "agent-boomi");
  assert.equal(db.providerLinks.length, 1);
  assert.equal(db.phoneNumbers[0].assignedAgentId, "agent-boomi");
  assert.equal(db.auditLogs.length, 0);
});

// ---------------------------------------------------------------------------
// 3. Deleting Boomi does not delete or affect sara
// ---------------------------------------------------------------------------
test("3. Deleting Boomi does not delete or touch sara", async () => {
  const retellClient = createMockRetellClient();
  const db = createMockDb({
    agents: [
      { id: "agent-boomi", organizationId: "org-1", name: "Boomi" },
      { id: "agent-sara", organizationId: "org-1", name: "sara" },
    ],
    providerLinks: [
      { id: "link-1", agentId: "agent-boomi", provider: "retell", providerId: "retell_boomi" },
      { id: "link-2", agentId: "agent-sara", provider: "retell", providerId: "retell_sara" },
    ],
    phoneNumbers: [
      { id: "phone-1", organizationId: "org-1", assignedAgentId: "agent-boomi" },
      { id: "phone-2", organizationId: "org-1", assignedAgentId: "agent-sara" },
    ],
  });

  await deleteAgentPermanently("agent-boomi", "org-1", "user-admin", { db, retellClient });

  // Only Boomi was sent to Retell
  assert.deepEqual(retellClient.deletedIds, ["retell_boomi"]);

  // Sara remains completely untouched in DB
  const remainingAgent = db.agents.find((a: any) => a.id === "agent-sara");
  assert.ok(remainingAgent);
  assert.equal(remainingAgent.name, "sara");

  const saraLink = db.providerLinks.find((l: any) => l.agentId === "agent-sara");
  assert.ok(saraLink);
  assert.equal(saraLink.providerId, "retell_sara");

  const saraPhone = db.phoneNumbers.find((p: any) => p.id === "phone-2");
  assert.equal(saraPhone.assignedAgentId, "agent-sara");
});

// ---------------------------------------------------------------------------
// 4. Tenant isolation: Organization A cannot delete Organization B's agent
// ---------------------------------------------------------------------------
test("4. Tenant isolation rejects deleting an agent belonging to a different organization", async () => {
  const db = createMockDb({
    agents: [{ id: "agent-org-b", organizationId: "org-b", name: "Other Org Agent" }],
  });

  await assert.rejects(
    deleteAgentPermanently("agent-org-b", "org-a", "user-org-a", { db }),
    (err: any) => {
      assert.ok(err instanceof AgentNotFoundError);
      assert.equal(err.status, 404);
      return true;
    },
  );

  // Agent was not deleted
  assert.equal(db.agents.length, 1);
});

// ---------------------------------------------------------------------------
// 5. Active call protection: returns 409 conflict when agent is on an active call
// ---------------------------------------------------------------------------
test("5. Active call in progress blocks deletion with 409 Conflict", async () => {
  const db = createMockDb({
    agents: [{ id: "agent-busy", organizationId: "org-1", name: "Busy Agent" }],
    calls: [
      { id: "call-live", organizationId: "org-1", agentId: "agent-busy", status: "ongoing" },
    ],
  });

  await assert.rejects(
    deleteAgentPermanently("agent-busy", "org-1", "user-admin", { db }),
    (err: any) => {
      assert.ok(err instanceof ActiveCallConflictError);
      assert.equal(err.status, 409);
      assert.match(err.message, /active calls in progress/i);
      return true;
    },
  );

  // Agent was not deleted
  assert.equal(db.agents.length, 1);
});

// ---------------------------------------------------------------------------
// 6. Shared Retell agent: if two local agents share the same Retell agent, do not delete remote Retell agent
// ---------------------------------------------------------------------------
test("6. Shared Retell agent is not deleted remotely when another local agent uses it", async () => {
  const retellClient = createMockRetellClient();
  const db = createMockDb({
    agents: [
      { id: "agent-1", organizationId: "org-1", name: "Agent 1" },
      { id: "agent-2", organizationId: "org-1", name: "Agent 2" },
    ],
    providerLinks: [
      { id: "link-1", agentId: "agent-1", provider: "retell", providerId: "shared_retell_id" },
      { id: "link-2", agentId: "agent-2", provider: "retell", providerId: "shared_retell_id" },
    ],
  });

  const result = await deleteAgentPermanently("agent-1", "org-1", "user-admin", {
    db,
    retellClient,
  });

  assert.equal(result.success, true);
  // Did NOT call Retell delete because agent-2 still shares it
  assert.deepEqual(retellClient.deletedIds, []);
  // Local agent-1 is deleted, agent-2 remains
  assert.equal(db.agents.length, 1);
  assert.equal(db.agents[0].id, "agent-2");
});

// ---------------------------------------------------------------------------
// 7. Retell 404 Not Found treated as success and local cleanup proceeds
// ---------------------------------------------------------------------------
test("7. Retell 404 Not Found treated as success and local DB cleanup proceeds", async () => {
  const retellClient = createMockRetellClient({
    onDelete: () => {
      throw new APIError(404, { message: "Agent not found" }, "key", new Headers());
    },
  });

  const db = createMockDb({
    agents: [{ id: "agent-missing-on-retell", organizationId: "org-1", name: "Old Agent" }],
    providerLinks: [{ id: "link-1", agentId: "agent-missing-on-retell", provider: "retell", providerId: "retell_deleted_already" }],
  });

  const result = await deleteAgentPermanently("agent-missing-on-retell", "org-1", "user-admin", {
    db,
    retellClient,
  });

  assert.equal(result.success, true);
  assert.equal(db.agents.length, 0);
  assert.equal(db.providerLinks.length, 0);
});

// ---------------------------------------------------------------------------
// 8. Missing RETELL_API_KEY when linked Retell agent needs deletion throws RetellNotConfiguredError (503)
// ---------------------------------------------------------------------------
test("8. Missing RETELL_API_KEY when deleting linked Retell agent throws RetellNotConfiguredError (503)", async () => {
  const db = createMockDb({
    agents: [{ id: "agent-with-retell", organizationId: "org-1", name: "Retell Linked" }],
    providerLinks: [{ id: "link-1", agentId: "agent-with-retell", provider: "retell", providerId: "retell_agent_123" }],
  });

  await assert.rejects(
    deleteAgentPermanently("agent-with-retell", "org-1", "user-admin", {
      db,
      environment: {}, // No RETELL_API_KEY
    }),
    (err: any) => {
      assert.ok(err instanceof RetellNotConfiguredError);
      assert.equal(err.status, 503);
      return true;
    },
  );

  // DB unchanged
  assert.equal(db.agents.length, 1);
});

// ---------------------------------------------------------------------------
// 9. Retell error mapping converts SDK errors to safe HTTP status codes without leaking credentials
// ---------------------------------------------------------------------------
test("9. Retell error mapping converts failures to safe HTTP errors and masks sensitive data", () => {
  const secretKey = "secret-retell-token-xyz";

  // Timeout -> 504
  const timeoutFailure = getRetellAgentDeleteFailure(new APIConnectionTimeoutError({ message: `timeout with ${secretKey}` }));
  assert.equal(timeoutFailure.status, 504);
  assert.match(timeoutFailure.message, /timed out/i);
  assert.equal(JSON.stringify(timeoutFailure).includes(secretKey), false);

  // Connection error -> 502
  const connFailure = getRetellAgentDeleteFailure(new APIConnectionError({ message: `failed to connect with ${secretKey}` }));
  assert.equal(connFailure.status, 502);
  assert.match(connFailure.message, /Could not connect to Retell/i);

  // Auth 401 -> 502
  const authFailure = getRetellAgentDeleteFailure(new APIError(401, { message: `bad key ${secretKey}` }, secretKey, new Headers()));
  assert.equal(authFailure.status, 502);
  assert.match(authFailure.message, /Verify RETELL_API_KEY/i);
  assert.equal(JSON.stringify(authFailure).includes(secretKey), false);

  // Forbidden 403 -> 502
  const permFailure = getRetellAgentDeleteFailure(new APIError(403, { message: `forbidden ${secretKey}` }, secretKey, new Headers()));
  assert.equal(permFailure.status, 502);
  assert.match(permFailure.message, /does not have permission/i);

  // Rate limit 429 -> 503
  const rateFailure = getRetellAgentDeleteFailure(new APIError(429, { message: "rate limited" }, secretKey, new Headers()));
  assert.equal(rateFailure.status, 503);
  assert.match(rateFailure.message, /rate-limited/i);

  // Upstream 503 -> 502
  const upstreamFailure = getRetellAgentDeleteFailure(new APIError(503, { message: "Service Unavailable" }, secretKey, new Headers()));
  assert.equal(upstreamFailure.status, 502);
  assert.match(upstreamFailure.message, /temporarily unavailable \(HTTP 503\)/i);
});

// ---------------------------------------------------------------------------
// 10. deleteRetellAgent swallows 404 but rethrows other errors
// ---------------------------------------------------------------------------
test("10. deleteRetellAgent swallows 404 but throws other errors", async () => {
  const notFoundClient = createMockRetellClient({
    onDelete: () => {
      throw new APIError(404, { message: "Agent not found" }, "key", new Headers());
    },
  });

  // Does not throw for 404
  await deleteRetellAgent(notFoundClient, "agent-not-found");

  const serverErrorClient = createMockRetellClient({
    onDelete: () => {
      throw new APIError(500, { message: "Server error" }, "key", new Headers());
    },
  });

  await assert.rejects(
    deleteRetellAgent(serverErrorClient, "agent-err"),
    (err: any) => err instanceof APIError && err.status === 500,
  );
});

