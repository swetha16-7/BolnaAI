import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/db";
import { requireOrganizationAccess } from "@/lib/server/auth/organization";
import { apiErrorResponse } from "@/lib/server/http";
import { organizationScope } from "@/lib/server/auth/tenant-scope";
import { callSummarySelect } from "@/lib/server/selects";

export async function GET() {
  try {
    const { organization } = await requireOrganizationAccess();
    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const firstDay = new Date(startOfToday);
    firstDay.setUTCDate(firstDay.getUTCDate() - 6);

    const [callsToday, activeAgents, contacts, appointments, recentCalls, weeklyCalls, durationStats, totalCalls] =
      await Promise.all([
        prisma.call.count({
          where: { ...organizationScope(organization.id), createdAt: { gte: startOfToday } },
        }),
        prisma.agent.count({
          where: { ...organizationScope(organization.id), status: "active" },
        }),
        prisma.contact.count({ where: organizationScope(organization.id) }),
        prisma.appointment.count({ where: organizationScope(organization.id) }),
        prisma.call.findMany({
          where: organizationScope(organization.id),
          select: callSummarySelect,
          orderBy: { createdAt: "desc" },
          take: 5,
        }),
        prisma.call.findMany({
          where: { ...organizationScope(organization.id), createdAt: { gte: firstDay } },
          select: { createdAt: true, direction: true },
        }),
        prisma.call.aggregate({
          where: {
            ...organizationScope(organization.id),
            durationSeconds: { not: null },
          },
          _avg: { durationSeconds: true },
        }),
        prisma.call.count({ where: organizationScope(organization.id) }),
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
        activeAgents,
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
