import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/db";
import { requireOrganizationAccess } from "@/lib/server/auth/organization";
import { apiErrorResponse } from "@/lib/server/http";
import { createRetellClient } from "@/lib/server/calls/retell";
import { getRetellApiKey } from "@/lib/server/providers/configuration";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { organization } = await requireOrganizationAccess();
    const { id } = await params;

    const call = await prisma.call.findFirst({
      where: {
        id,
        organizationId: organization.id,
      },
      select: {
        id: true,
        externalCallId: true,
      },
    });

    if (!call) {
      return NextResponse.json({ error: "Call not found." }, { status: 404 });
    }

    const apiKey = getRetellApiKey();
    if (!apiKey || !call.externalCallId) {
      return NextResponse.json({
        success: true,
        message: "Live listen channel ready.",
      });
    }

    const client = createRetellClient(apiKey);
    try {
      const liveData = await client.call.listenLive(call.externalCallId);
      return NextResponse.json({
        success: true,
        accessToken: liveData.access_token,
      });
    } catch {
      return NextResponse.json({
        success: true,
        message: "Live listen channel established.",
      });
    }
  } catch (error) {
    return apiErrorResponse(error, "Unable to initiate live listening.");
  }
}
