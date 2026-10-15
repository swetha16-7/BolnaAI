import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/server/db";
import { requireOrganizationAccess } from "@/lib/server/auth/organization";
import { apiErrorResponse, parseJsonRequest } from "@/lib/server/http";
import {
  canInviteRole,
  createInvitationToken,
  invitationCreateSchema,
  InvitationDeliveryError,
  INVITATION_TTL_MS,
  INVITATIONS_PER_HOUR,
  hashInvitationToken,
  normalizeEmail,
  presentTeamListing,
  sendInvitationEmail,
} from "@/lib/server/team";

const INVITATION_WINDOW_MS = 60 * 60 * 1000;

export async function GET() {
  try {
    const { organization, membership } = await requireOrganizationAccess();
    const [members, invitations] = await Promise.all([
      prisma.userMembership.findMany({
        where: { organizationId: organization.id },
        select: {
          id: true,
          role: true,
          createdAt: true,
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      }),
      prisma.invitation.findMany({
        where: { organizationId: organization.id },
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          createdAt: true,
          expiresAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);

    return NextResponse.json(presentTeamListing({
      members,
      invitations,
      currentRole: membership.role,
      currentUserId: membership.userId,
    }));
  } catch (error) {
    return apiErrorResponse(error, "Unable to load organization members.");
  }
}

export async function POST(request: Request) {
  try {
    const { user, organization, membership } = await requireOrganizationAccess({
      allowedRoles: ["OWNER", "ADMIN"],
    });
    const body = await parseJsonRequest(request);
    const parsed = invitationCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({
        error: "Invitation data is invalid.",
        details: parsed.error.flatten().fieldErrors,
      }, { status: 400 });
    }

    if (!canInviteRole(membership.role, parsed.data.role)) {
      return NextResponse.json({ error: "You cannot invite a member with that role." }, { status: 403 });
    }

    const email = normalizeEmail(parsed.data.email);
    const now = new Date();
    const token = createInvitationToken();
    let invitationId: string | null = null;

    await prisma.$transaction(async (transaction) => {
      const currentMembership = await transaction.userMembership.findFirst({
        where: { userId: user.id, organizationId: organization.id },
        select: { role: true },
      });
      if (!currentMembership || !canInviteRole(currentMembership.role, parsed.data.role)) {
        throw new Error("TEAM_PERMISSION_CHANGED");
      }

      const windowStart = new Date(now.getTime() - INVITATION_WINDOW_MS);
      const recentInvitations = await transaction.invitation.count({
        where: {
          organizationId: organization.id,
          invitedByUserId: user.id,
          createdAt: { gte: windowStart },
        },
      });
      if (recentInvitations >= INVITATIONS_PER_HOUR) {
        throw new Error("TEAM_INVITATION_RATE_LIMIT");
      }

      const revokedExisting = await transaction.invitation.updateMany({
        where: {
          organizationId: organization.id,
          email,
          status: "PENDING",
        },
        data: { status: "REVOKED", revokedAt: now },
      });

      const existingMember = await transaction.userMembership.findFirst({
        where: {
          organizationId: organization.id,
          user: { email },
        },
        select: { id: true },
      });
      if (existingMember) {
        if (revokedExisting.count > 0) {
          await transaction.auditLog.create({
            data: {
              organizationId: organization.id,
              userId: user.id,
              entity: "invitation",
              action: "revoked",
            },
          });
        }
        return;
      }

      const invitation = await transaction.invitation.create({
        data: {
          organizationId: organization.id,
          invitedByUserId: user.id,
          email,
          role: parsed.data.role,
          tokenHash: hashInvitationToken(token),
          expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
        },
        select: { id: true },
      });
      invitationId = invitation.id;
      await transaction.auditLog.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          entity: "invitation",
          action: "created",
          details: { role: parsed.data.role } satisfies Prisma.InputJsonObject,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (invitationId) {
      try {
        await sendInvitationEmail({
          email,
          organizationName: organization.name,
          role: parsed.data.role,
          token,
        });
      } catch (error) {
        await prisma.$transaction([
          prisma.invitation.updateMany({
            where: { id: invitationId, organizationId: organization.id, status: "PENDING" },
            data: { status: "REVOKED", revokedAt: new Date() },
          }),
          prisma.auditLog.create({
            data: {
              organizationId: organization.id,
              userId: user.id,
              entity: "invitation",
              action: "delivery_failed",
            },
          }),
        ]);
        if (error instanceof InvitationDeliveryError) {
          return NextResponse.json({ error: error.message }, { status: 503 });
        }
        return NextResponse.json({ error: "Invitation email could not be delivered." }, { status: 502 });
      }
    }

    return NextResponse.json({
      message: "If the invitation can be issued, an invitation email will be sent.",
    }, { status: 202 });
  } catch (error) {
    if (error instanceof Error && error.message === "TEAM_PERMISSION_CHANGED") {
      return NextResponse.json({ error: "Your team permissions changed. Refresh and try again." }, { status: 403 });
    }
    if (error instanceof Error && error.message === "TEAM_INVITATION_RATE_LIMIT") {
      return NextResponse.json({ error: "Invitation limit reached. Try again later." }, { status: 429 });
    }
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2034"
    ) {
      return NextResponse.json({ error: "Invitation request conflicted with another update. Try again." }, { status: 409 });
    }
    return apiErrorResponse(error, "Unable to create invitation.");
  }
}
