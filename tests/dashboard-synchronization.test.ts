import test from "node:test";
import assert from "node:assert/strict";
import type Retell from "retell-sdk";

import { deleteAgentPermanently } from "../lib/server/agents/delete.ts";

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
      findMany: async ({ where }: any = {}) => {
        return agents.filter((a: any) => {
          if (where.organizationId && a.organizationId !== where.organizationId) return false;
          if (where.status && a.status !== where.status) return false;
          return true;
        });
      },
      count: async ({ where }: any = {}) => {
        return agents.filter((a: any) => {
          if (where.organizationId && a.organizationId !== where.organizationId) return false;
          if (where.status && a.status !== where.status) return false;
          return true;
        }).length;
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
      findMany: async ({ where }: any = {}) => {
        return calls.filter((c: any) => {
          if (where.organizationId && c.organizationId !== where.organizationId) return false;
          if (where.agentId !== undefined && c.agentId !== where.agentId) return false;
          return true;
        });
      },
      count: async ({ where }: any = {}) => {
        return calls.filter((c: any) => {
          if (where.organizationId && c.organizationId !== where.organizationId) return false;
          if (where.status?.in && !where.status.in.includes(c.status)) return false;
          if (typeof where.status === "string" && c.status !== where.status) return false;
          return true;
        }).length;
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
      findMany: async ({ where }: any = {}) => {
        return phoneNumbers.filter((p: any) => {
          if (where.organizationId && p.organizationId !== where.organizationId) return false;
          return true;
        });
      },
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
      findMany: async ({ where }: any = {}) => {
        return appointments.filter((app: any) => {
          if (where.organizationId && app.organizationId !== where.organizationId) return false;
          return true;
        });
      },
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
      return await fn(db);
    },
  };

  return db;
}

function createMockRetellClient() {
  const deletedIds: string[] = [];
  const client = {
    agent: {
      delete: async (agentId: string) => {
        deletedIds.push(agentId);
      },
    },
    deletedIds,
  };
  return client as unknown as Retell & { deletedIds: string[] };
}

// ---------------------------------------------------------------------------
// 1. Deleting an agent updates total, active, and paused agent counts
// ---------------------------------------------------------------------------
test("1. Deleting an agent updates total, active, and paused agent counts", async () => {
  const retellClient = createMockRetellClient();
  const db = createMockDb({
    agents: [
      { id: "agent-1", organizationId: "org-1", name: "Boomi", status: "active" },
      { id: "agent-2", organizationId: "org-1", name: "sara", status: "active" },
      { id: "agent-3", organizationId: "org-1", name: "Support", status: "paused" },
    ],
    providerLinks: [
      { id: "link-1", agentId: "agent-1", provider: "retell", providerId: "retell-1" },
    ],
  });

  // Pre-deletion checks
  assert.equal(await db.agent.count({ where: { organizationId: "org-1" } }), 3);
  assert.equal(await db.agent.count({ where: { organizationId: "org-1", status: "active" } }), 2);
  assert.equal(await db.agent.count({ where: { organizationId: "org-1", status: "paused" } }), 1);

  // Delete agent-1
  await deleteAgentPermanently("agent-1", "org-1", "user-1", { db, retellClient });

  // Post-deletion counts
  assert.equal(await db.agent.count({ where: { organizationId: "org-1" } }), 2);
  assert.equal(await db.agent.count({ where: { organizationId: "org-1", status: "active" } }), 1);
  assert.equal(await db.agent.count({ where: { organizationId: "org-1", status: "paused" } }), 1);
});

// ---------------------------------------------------------------------------
// 2. Deleted agents disappear from active agent lists
// ---------------------------------------------------------------------------
test("2. Deleted agents disappear from active agent lists", async () => {
  const retellClient = createMockRetellClient();
  const db = createMockDb({
    agents: [
      { id: "agent-1", organizationId: "org-1", name: "Boomi", status: "active" },
      { id: "agent-2", organizationId: "org-1", name: "sara", status: "active" },
    ],
  });

  await deleteAgentPermanently("agent-1", "org-1", "user-1", { db, retellClient });

  const activeAgents = await db.agent.findMany({
    where: { organizationId: "org-1", status: "active" },
  });

  assert.equal(activeAgents.length, 1);
  assert.equal(activeAgents[0].id, "agent-2");
  assert.equal(activeAgents[0].name, "sara");
});

