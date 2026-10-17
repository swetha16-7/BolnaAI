import { cookies } from "next/headers";

import { prisma } from "@/lib/server/db";
import { requireSession } from "@/lib/server/auth/session";
import { membershipScope } from "@/lib/server/auth/tenant-scope";

export class ForbiddenError extends Error {
  constructor(message = "Organization access denied.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export async function requireOrganizationAccess({
  allowedRoles = ["OWNER", "ADMIN", "MANAGER", "MEMBER"],
}: {
  allowedRoles?: string[];
} = {}) {
  const sessionUser = await requireSession();
  const preferredOrganizationId = (await cookies()).get("bolna_organization")?.value;
  const membership = await prisma.userMembership.findFirst({
    where: {
      ...membershipScope(sessionUser.id),
      ...(preferredOrganizationId ? { organizationId: preferredOrganizationId } : {}),
    },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  });

  if (!membership) {
    throw new ForbiddenError();
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(membership.role)) {
    throw new ForbiddenError("Insufficient permissions.");
  }

  return {
    user: sessionUser,
    organization: membership.organization,
    membership,
  };
}
