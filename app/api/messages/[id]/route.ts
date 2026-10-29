import { NextResponse } from "next/server.js";
import { prisma } from "../../../../lib/server/db.ts";
import { requireOrganizationAccess } from "../../../../lib/server/auth/organization.ts";
import { apiErrorResponse, parseJsonRequest } from "../../../../lib/server/http.ts";
import { organizationScope } from "../../../../lib/server/auth/tenant-scope.ts";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { organization } = await requireOrganizationAccess({
      allowedRoles: ["OWNER", "ADMIN", "MANAGER", "MEMBER"],
    });

    const { id } = await params;
    const body = (await parseJsonRequest(request)) as Record<string, unknown> | null;
    const status = typeof body?.status === "string" ? body.status : undefined;

    if (!status || !["pending", "handled", "archived"].includes(status)) {
      return NextResponse.json(
        { error: "Invalid status. Must be pending, handled, or archived." },
        { status: 400 },
      );
    }

    const log = await prisma.auditLog.findFirst({
      where: {
        id,
        ...organizationScope(organization.id),
        entity: "caller_message",
      },
    });

    if (!log) {
      return NextResponse.json(
        { error: "Message not found." },
        { status: 404 },
      );
    }

    const currentDetails = (log.details as Record<string, any>) || {};
    const updatedDetails = {
      ...currentDetails,
      status,
      handledAt: status === "handled" ? new Date().toISOString() : currentDetails.handledAt,
    };

    const updatedLog = await prisma.auditLog.update({
      where: { id: log.id },
      data: { details: updatedDetails },
      select: { id: true, details: true, createdAt: true },
    });

    const finalDetails = (updatedLog.details as Record<string, any>) || {};
    return NextResponse.json({
      success: true,
      message: {
        id: updatedLog.id,
        callerName: finalDetails.callerName || "Unknown Caller",
        phoneNumber: finalDetails.phoneNumber || "",
        email: finalDetails.email || null,
        message: finalDetails.message || "",
        isDnc: Boolean(finalDetails.isDnc),
        status: finalDetails.status || status,
        contactId: finalDetails.contactId || null,
        callId: finalDetails.callId || null,
        createdAt: updatedLog.createdAt.toISOString(),
      },
    });
  } catch (error) {
    return apiErrorResponse(error, "Unable to update message.");
  }
}