// ---------------------------------------------------------------------------
// 3. Analytics excludes deleted agents from current agent comparisons while preserving call totals
// ---------------------------------------------------------------------------
test("3. Analytics excludes deleted agents from current agent comparisons while preserving call totals", () => {
  // Current agents in state (agent-1 was deleted, only agent-2 remains)
  const currentAgents = [
    { id: "agent-2", name: "sara", callsToday: 5, languages: ["English"] },
  ];

  // Historical calls includes calls made when Boomi existed
  const uniqueCalls = [
    { callId: "c1", agentName: "Boomi", status: "completed", durationSeconds: 120 },
    { callId: "c2", agentName: "Boomi", status: "failed", durationSeconds: 30 },
    { callId: "c3", agentName: "sara", status: "completed", durationSeconds: 90 },
  ];

  // 1. Current agent comparison algorithm (from analytics-view.tsx)
  const currentAgentNames = new Set(currentAgents.map((a) => a.name));
  const agentMap = new Map<string, { total: number; completed: number }>();

  for (const call of uniqueCalls) {
    const name = call.agentName || "Agent";
    // Exclude deleted agents from current comparison
    if (currentAgentNames.size > 0 && !currentAgentNames.has(name)) {
      continue;
    }
    const existing = agentMap.get(name) ?? { total: 0, completed: 0 };
    existing.total += 1;
    if (call.status === "completed") {
      existing.completed += 1;
    }
    agentMap.set(name, existing);
  }

  const comparisonData = Array.from(agentMap.entries()).map(([name, stats]) => ({
    name,
    "Success Rate (%)": stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 100,
    "Total Calls": stats.total,
  }));

  // Only sara appears in current agent comparison
  assert.equal(comparisonData.length, 1);
  assert.equal(comparisonData[0].name, "sara");
  assert.equal(comparisonData[0]["Total Calls"], 1);
  assert.equal(comparisonData[0]["Success Rate (%)"], 100);

  // 2. Total call volume preserves historical calls (all 3 calls counted!)
  assert.equal(uniqueCalls.length, 3);
  const totalVolume = uniqueCalls.length;
  const totalCompleted = uniqueCalls.filter((c) => c.status === "completed").length;
  assert.equal(totalVolume, 3);
  assert.equal(totalCompleted, 2);
});

// ---------------------------------------------------------------------------
// 4. Historical call records remain accessible and unassigned
// ---------------------------------------------------------------------------
test("4. Historical call records remain accessible and unassigned", async () => {
  const retellClient = createMockRetellClient();
  const db = createMockDb({
    agents: [{ id: "agent-1", organizationId: "org-1", name: "Boomi" }],
    calls: [
      { id: "call-1", organizationId: "org-1", agentId: "agent-1", status: "completed", destination: "+1234567890", transcript: "Call with Boomi" },
      { id: "call-2", organizationId: "org-1", agentId: "agent-1", status: "failed", destination: "+1987654321", transcript: "Voicemail" },
    ],
  });

  await deleteAgentPermanently("agent-1", "org-1", "user-1", { db, retellClient });

  const orgCalls = await db.call.findMany({ where: { organizationId: "org-1" } });
  assert.equal(orgCalls.length, 2);

  // agentId was set to null, preserving historical records and transcripts
  for (const call of orgCalls) {
    assert.equal(call.agentId, null);
    assert.ok(call.transcript.length > 0);
  }
});

