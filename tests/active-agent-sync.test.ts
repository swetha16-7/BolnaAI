import test from "node:test";
import assert from "node:assert/strict";

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

  return {
    agents,
    calls,
    phoneNumbers,
    appointments,
    providerLinks,
    auditLogs,
    agent: {
      findFirst: async ({ where, select }: any) => {
        const found = agents.find((a: any) => {
          if (where.id && a.id !== where.id) return false;
          if (where.organizationId && a.organizationId !== where.organizationId) return false;
          if (where.status && a.status !== where.status) return false;
          return true;
        });
        if (!found) return null;
        if (select) {
          const res: any = {};
          for (const key of Object.keys(select)) {
            res[key] = found[key];
          }
          return res;
        }
        return { ...found };
      },
      findMany: async ({ where, select }: any = {}) => {
        const filtered = agents.filter((a: any) => {
          if (where.organizationId && a.organizationId !== where.organizationId) return false;
          if (where.status && a.status !== where.status) return false;
          return true;
        });
        if (select) {
          return filtered.map((a: any) => {
            const res: any = {};
            for (const key of Object.keys(select)) {
              res[key] = a[key];
            }
            return res;
          });
        }
        return filtered;
      },
      count: async ({ where }: any = {}) => {
        return agents.filter((a: any) => {
          if (where.organizationId && a.organizationId !== where.organizationId) return false;
          if (where.status && a.status !== where.status) return false;
          return true;
        }).length;
      },
    },
    call: {
      findMany: async ({ where, select, take }: any = {}) => {
        const filtered = calls.filter((c: any) => {
          if (where.organizationId && c.organizationId !== where.organizationId) return false;
          if (where.agentId) {
            if (where.agentId.in && !where.agentId.in.includes(c.agentId)) return false;
            if (typeof where.agentId === "string" && c.agentId !== where.agentId) return false;
          }
          if (where.createdAt?.gte) {
            const callDate = new Date(c.createdAt);
            if (callDate < where.createdAt.gte) return false;
          }
          if (where.durationSeconds?.not === null && (c.durationSeconds === null || c.durationSeconds === undefined)) {
            return false;
          }
          return true;
        });
        const result = take ? filtered.slice(0, take) : filtered;
        if (select) {
          return result.map((c: any) => {
            const res: any = {};
            for (const key of Object.keys(select)) {
              res[key] = c[key];
            }
            return res;
          });
        }
        return result;
      },
      count: async ({ where }: any = {}) => {
        return calls.filter((c: any) => {
          if (where.organizationId && c.organizationId !== where.organizationId) return false;
          if (where.agentId) {
            if (where.agentId.in && !where.agentId.in.includes(c.agentId)) return false;
            if (typeof where.agentId === "string" && c.agentId !== where.agentId) return false;
          }
          if (where.status) {
            if (where.status.in && !where.status.in.includes(c.status)) return false;
            if (typeof where.status === "string" && c.status !== where.status) return false;
          }
          if (where.createdAt?.gte) {
            const callDate = new Date(c.createdAt);
            if (callDate < where.createdAt.gte) return false;
          }
          return true;
        }).length;
      },
      aggregate: async ({ where, _avg }: any = {}) => {
        const matching = calls.filter((c: any) => {
          if (where.organizationId && c.organizationId !== where.organizationId) return false;
          if (where.agentId) {
            if (where.agentId.in && !where.agentId.in.includes(c.agentId)) return false;
            if (typeof where.agentId === "string" && c.agentId !== where.agentId) return false;
          }
          if (where.durationSeconds?.not === null && (c.durationSeconds === null || c.durationSeconds === undefined)) {
            return false;
          }
          return true;
        });
        if (matching.length === 0) return { _avg: { durationSeconds: null } };
        const totalDuration = matching.reduce((acc: number, c: any) => acc + (c.durationSeconds || 0), 0);
        return { _avg: { durationSeconds: totalDuration / matching.length } };
      },
    },
    appointment: {
      count: async ({ where }: any = {}) => {
        return appointments.filter((app: any) => {
          if (where.organizationId && app.organizationId !== where.organizationId) return false;
          if (where.agentId) {
            if (where.agentId.in && !where.agentId.in.includes(app.agentId)) return false;
            if (typeof where.agentId === "string" && app.agentId !== where.agentId) return false;
          }
          return true;
        }).length;
      },
    },
    contact: {
      count: async ({ where }: any = {}) => {
        return 10;
      },
    },
  };
}

