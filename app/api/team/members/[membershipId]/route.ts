import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/server/db";
import { requireOrganizationAccess } from "@/lib/server/auth/organization";
import { apiErrorResponse, parseJsonRequest } from "@/lib/server/http";
import {
  memberRemovalFailure,
  membershipRoleUpdateSchema,
  roleChangeFailure,
  teamResourceScope,
} from "@/lib/server/team";

type RouteContext = { params: Promise<{ membershipId: string }> };

function ruleFailureResponse(failure: string) {
  if (failure === "self") {
    return NextResponse.json({ error: "You cannot change or remove your own membership." }, { status: 409 });
  }
  if (failure === "last_owner") {
    return NextResponse.json({ error: "The organization must retain at least one owner." }, { status: 409 });
  }
  return NextResponse.json({ error: "You are not authorized to perform this team action." }, { status: 403 });
}

function isSerializationConflict(error: unknown) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "P2034",
  );
}

export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { user, organization, membership: actorMembership } = await requireOrganizationAccess({
      allowedRoles: ["OWNER", "ADMIN"],
    });
    const parsedBody = membershipRoleUpdateSchema.safeParse(await parseJsonRequest(request));
    if (!parsedBody.success) {
      return NextResponse.json({
        error: "Membership role is invalid.",
        details: parsedBody.error.flatten().fieldErrors,
      }, { status: 400 });
    }
    const { membershipId } = await params;
    const target = await prisma.userMembership.findFirst({
      where: teamResourceScope(organization.id, membershipId),
      select: { id: true, userId: true, role: true },
    });
    if (!target) {
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
    }

    const ownerCount = target.role === "OWNER"
      ? await prisma.userMembership.count({ where: { organizationId: organization.id, role: "OWNER" } })
      : 0;
    const initialFailure = roleChangeFailure({
      actorId: user.id,
      actorRole: actorMembership.role,
      targetId: target.userId,
      currentRole: target.role,
      nextRole: parsedBody.data.role,
      ownerCount,
    });
    if (initialFailure) return ruleFailureResponse(initialFailure);

    try {
      const updated = await prisma.$transaction(async (transaction) => {
        const currentActor = await transaction.userMembership.findFirst({
          where: { userId: user.id, organizationId: organization.id },
          select: { role: true },
        });
        const currentTarget = await transaction.userMembership.findFirst({
          where: teamResourceScope(organization.id, membershipId),
          select: { id: true, userId: true, role: true },
        });
        if (!currentActor || !currentTarget) return null;

        const currentOwnerCount = currentTarget.role === "OWNER"
          ? await transaction.userMembership.count({
              where: { organizationId: organization.id, role: "OWNER" },
            })
          : 0;
        const failure = roleChangeFailure({
          actorId: user.id,
          actorRole: currentActor.role,
          targetId: currentTarget.userId,
          currentRole: currentTarget.role,
          nextRole: parsedBody.data.role,
          ownerCount: currentOwnerCount,
        });
        if (failure) throw new Error(`TEAM_ROLE_${failure.toUpperCase()}`);

        const member = await transaction.userMembership.update({
          where: { id: currentTarget.id },
          data: { role: parsedBody.data.role },
          select: {
            id: true,
            role: true,
            user: { select: { id: true, name: true, email: true } },
          },
        });
        await transaction.auditLog.create({
          data: {
            organizationId: organization.id,
            userId: user.id,
            entity: "membership",
            action: "role_changed",
            details: {
              previousRole: currentTarget.role,
              role: parsedBody.data.role,
            } satisfies Prisma.InputJsonObject,
          },
        });
        return member;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

      if (!updated) return NextResponse.json({ error: "Member not found." }, { status: 404 });
      return NextResponse.json({ member: updated });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("TEAM_ROLE_")) {
        return ruleFailureResponse(error.message.slice("TEAM_ROLE_".length).toLowerCase());
      }
      if (isSerializationConflict(error)) {
        return NextResponse.json({ error: "Team membership changed concurrently. Refresh and try again." }, { status: 409 });
      }
      throw error;
    }
  } catch (error) {
    return apiErrorResponse(error, "Unable to update member role.");
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { user, organization, membership: actorMembership } = await requireOrganizationAccess({
      allowedRoles: ["OWNER", "ADMIN"],
    });
    const { membershipId } = await params;
    const target = await prisma.userMembership.findFirst({
      where: teamResourceScope(organization.id, membershipId),
      select: { id: true, userId: true, role: true },
    });
    if (!target) {
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
    }

    const ownerCount = target.role === "OWNER"
      ? await prisma.userMembership.count({ where: { organizationId: organization.id, role: "OWNER" } })
      : 0;
    const initialFailure = memberRemovalFailure({
      actorId: user.id,
      actorRole: actorMembership.role,
      targetId: target.userId,
      targetRole: target.role,
      ownerCount,
    });
    if (initialFailure) return ruleFailureResponse(initialFailure);

    try {
      const removed = await prisma.$transaction(async (transaction) => {
        const currentActor = await transaction.userMembership.findFirst({
          where: { userId: user.id, organizationId: organization.id },
          select: { role: true },
        });
        const currentTarget = await transaction.userMembership.findFirst({
          where: teamResourceScope(organization.id, membershipId),
          select: { id: true, userId: true, role: true },
        });
        if (!currentActor || !currentTarget) return false;

        const currentOwnerCount = currentTarget.role === "OWNER"
          ? await transaction.userMembership.count({
              where: { organizationId: organization.id, role: "OWNER" },
            })
          : 0;
        const failure = memberRemovalFailure({
          actorId: user.id,
          actorRole: currentActor.role,
          targetId: currentTarget.userId,
          targetRole: currentTarget.role,
          ownerCount: currentOwnerCount,
        });
        if (failure) throw new Error(`TEAM_REMOVE_${failure.toUpperCase()}`);

        await transaction.userMembership.delete({ where: { id: currentTarget.id } });
        await transaction.auditLog.create({
          data: {
            organizationId: organization.id,
            userId: user.id,
            entity: "membership",
            action: "removed",
            details: { role: currentTarget.role } satisfies Prisma.InputJsonObject,
          },
        });
        return true;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

      if (!removed) return NextResponse.json({ error: "Member not found." }, { status: 404 });
      return NextResponse.json({ success: true });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("TEAM_REMOVE_")) {
        return ruleFailureResponse(error.message.slice("TEAM_REMOVE_".length).toLowerCase());
      }
      if (isSerializationConflict(error)) {
        return NextResponse.json({ error: "Team membership changed concurrently. Refresh and try again." }, { status: 409 });
      }
      throw error;
    }
  } catch (error) {
    return apiErrorResponse(error, "Unable to remove member.");
  }
}
