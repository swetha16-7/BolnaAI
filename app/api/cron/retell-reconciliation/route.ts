import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { redactSensitiveData } from "@/lib/server/safe-logging";
import { getRetellApiKey } from "@/lib/server/providers/configuration";
import { createRetellClient } from "@/lib/server/calls/retell";
import {
  parseRetellWebhookPayload,
  type RetellWebhookCall,
} from "@/lib/server/calls/retell-webhook";
import {
  reconcilePendingRetellEvents,
  RetellReconciliationInvalidResponseError,
} from "@/lib/server/calls/retell-reconciliation";
import { createRetellReconciliationPersistence } from "@/lib/server/calls/retell-reconciliation-store";
import { handleRetellReconciliationRequest } from "@/lib/server/calls/retell-reconciliation-endpoint";

export const runtime = "nodejs";
export const maxDuration = 60;

const BATCH_SIZE = 10;
const CONCURRENCY = 5;

function isAuthorized(request: Request, secret: string): boolean {
  const authorization = request.headers.get("authorization");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!authorization || authorization.length !== expected.length) return false;
  const actual = Buffer.from(authorization);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function getApplicationCallId(metadata: unknown): string | null {
  if (
    !metadata ||
    typeof metadata !== "object" ||
    Array.isArray(metadata) ||
    !("applicationCallId" in metadata)
  ) {
    return null;
  }
  const value = metadata.applicationCallId;
  return typeof value === "string" && value.length > 0 && value.length <= 100
    ? value
    : null;
}

async function retrieveRetellCall(
  client: ReturnType<typeof createRetellClient>,
  callId: string,
): Promise<RetellWebhookCall> {
  const providerCall = await client.call.retrieve(callId);

  if (
    !providerCall ||
    providerCall.call_id !== callId ||
    typeof providerCall.agent_id !== "string" ||
    providerCall.agent_id.length === 0 ||
    !["registered", "not_connected", "ongoing", "ended", "error"].includes(
      providerCall.call_status,
    ) ||
    !["phone_call", "web_call"].includes(providerCall.call_type)
  ) {
    throw new RetellReconciliationInvalidResponseError();
  }

  const call: Record<string, unknown> = {
    call_id: providerCall.call_id,
    agent_id: providerCall.agent_id,
    call_status: providerCall.call_status,
    call_type: providerCall.call_type,
  };
  if (
    "direction" in providerCall &&
    (providerCall.direction === "inbound" || providerCall.direction === "outbound")
  ) {
    call.direction = providerCall.direction;
  }
  if ("from_number" in providerCall && typeof providerCall.from_number === "string") {
    call.from_number = providerCall.from_number;
  }
  if ("to_number" in providerCall && typeof providerCall.to_number === "string") {
    call.to_number = providerCall.to_number;
  }
  if (typeof providerCall.disconnection_reason === "string") {
    call.disconnection_reason = providerCall.disconnection_reason;
  }
  if (typeof providerCall.start_timestamp === "number") {
    call.start_timestamp = providerCall.start_timestamp;
  }
  if (typeof providerCall.end_timestamp === "number") {
    call.end_timestamp = providerCall.end_timestamp;
  }
  if (typeof providerCall.duration_ms === "number") call.duration_ms = providerCall.duration_ms;
  if (typeof providerCall.transcript === "string") call.transcript = providerCall.transcript;
  if (typeof providerCall.recording_url === "string") {
    call.recording_url = providerCall.recording_url;
  }
  if (typeof providerCall.scrubbed_recording_url === "string") {
    call.scrubbed_recording_url = providerCall.scrubbed_recording_url;
  }
  if (typeof providerCall.call_analysis?.call_summary === "string") {
    call.call_analysis = { call_summary: providerCall.call_analysis.call_summary };
  }
  const applicationCallId = getApplicationCallId(providerCall.metadata);
  if (applicationCallId) call.metadata = { applicationCallId };

  const parsed = parseRetellWebhookPayload(JSON.stringify({
    event: "call_analyzed",
    call,
  }));
  if (!parsed) throw new RetellReconciliationInvalidResponseError();
  return parsed.call;
}

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret || cronSecret.length < 32) {
    return NextResponse.json(
      { error: "Retell reconciliation is not configured on the server." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!isAuthorized(request, cronSecret)) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  let apiKey: string | null = null;
  try {
    return await handleRetellReconciliationRequest(request, async () => {
      apiKey = getRetellApiKey();
      if (!apiKey) {
        return NextResponse.json(
          { error: "Retell reconciliation is not configured on the server." },
          { status: 503, headers: { "Cache-Control": "no-store" } },
        );
      }

      const persistence = createRetellReconciliationPersistence();
      const client = createRetellClient(apiKey);
      const result = await reconcilePendingRetellEvents({
        ...persistence,
        retrieveCall: (callId) => retrieveRetellCall(client, callId),
      }, {
        limit: BATCH_SIZE,
        concurrency: CONCURRENCY,
      });
      return NextResponse.json(result, {
        headers: { "Cache-Control": "no-store" },
      });
    });
  } catch (error) {
    console.error("[retell-reconciliation] failed", {
      route: "/api/cron/retell-reconciliation",
      authorizationHeaderPresent: request.headers.has("authorization"),
      apiKeyConfigured: Boolean(apiKey),
      cronSecretConfigured: Boolean(cronSecret),
      error: redactSensitiveData(error),
    });
    return NextResponse.json(
      { error: "Unable to run Retell reconciliation. The pending entries remain retryable." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