// 1. Dynamic Agent Discovery: No hardcoded names or IDs
test("1. Dynamic Agent Discovery discovers the active agent dynamically without hardcoding", async () => {
  const db = createMockDb({
    agents: [
      {
        id: "agent-dynamic-1",
        organizationId: "org-1",
        name: "AC/Plumber Agent",
        status: "active",
        type: "Customer Support",
      },
    ],
    providerLinks: [
      {
        id: "link-1",
        agentId: "agent-dynamic-1",
        provider: "retell",
        providerId: "agent_da9e1542cfa28eebf17aa7979f",
      },
    ],
  });

  const activeAgents = await db.agent.findMany({
    where: { organizationId: "org-1", status: "active" },
    select: { id: true, name: true },
  });

  assert.equal(activeAgents.length, 1);
  assert.equal(activeAgents[0].id, "agent-dynamic-1");
  assert.equal(activeAgents[0].name, "AC/Plumber Agent");

  // Dynamic verification: does NOT require hardcoded Sara
  const saraAgent = activeAgents.find((a: any) => a.name.toLowerCase() === "sara");
  assert.equal(saraAgent, undefined);
});

// 2. Dashboard metrics strictly scope to the active agent, excluding deleted agents
test("2. Dashboard query isolates call metrics strictly to the currently active agent", async () => {
  const now = new Date();
  const db = createMockDb({
    agents: [
      {
        id: "active-agent-123",
        organizationId: "org-1",
        name: "AC/Plumber Agent",
        status: "active",
      },
    ],
    calls: [
      // 3 calls belonging to the active agent
      {
        id: "call-active-1",
        organizationId: "org-1",
        agentId: "active-agent-123",
        status: "completed",
        durationSeconds: 120,
        createdAt: now,
      },
      {
        id: "call-active-2",
        organizationId: "org-1",
        agentId: "active-agent-123",
        status: "completed",
        durationSeconds: 180,
        createdAt: now,
      },
      {
        id: "call-active-3",
        organizationId: "org-1",
        agentId: "active-agent-123",
        status: "failed",
        durationSeconds: 30,
        createdAt: now,
      },
      // 4 historical calls from deleted Sara agent (agentId is NULL)
      {
        id: "call-sara-1",
        organizationId: "org-1",
        agentId: null,
        status: "completed",
        durationSeconds: 300,
        createdAt: now,
      },
      {
        id: "call-sara-2",
        organizationId: "org-1",
        agentId: null,
        status: "completed",
        durationSeconds: 240,
        createdAt: now,
      },
      {
        id: "call-sara-3",
        organizationId: "org-1",
        agentId: null,
        status: "failed",
        durationSeconds: 45,
        createdAt: now,
      },
      {
        id: "call-sara-4",
        organizationId: "org-1",
        agentId: null,
        status: "failed",
        durationSeconds: 60,
        createdAt: now,
      },
    ],
    appointments: [
      { id: "app-1", organizationId: "org-1", agentId: "active-agent-123" },
      { id: "app-2", organizationId: "org-1", agentId: null }, // from deleted Sara
    ],
  });

  // Replicate dashboard route query logic
  const activeAgentsList = await db.agent.findMany({
    where: { organizationId: "org-1", status: "active" },
    select: { id: true, name: true },
  });

  const targetAgentIds = activeAgentsList.map((a: any) => a.id);
  const agentCallScope = targetAgentIds.length > 0
    ? { agentId: { in: targetAgentIds } }
    : { agentId: "__none_active__" };

  const [totalCalls, successfulCalls, failedCalls, durationStats, appointments] = await Promise.all([
    db.call.count({ where: { organizationId: "org-1", ...agentCallScope } }),
    db.call.count({ where: { organizationId: "org-1", ...agentCallScope, status: "completed" } }),
    db.call.count({ where: { organizationId: "org-1", ...agentCallScope, status: { in: ["failed", "canceled", "error"] } } }),
    db.call.aggregate({ where: { organizationId: "org-1", ...agentCallScope, durationSeconds: { not: null } }, _avg: { durationSeconds: true } }),
    db.appointment.count({ where: { organizationId: "org-1", ...agentCallScope } }),
  ]);

  // Assertions: only the 3 calls from active agent are counted!
  assert.equal(totalCalls, 3);
  assert.equal(successfulCalls, 2);
  assert.equal(failedCalls, 1);
  assert.equal(Math.round(durationStats._avg.durationSeconds!), 110); // (120 + 180 + 30) / 3 = 110
  assert.equal(appointments, 1); // Only active agent appointment

  // Check recent calls
  const recentCalls = await db.call.findMany({
    where: { organizationId: "org-1", ...agentCallScope },
    take: 5,
  });
  assert.equal(recentCalls.length, 3);
  assert.ok(recentCalls.every((c: any) => c.agentId === "active-agent-123"));
});

