import { NextResponse } from "next/server";

import { prisma } from "@/lib/server/db";
import { requireOrganizationAccess } from "@/lib/server/auth/organization";
import { apiErrorResponse } from "@/lib/server/http";
import { organizationScope } from "@/lib/server/auth/tenant-scope";

export async function GET() {
  try {
    const { organization } = await requireOrganizationAccess({
      allowedRoles: ["OWNER", "ADMIN", "MANAGER", "MEMBER"],
    });

    const appointments = await prisma.appointment.findMany({
      where: organizationScope(organization.id),
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        timezone: true,
        status: true,
        serviceName: true,
        calcomEventId: true,
        metadata: true,
        createdAt: true,
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json({ appointments });
  } catch (error) {
    return apiErrorResponse(error, "Unable to load appointments.");
  }
}
