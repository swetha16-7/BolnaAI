import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/db";
import { mapTwilioCallStatus, isTerminalCallStatus } from "@/lib/server/calls/policy";
import { verifyTwilioSignature } from "@/lib/server/calls/webhook-signatures";

export async function POST(request: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const canonicalUrl = process.env.TWILIO_WEBHOOK_URL;
  const signature = request.headers.get("x-twilio-signature");

  if (!authToken || !canonicalUrl) {
    return NextResponse.json({ error: "Twilio webhook verification is not configured." }, { status: 503 });
  }

  if (!signature) {
    return NextResponse.json({ error: "Missing Twilio signature." }, { status: 401 });
  }

  const rawBody = await request.text();
  if (rawBody.length > 100_000) {
    return NextResponse.json({ error: "Webhook body is too large." }, { status: 413 });
  }

  let canonical: URL;
  try {
    canonical = new URL(canonicalUrl);
  } catch {
    return NextResponse.json({ error: "Configured Twilio webhook URL is invalid." }, { status: 503 });
  }
  if (canonical.protocol !== "https:") {
    return NextResponse.json({ error: "Twilio webhook URL must use public HTTPS." }, { status: 503 });
  }

  const parameterList = Array.from(new URLSearchParams(rawBody).entries());
  const parameters: Record<string, string | string[]> = {};
  for (const [key, value] of parameterList) {
    const current = parameters[key];
    parameters[key] = current === undefined
      ? value
      : Array.isArray(current)
        ? [...current, value]
        : [current, value];
  }

  if (!verifyTwilioSignature(authToken, canonicalUrl, parameters, signature)) {
    return NextResponse.json({ error: "Invalid Twilio signature." }, { status: 401 });
  }

  const form = new URLSearchParams(rawBody);
  const callSid = form.get("CallSid");
  const providerStatus = form.get("CallStatus");
  if (!callSid || !providerStatus) {
    return NextResponse.json({ error: "Twilio call status payload is invalid." }, { status: 400 });
  }
  const status = mapTwilioCallStatus(providerStatus);
  if (!status) {
    return new NextResponse(null, { status: 204 });
  }

  const eventId = form.get("SequenceNumber")
    ? `${callSid}:${form.get("SequenceNumber")}`
    : createHash("sha256").update(rawBody).digest("hex");
  const durationValue = form.get("CallDuration");
  const durationSeconds = durationValue && /^\d+$/.test(durationValue)
    ? Number.parseInt(durationValue, 10)
    : undefined;

  try {
    const updated = await prisma.$transaction(async (transaction) => {
      const call = await transaction.call.findUnique({
        where: { twilioCallSid: callSid },
        select: { id: true, status: true },
      });
      if (!call) return null;

      await transaction.callEvent.create({
        data: {
          callId: call.id,
          eventType: "status_callback",
          source: "twilio",
          externalEventId: eventId,
          payload: {
            callSid,
            providerStatus,
            sequenceNumber: form.get("SequenceNumber"),
          } satisfies Prisma.InputJsonObject,
        },
      });

      const statusCanAdvance = !isTerminalCallStatus(call.status) || status === call.status;
      return transaction.call.update({
        where: { id: call.id },
        data: {
          ...(statusCanAdvance ? { status } : {}),
          ...(durationSeconds !== undefined ? { durationSeconds } : {}),
          ...(status === "failed"
            ? {
                failureCode: providerStatus.toLowerCase(),
                failureMessage: "Twilio reported that the call did not connect.",
              }
            : {}),
        },
        select: { id: true },
      });
    });

    if (!updated) {
      return NextResponse.json({ error: "Call record was not found." }, { status: 404 });
    }
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return new NextResponse(null, { status: 204 });
    }
    return NextResponse.json({ error: "Unable to persist Twilio call event." }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
