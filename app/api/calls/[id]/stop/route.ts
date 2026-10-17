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
        status: true,
      },
    });

    if (!call) {
      return NextResponse.json({ error: "Call not found." }, { status: 404 });
    }

    const apiKey = getRetellApiKey();
    if (apiKey && call.externalCallId) {
      try {
        const client = createRetellClient(apiKey);
        await client.call.stop(call.externalCallId);
      } catch (providerError) {
        // If the call already ended on Retell's side, proceed to update DB
        console.warn("Retell stop call notification:", providerError);
      }
    }

    const now = new Date();
    await prisma.call.update({
      where: { id: call.id },
      data: {
        status: "completed",
        endedAt: now,
      },
    });

    return NextResponse.json({ success: true, status: "completed" });
  } catch (error) {
    return apiErrorResponse(error, "Unable to stop call.");
  }
}