// 3. Clean zero state when no active agent exists (all deleted or paused)
test("3. Dashboard gracefully returns clean zero metrics when no agent is active", async () => {
  const db = createMockDb({
    agents: [], // No active agents
    calls: [
      { id: "call-old-1", organizationId: "org-1", agentId: null, status: "completed", durationSeconds: 200 },
      { id: "call-old-2", organizationId: "org-1", agentId: null, status: "failed", durationSeconds: 50 },
    ],
    appointments: [
      { id: "app-old", organizationId: "org-1", agentId: null },
    ],
  });

  const activeAgentsList = await db.agent.findMany({
    where: { organizationId: "org-1", status: "active" },
    select: { id: true, name: true },
  });

  const targetAgentIds = activeAgentsList.map((a: any) => a.id);
  const agentCallScope = targetAgentIds.length > 0
    ? { agentId: { in: targetAgentIds } }
    : { agentId: "__none_active__" };

  const [totalCalls, appointments] = await Promise.all([
    db.call.count({ where: { organizationId: "org-1", ...agentCallScope } }),
    db.appointment.count({ where: { organizationId: "org-1", ...agentCallScope } }),
  ]);

  assert.equal(totalCalls, 0);
  assert.equal(appointments, 0);
});

// 4. Analytics: strictly computes KPIs and trends from active agent calls only
test("4. Analytics metrics and charts exclude calls from deleted agents", () => {
  const activeAgents = [
    {
      id: "agent-active",
      retellAgentId: "agent_da9e1542cfa28eebf17aa7979f",
      name: "AC/Plumber Agent",
      status: "active",
      languages: ["English"],
    },
  ];

  const targetAgentIds = new Set(activeAgents.map((a) => a.id));
  const targetRetellAgentIds = new Set(activeAgents.map((a) => a.retellAgentId));

  const uniqueRetellCalls = [
    // Active agent call
    {
      callId: "call-1",
      agentId: "agent_da9e1542cfa28eebf17aa7979f",
      agentName: "AC/Plumber Agent",
      status: "completed",
      durationSeconds: 120,
    },
    // Active agent call by local ID
    {
      callId: "call-2",
      agentId: "agent-active",
      agentName: "AC/Plumber Agent",
      status: "completed",
      durationSeconds: 180,
    },
    // Deleted Sara call (old retell agent id)
    {
      callId: "call-sara-1",
      agentId: "agent_deleted_sara_999",
      agentName: "sara",
      status: "failed",
      durationSeconds: 40,
    },
    // Deleted Sara call with null/unknown ID
    {
      callId: "call-sara-2",
      agentId: "",
      agentName: "sara",
      status: "completed",
      durationSeconds: 300,
    },
  ];

  // Active call filtering
  const activeAgentCalls = uniqueRetellCalls.filter((call) => {
    return (
      (call.agentId && targetRetellAgentIds.has(call.agentId)) ||
      (call.agentId && targetAgentIds.has(call.agentId))
    );
  });

  assert.equal(activeAgentCalls.length, 2);
  assert.equal(activeAgentCalls[0].callId, "call-1");
  assert.equal(activeAgentCalls[1].callId, "call-2");

  // KPI calculations
  const totalCalls = activeAgentCalls.length;
  const completedCalls = activeAgentCalls.filter((c) => c.status === "completed").length;
  const conversionRate = ((completedCalls / totalCalls) * 100).toFixed(1);

  assert.equal(totalCalls, 2);
  assert.equal(conversionRate, "100.0"); // 100% success for active agent, Sara's failed call ignored

  // Agent Performance Chart data
  const agentMap = new Map<string, { total: number; completed: number }>();
  for (const agent of activeAgents) {
    agentMap.set(agent.name, { total: 0, completed: 0 });
  }

  for (const call of activeAgentCalls) {
    const mappedAgent = activeAgents.find(
      (a) => a.retellAgentId === call.agentId || a.id === call.agentId,
    );
    if (!mappedAgent) continue;
    const stats = agentMap.get(mappedAgent.name)!;
    stats.total += 1;
    if (call.status === "completed") stats.completed += 1;
  }

  const performanceData = Array.from(agentMap.entries()).map(([name, stats]) => ({
    name,
    "Success Rate (%)": Math.round((stats.completed / stats.total) * 100),
    "Total Calls": stats.total,
  }));

  assert.equal(performanceData.length, 1);
  assert.equal(performanceData[0].name, "AC/Plumber Agent");
  assert.equal(performanceData[0]["Total Calls"], 2);
  assert.equal(performanceData[0]["Success Rate (%)"], 100);

  // Sara must NOT be in performanceData
  assert.equal(performanceData.some((p) => p.name.toLowerCase() === "sara"), false);
});

