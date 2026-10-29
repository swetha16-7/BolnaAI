import { NextResponse } from "next/server.js";
import { prisma } from "../../../lib/server/db.ts";
import { requireOrganizationAccess } from "../../../lib/server/auth/organization.ts";
import { apiErrorResponse } from "../../../lib/server/http.ts";
import { organizationScope } from "../../../lib/server/auth/tenant-scope.ts";

export async function GET() {
  try {
    const { organization } = await requireOrganizationAccess({
      allowedRoles: ["OWNER", "ADMIN", "MANAGER", "MEMBER"],
    });

    const logs = await prisma.auditLog.findMany({
      where: {
        ...organizationScope(organization.id),
        entity: "caller_message",
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        entity: true,
        action: true,
        details: true,
        createdAt: true,
      },
    });

    const messages = logs.map((log) => {
      const details = (log.details as Record<string, any>) || {};
      return {
        id: log.id,
        callerName: details.callerName || "Unknown Caller",
        phoneNumber: details.phoneNumber || "",
        email: details.email || null,
        message: details.message || "",
        reason: details.reason || null,
        isDnc: Boolean(details.isDnc),
        status: (details.status as "pending" | "handled" | "archived") || "pending",
        contactId: details.contactId || null,
        callId: details.callId || null,
        createdAt: log.createdAt.toISOString(),
      };
    });

    return NextResponse.json({ messages });
  } catch (error) {
    return apiErrorResponse(error, "Unable to load messages.");
  }
}
