import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/db";
import { requireOrganizationAccess } from "@/lib/server/auth/organization";
import { apiErrorResponse } from "@/lib/server/http";
import { organizationScope } from "@/lib/server/auth/tenant-scope";
import { callSummarySelect } from "@/lib/server/selects";
import { getAuthoritativeContactCount } from "@/lib/server/calls/retell-contacts";

export async function GET(request: Request) {
  try {
    const { organization } = await requireOrganizationAccess();
    const url = new URL(request.url);
    const requestedAgentId = url.searchParams.get("agentId")?.trim();

    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const firstDay = new Date(startOfToday);
    firstDay.setUTCDate(firstDay.getUTCDate() - 6);

    // 1. Resolve currently active agent(s) within the tenant
    const activeAgentsList = await prisma.agent.findMany({
      where: {
        ...organizationScope(organization.id),
        status: "active",
      },
      select: { id: true, name: true },
    });

    let targetAgentIds: string[] = [];
    if (requestedAgentId) {
      const targetAgent = await prisma.agent.findFirst({
        where: {
          ...organizationScope(organization.id),
          id: requestedAgentId,
        },
        select: { id: true },
      });
      if (targetAgent) {
        targetAgentIds = [targetAgent.id];
      }
    } else {
      targetAgentIds = activeAgentsList.map((a) => a.id);
    }

    // Scope current-agent call statistics strictly to the active agent(s).
    // Historical calls from deleted agents (where agentId = null or deleted ID) are excluded.
    const agentCallScope = targetAgentIds.length > 0
      ? { agentId: { in: targetAgentIds } }
      : { agentId: "__none_active__" };

    const [
      callsToday,
      totalAgents,
      pausedAgents,
      successfulCalls,
      failedCalls,
      contacts,
      appointments,
      recentCalls,
      weeklyCalls,
      durationStats,
      totalCalls,
    ] = await Promise.all([
      prisma.call.count({
        where: {
          ...organizationScope(organization.id),
          ...agentCallScope,
          createdAt: { gte: startOfToday },
        },
      }),
      prisma.agent.count({
        where: organizationScope(organization.id),
      }),
      prisma.agent.count({
        where: { ...organizationScope(organization.id), status: "paused" },
      }),
      prisma.call.count({
        where: {
          ...organizationScope(organization.id),
          ...agentCallScope,
          status: "completed",
        },
      }),
      prisma.call.count({
        where: {
          ...organizationScope(organization.id),
          ...agentCallScope,
          status: { in: ["failed", "canceled", "error"] },
        },
      }),
      getAuthoritativeContactCount(organization.id),
      prisma.appointment.count({
        where: {
          ...organizationScope(organization.id),
          ...agentCallScope,
        },
      }),
      prisma.call.findMany({
        where: {
          ...organizationScope(organization.id),
          ...agentCallScope,
        },
        select: callSummarySelect,
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.call.findMany({
        where: {
          ...organizationScope(organization.id),
          ...agentCallScope,
          createdAt: { gte: firstDay },
        },
        select: { createdAt: true, direction: true },
      }),
      prisma.call.aggregate({
        where: {
          ...organizationScope(organization.id),
          ...agentCallScope,
          durationSeconds: { not: null },
        },
        _avg: { durationSeconds: true },
      }),
      prisma.call.count({
        where: {
          ...organizationScope(organization.id),
          ...agentCallScope,
        },
      }),
    ]);

    const callsByDay = Array.from({ length: 7 }, (_, index) => {
      const day = new Date(firstDay);
      day.setUTCDate(firstDay.getUTCDate() + index);
      const dayKey = day.toISOString().slice(0, 10);
      const dayCalls = weeklyCalls.filter(
        (call) => call.createdAt.toISOString().slice(0, 10) === dayKey,
      );
      return {
        name: day.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
        inbound: dayCalls.filter((call) => call.direction === "inbound").length,
        outbound: dayCalls.filter((call) => call.direction === "outbound").length,
        other: dayCalls.filter((call) => call.direction !== "inbound" && call.direction !== "outbound").length,
      };
    });

    return NextResponse.json({
      metrics: {
        callsToday,
        activeAgents: activeAgentsList.length,
        totalAgents,
        pausedAgents,
        successfulCalls,
        failedCalls,
        contacts,
        appointments,
        averageDurationSeconds: durationStats._avg.durationSeconds === null
          ? null
          : Math.round(durationStats._avg.durationSeconds),
        totalCalls,
      },
      callsByDay,
      recentCalls,
    });
  } catch (error) {
    return apiErrorResponse(error, "Unable to load dashboard data.");
  }
}