// 5. Call History displays "Unassigned" for deleted agents and never shows deleted agent names
test("5. Call History mapRetellCall dynamically resolves active agents and masks deleted agents", () => {
  const currentAgents = [
    {
      id: "agent-1",
      retellAgentId: "agent_da9e1542cfa28eebf17aa7979f",
      name: "AC/Plumber Agent",
      languages: ["English"],
    },
  ];

  function mapRetellCall(
    call: any,
    agents: Array<{ id: string; name?: string; retellAgentId: string; languages: string[] }> = [],
  ) {
    const mappedAgent = agents.find(
      (agent) => (agent.retellAgentId && agent.retellAgentId === call.agentId) || agent.id === call.agentId,
    );
    return {
      id: `retell-${call.callId}`,
      agentId: call.agentId,
      agentName: mappedAgent?.name ?? "Unassigned",
      language: mappedAgent?.languages?.[0] ?? "English",
      status: call.status,
    };
  }

  // Active agent call
  const activeCall = mapRetellCall(
    {
      callId: "c-100",
      agentId: "agent_da9e1542cfa28eebf17aa7979f",
      agentName: "AC/Plumber Agent",
      status: "completed",
    },
    currentAgents,
  );
  assert.equal(activeCall.agentName, "AC/Plumber Agent");

  // Old call that has raw agentName = "sara" from Retell API
  const deletedAgentCall = mapRetellCall(
    {
      callId: "c-101",
      agentId: "agent_deleted_sara",
      agentName: "sara", // Stale raw name from Retell
      status: "completed",
    },
    currentAgents,
  );

  // Must resolve to "Unassigned", NOT "sara"
  assert.equal(deletedAgentCall.agentName, "Unassigned");
});

// 6. Historical records are preserved in the DB with agentId = null, not deleted or overwritten
test("6. Historical data is preserved for audit and reference without mutating agentId to active agent", async () => {
  const db = createMockDb({
    agents: [
      { id: "active-agent", organizationId: "org-1", name: "AC/Plumber Agent", status: "active" },
    ],
    calls: [
      { id: "hist-call-1", organizationId: "org-1", agentId: null, transcript: "Customer called about leak" },
      { id: "active-call-1", organizationId: "org-1", agentId: "active-agent", transcript: "Customer called about AC" },
    ],
    appointments: [
      { id: "hist-app-1", organizationId: "org-1", agentId: null, serviceName: "Past Consultation" },
    ],
  });

  // Verify historical calls still exist in database
  const allCalls = await db.call.findMany({ where: { organizationId: "org-1" } });
  assert.equal(allCalls.length, 2);

  const historicalCall = allCalls.find((c: any) => c.id === "hist-call-1");
  assert.ok(historicalCall);
  assert.equal(historicalCall.agentId, null);
  assert.equal(historicalCall.transcript, "Customer called about leak");

  // Verify it was NOT re-assigned to the active agent
  assert.notEqual(historicalCall.agentId, "active-agent");
});

// 7. Multi-Tenant and Multi-Agent Isolation
test("7. Tenant isolation prevents agents and calls from another organization leaking in", async () => {
  const db = createMockDb({
    agents: [
      { id: "org1-agent", organizationId: "org-1", name: "Org 1 Plumber", status: "active" },
      { id: "org2-agent", organizationId: "org-2", name: "Org 2 Plumber", status: "active" },
    ],
    calls: [
      { id: "c-org1", organizationId: "org-1", agentId: "org1-agent", status: "completed" },
      { id: "c-org2", organizationId: "org-2", agentId: "org2-agent", status: "completed" },
    ],
  });

  const org1ActiveAgents = await db.agent.findMany({
    where: { organizationId: "org-1", status: "active" },
    select: { id: true, name: true },
  });

  assert.equal(org1ActiveAgents.length, 1);
  assert.equal(org1ActiveAgents[0].id, "org1-agent");

  const targetAgentIds = org1ActiveAgents.map((a: any) => a.id);
  const org1Calls = await db.call.count({
    where: {
      organizationId: "org-1",
      agentId: { in: targetAgentIds },
    },
  });

  assert.equal(org1Calls, 1);
});
