import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/server/db";
import {
  getSession,
  setActiveOrganizationCookie,
  setSessionCookie,
} from "@/lib/server/auth/session";
import { hashPassword, verifyPassword } from "@/lib/server/auth/password";
import { apiErrorResponse, parseJsonRequest } from "@/lib/server/http";
import {
  hashInvitationToken,
  invitationAcceptSchema,
  normalizeEmail,
  validInvitationAcceptance,
} from "@/lib/server/team";

const INVALID_INVITATION_MESSAGE = "This invitation is invalid, expired, revoked, or already used.";

function isUniqueConstraintError(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "P2002",
  );
}

export async function POST(request: Request) {
  try {
    const parsed = invitationAcceptSchema.safeParse(await parseJsonRequest(request));
    if (!parsed.success) {
      return NextResponse.json({
        error: "Invitation acceptance data is invalid.",
        details: parsed.error.flatten().fieldErrors,
      }, { status: 400 });
    }

    const now = new Date();
    const tokenHash = hashInvitationToken(parsed.data.token);
    const invitation = await prisma.invitation.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        organizationId: true,
        email: true,
        role: true,
        tokenHash: true,
        status: true,
        expiresAt: true,
      },
    });
    if (
      !invitation ||
      !validInvitationAcceptance({
        storedTokenHash: invitation.tokenHash,
        token: parsed.data.token,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        invitedEmail: invitation.email,
        accountEmail: invitation.email,
        now,
      })
    ) {
      return NextResponse.json({ error: INVALID_INVITATION_MESSAGE }, { status: 400 });
    }

    const session = await getSession();
    const normalizedEmail = normalizeEmail(invitation.email);
    let account = session
      ? await prisma.user.findUnique({
          where: { id: session.id },
          select: { id: true, email: true, name: true },
        })
      : null;

    let newPasswordHash: string | null = null;
    if (session) {
      if (!account || normalizeEmail(account.email) !== normalizedEmail) {
        return NextResponse.json({ error: INVALID_INVITATION_MESSAGE }, { status: 400 });
      }
    } else {
      if (!parsed.data.password) {
        return NextResponse.json({ error: INVALID_INVITATION_MESSAGE }, { status: 400 });
      }
      const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true, email: true, name: true, passwordHash: true },
      });
      if (existingUser) {
        if (
          !existingUser.passwordHash ||
          !(await verifyPassword(parsed.data.password, existingUser.passwordHash))
        ) {
          return NextResponse.json({ error: INVALID_INVITATION_MESSAGE }, { status: 400 });
        }
        account = existingUser;
      } else {
        newPasswordHash = await hashPassword(parsed.data.password);
      }
    }

    let acceptedUserId: string;
    try {
      acceptedUserId = await prisma.$transaction(async (transaction) => {
        const currentInvitation = await transaction.invitation.findFirst({
          where: {
            id: invitation.id,
            organizationId: invitation.organizationId,
            tokenHash,
            status: "PENDING",
            expiresAt: { gt: now },
          },
          select: { id: true, organizationId: true, email: true, role: true },
        });
        if (!currentInvitation) throw new Error("TEAM_INVITATION_UNAVAILABLE");

        let userId = account?.id;
        if (!userId) {
          const racedAccount = await transaction.user.findUnique({
            where: { email: normalizedEmail },
            select: { id: true },
          });
          if (racedAccount) throw new Error("TEAM_INVITATION_UNAVAILABLE");

          const createdUser = await transaction.user.create({
            data: {
              email: normalizedEmail,
              name: parsed.data.name,
              passwordHash: newPasswordHash,
              role: "VIEWER",
            },
            select: { id: true },
          });
          userId = createdUser.id;
        }

        const existingMembership = await transaction.userMembership.findFirst({
          where: {
            userId,
            organizationId: currentInvitation.organizationId,
          },
          select: { id: true },
        });
        if (existingMembership) throw new Error("TEAM_INVITATION_UNAVAILABLE");

        const claimed = await transaction.invitation.updateMany({
          where: {
            id: currentInvitation.id,
            tokenHash,
            status: "PENDING",
            expiresAt: { gt: now },
          },
          data: { status: "ACCEPTED", acceptedAt: now },
        });
        if (claimed.count !== 1) throw new Error("TEAM_INVITATION_UNAVAILABLE");

        await transaction.userMembership.create({
          data: {
            userId,
            organizationId: currentInvitation.organizationId,
            role: currentInvitation.role,
          },
        });
        await transaction.auditLog.create({
          data: {
            organizationId: currentInvitation.organizationId,
            userId,
            entity: "invitation",
            action: "accepted",
            details: { role: currentInvitation.role } satisfies Prisma.InputJsonObject,
          },
        });
        return userId;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (
        (error instanceof Error && error.message === "TEAM_INVITATION_UNAVAILABLE") ||
        isUniqueConstraintError(error) ||
        (error && typeof error === "object" && "code" in error && error.code === "P2034")
      ) {
        return NextResponse.json({ error: INVALID_INVITATION_MESSAGE }, { status: 409 });
      }
      throw error;
    }

    await setSessionCookie(acceptedUserId);
    await setActiveOrganizationCookie(invitation.organizationId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error, "Unable to accept invitation.");
  }
}
