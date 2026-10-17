import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/db";
import { requireOrganizationAccess } from "@/lib/server/auth/organization";
import { apiErrorResponse, parseJsonRequest } from "@/lib/server/http";
import { createRetellClient } from "@/lib/server/calls/retell";
import { getRetellApiKey } from "@/lib/server/providers/configuration";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { organization } = await requireOrganizationAccess();
    const { id } = await params;
    const body = (await parseJsonRequest(request)) as { message?: string } | null;
    const message = body?.message;

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    const call = await prisma.call.findFirst({
      where: {
        id,
        organizationId: organization.id,
      },
      select: {
        id: true,
        externalCallId: true,
        transcript: true,
      },
    });

    if (!call) {
      return NextResponse.json({ error: "Call not found." }, { status: 404 });
    }

    const apiKey = getRetellApiKey();
    if (apiKey && call.externalCallId) {
      const client = createRetellClient(apiKey);
      await client.call.updateLive(call.externalCallId, {
        call_control: {
          additional_context: message.trim(),
          trigger_response: true,
        },
      });
    }

    // Save administrator intervention message in transcript
    const existingTranscript = call.transcript ? `${call.transcript}\n` : "";
    const updatedTranscript = `${existingTranscript}Admin: ${message.trim()}`;
    await prisma.call.update({
      where: { id: call.id },
      data: { transcript: updatedTranscript },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiErrorResponse(error, "Unable to send intervention message.");
  }
}