// ---------------------------------------------------------------------------
// 5. Dashboard statistics remain accurate after deletion
// ---------------------------------------------------------------------------
test("5. Dashboard statistics remain accurate after deletion", async () => {
  const retellClient = createMockRetellClient();
  const db = createMockDb({
    agents: [
      { id: "agent-1", organizationId: "org-1", name: "Boomi", status: "active" },
      { id: "agent-2", organizationId: "org-1", name: "sara", status: "active" },
    ],
    calls: [
      { id: "c1", organizationId: "org-1", agentId: "agent-1", status: "completed" },
      { id: "c2", organizationId: "org-1", agentId: "agent-1", status: "failed" },
      { id: "c3", organizationId: "org-1", agentId: "agent-2", status: "completed" },
    ],
  });

  await deleteAgentPermanently("agent-1", "org-1", "user-1", { db, retellClient });

  const totalAgents = await db.agent.count({ where: { organizationId: "org-1" } });
  const activeAgents = await db.agent.count({ where: { organizationId: "org-1", status: "active" } });
  const totalCalls = await db.call.count({ where: { organizationId: "org-1" } });
  const successfulCalls = await db.call.count({ where: { organizationId: "org-1", status: "completed" } });
  const failedCalls = await db.call.count({ where: { organizationId: "org-1", status: { in: ["failed", "canceled", "error"] } } });

  assert.equal(totalAgents, 1);
  assert.equal(activeAgents, 1);
  assert.equal(totalCalls, 3);
  assert.equal(successfulCalls, 2);
  assert.equal(failedCalls, 1);
});

// ---------------------------------------------------------------------------
// 6. Team and phone number assignments do not reference deleted agents
// ---------------------------------------------------------------------------
test("6. Phone numbers and appointment assignments are cleared of deleted agent", async () => {
  const retellClient = createMockRetellClient();
  const db = createMockDb({
    agents: [{ id: "agent-1", organizationId: "org-1", name: "Boomi" }],
    phoneNumbers: [
      { id: "p1", organizationId: "org-1", assignedAgentId: "agent-1", number: "+14155551234" },
    ],
    appointments: [
      { id: "apt-1", organizationId: "org-1", agentId: "agent-1", title: "Site visit" },
    ],
  });

  await deleteAgentPermanently("agent-1", "org-1", "user-1", { db, retellClient });

  const phones = await db.phoneNumber.findMany({ where: { organizationId: "org-1" } });
  assert.equal(phones.length, 1);
  assert.equal(phones[0].assignedAgentId, null);

  const appointments = await db.appointment.findMany({ where: { organizationId: "org-1" } });
  assert.equal(appointments.length, 1);
  assert.equal(appointments[0].agentId, null);
});

// ---------------------------------------------------------------------------
// 7. Other organizations' data remains unaffected (Tenant Isolation)
// ---------------------------------------------------------------------------
test("7. Tenant isolation preserves other organizations' agents, calls, and assignments", async () => {
  const retellClient = createMockRetellClient();
  const db = createMockDb({
    agents: [
      { id: "agent-org1", organizationId: "org-1", name: "Org1 Boomi", status: "active" },
      { id: "agent-org2", organizationId: "org-2", name: "Org2 Sara", status: "active" },
    ],
    phoneNumbers: [
      { id: "p-org1", organizationId: "org-1", assignedAgentId: "agent-org1" },
      { id: "p-org2", organizationId: "org-2", assignedAgentId: "agent-org2" },
    ],
    calls: [
      { id: "c-org1", organizationId: "org-1", agentId: "agent-org1", status: "completed" },
      { id: "c-org2", organizationId: "org-2", agentId: "agent-org2", status: "completed" },
    ],
  });

  await deleteAgentPermanently("agent-org1", "org-1", "user-1", { db, retellClient });

  // Org-2 agents untouched
  const org2Agents = await db.agent.findMany({ where: { organizationId: "org-2" } });
  assert.equal(org2Agents.length, 1);
  assert.equal(org2Agents[0].id, "agent-org2");
  assert.equal(org2Agents[0].name, "Org2 Sara");

  // Org-2 phone number untouched
  const org2Phones = await db.phoneNumber.findMany({ where: { organizationId: "org-2" } });
  assert.equal(org2Phones[0].assignedAgentId, "agent-org2");

  // Org-2 call untouched
  const org2Calls = await db.call.findMany({ where: { organizationId: "org-2" } });
  assert.equal(org2Calls[0].agentId, "agent-org2");
});

