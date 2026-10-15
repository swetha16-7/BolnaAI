import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/server/db";
import { requireOrganizationAccess } from "@/lib/server/auth/organization";
import { apiErrorResponse } from "@/lib/server/http";
import { teamResourceScope } from "@/lib/server/team";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ invitationId: string }> },
) {
  try {
    const { user, organization } = await requireOrganizationAccess({
      allowedRoles: ["OWNER", "ADMIN"],
    });
    const { invitationId } = await params;
    const now = new Date();
    const result = await prisma.$transaction(async (transaction) => {
      const invitation = await transaction.invitation.findFirst({
        where: teamResourceScope(organization.id, invitationId),
        select: { id: true, status: true, expiresAt: true },
      });
      if (!invitation) return "not_found";
      if (invitation.status !== "PENDING" || invitation.expiresAt <= now) return "not_pending";

      const revoked = await transaction.invitation.updateMany({
        where: {
          ...teamResourceScope(organization.id, invitationId),
          status: "PENDING",
          expiresAt: { gt: now },
        },
        data: { status: "REVOKED", revokedAt: now },
      });
      if (revoked.count !== 1) return "not_pending";
      await transaction.auditLog.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          entity: "invitation",
          action: "revoked",
        },
      });
      return "revoked";
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (result === "not_found") {
      return NextResponse.json({ error: "Invitation not found." }, { status: 404 });
    }
    if (result === "not_pending") {
      return NextResponse.json({ error: "Only a pending invitation can be revoked." }, { status: 409 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error, "Unable to revoke invitation.");
  }
}
