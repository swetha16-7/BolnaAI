import { createHash } from "node:crypto";
import { z } from "zod";

import { isTerminalCallStatus, mapRetellCallStatus } from "./policy.ts";

const MAX_WEBHOOK_BYTES = 1_000_000;
const MAX_TIMESTAMP_MS = 8_640_000_000_000_000;
const MAX_DURATION_MS = 2_147_483_647_000;
const CALL_ID = /^[a-zA-Z0-9_-]{1,200}$/;

const retellWebhookSchema = z.object({
  event: z.string().min(1).max(100),
  call: z.object({
    call_id: z.string().regex(CALL_ID),
    agent_id: z.string().min(1).max(200).optional(),
    call_status: z.string().max(100).optional(),
    call_type: z.enum(["phone_call", "web_call"]).optional(),
    direction: z.enum(["inbound", "outbound"]).optional(),
    from_number: z.string().max(100).optional(),
    to_number: z.string().max(100).optional(),
    metadata: z.unknown().optional(),
    disconnection_reason: z.string().max(200).optional(),
    start_timestamp: z.number().finite().int().min(0).max(MAX_TIMESTAMP_MS).optional(),
    end_timestamp: z.number().finite().int().min(0).max(MAX_TIMESTAMP_MS).optional(),
    duration_ms: z.number().finite().int().min(0).max(MAX_DURATION_MS).optional(),
    transcript: z.string().max(MAX_WEBHOOK_BYTES).optional(),
    recording_url: z.string().max(4096).optional(),
    scrubbed_recording_url: z.string().max(4096).optional(),
    call_analysis: z.object({
      call_summary: z.string().max(MAX_WEBHOOK_BYTES).optional(),
    }).passthrough().optional(),
  }).passthrough(),
}).passthrough();

const lifecycleEvents = new Set([
  "call_started",
  "call_ended",
  "call_analyzed",
  "transcript_updated",
  "transfer_started",
  "transfer_bridged",
  "transfer_cancelled",
  "transfer_ended",
]);

export type RetellWebhookPayload = z.infer<typeof retellWebhookSchema>;
export type RetellWebhookCall = RetellWebhookPayload["call"];

export type RetellWebhookCallRecord = {
  id: string;
  status: string;
  agentId: string | null;
  externalCallId: string | null;
};

export type RetellWebhookPersistence = {
  findByExternalCallId: (callId: string) => Promise<RetellWebhookCallRecord | null>;
  findUniqueLinkedAgentId: (retellAgentId: string) => Promise<string | null>;
  findApplicationCall: (
    applicationCallId: string,
    callId: string,
    localAgentId: string,
  ) => Promise<RetellWebhookCallRecord | null>;
  createEvent: (input: {
    callId: string;
    eventType: string;
    externalEventId: string;
    payload: {
      event: string;
      callId: string;
      callStatus: string | null;
      disconnectionReason: string | null;
      startTimestamp: number | null;
      endTimestamp: number | null;
    };
  }) => Promise<boolean>;
  recordUnassociatedEvent: (input: {
    eventType: string;
    externalEventId: string;
    externalCallId: string;
    retellAgentId: string | null;
  }) => Promise<boolean>;
  updateCall: (
    callId: string,
    currentStatus: string,
    payload: RetellWebhookPayload,
  ) => Promise<void>;
};

export type RetellWebhookSyncResult = "updated" | "queued" | "duplicate";

export function getRetellCallAllowedPreviousStatuses(status: string): string[] {
  if (status === "initiated") return ["pending", "initiating", "initiated"];
  if (status === "in_progress") {
    return [
      "pending",
      "initiating",
      "initiated",
      "ringing",
      "submission_unknown",
      "in_progress",
    ];
  }
  return [
    "pending",
    "initiating",
    "initiated",
    "ringing",
    "submission_unknown",
    "in_progress",
    status,
  ];
}

function getApplicationCallId(metadata: unknown): string | null {
  if (
    metadata &&
    typeof metadata === "object" &&
    "applicationCallId" in metadata &&
    typeof metadata.applicationCallId === "string" &&
    metadata.applicationCallId.length > 0 &&
    metadata.applicationCallId.length <= 100
  ) {
    return metadata.applicationCallId;
  }
  return null;
}

function getExternalEventId(event: string, call: RetellWebhookCall, rawBody: string) {
  if (event === "transcript_updated") {
    return createHash("sha256").update(rawBody).digest("hex");
  }
  if (event.startsWith("transfer_")) {
    return `${event}:${call.call_id}:${call.start_timestamp ?? "unknown"}`;
  }
  return `${event}:${call.call_id}`;
}

function mayAdvanceCallStatus(currentStatus: string, nextStatus: string): boolean {
  if (currentStatus === nextStatus) return true;
  if (isTerminalCallStatus(currentStatus)) return false;

  const ranks: Record<string, number> = {
    pending: 0,
    initiating: 0,
    initiated: 1,
    ringing: 2,
    submission_unknown: 2,
    in_progress: 3,
    completed: 4,
    failed: 4,
    canceled: 4,
  };
  return (ranks[nextStatus] ?? -1) >= (ranks[currentStatus] ?? -1);
}

export function parseRetellWebhookPayload(rawBody: string): RetellWebhookPayload | null {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return null;
  }
  const parsed = retellWebhookSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

async function readBoundedBody(
  request: Request,
): Promise<{ body: string } | { error: "too_large" | "invalid_body" }> {
  if (!request.body) return { body: "" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_WEBHOOK_BYTES) {
        try {
          await reader.cancel();
        } catch {
          return { error: "too_large" };
        }
        return { error: "too_large" };
      }
      chunks.push(value);
    }

    const body = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { body: new TextDecoder("utf-8", { fatal: true }).decode(body) };
  } catch {
    return { error: "invalid_body" };
  }
}

export async function synchronizeRetellCallEvent(
  payload: RetellWebhookPayload,
  rawBody: string,
  persistence: RetellWebhookPersistence,
): Promise<RetellWebhookSyncResult> {
  const { event, call } = payload;
  const externalEventId = getExternalEventId(event, call, rawBody);
  const queueUnassociatedEvent = async (retellAgentId: string | null) =>
    await persistence.recordUnassociatedEvent({
      eventType: event,
      externalEventId,
      externalCallId: call.call_id,
      retellAgentId,
    })
      ? "queued" as const
      : "duplicate" as const;

  if (!lifecycleEvents.has(event)) {
    return queueUnassociatedEvent(call.agent_id ?? null);
  }

  let storedCall = await persistence.findByExternalCallId(call.call_id);
  if (storedCall) {
    if (call.agent_id && storedCall.agentId) {
      const linkedAgentId = await persistence.findUniqueLinkedAgentId(call.agent_id);
      if (linkedAgentId !== storedCall.agentId) {
        return queueUnassociatedEvent(null);
      }
    }
  } else {
    const applicationCallId = getApplicationCallId(call.metadata);
    const linkedAgentId = call.agent_id
      ? await persistence.findUniqueLinkedAgentId(call.agent_id)
      : null;

    if (applicationCallId && linkedAgentId && call.agent_id) {
      storedCall = await persistence.findApplicationCall(
        applicationCallId,
        call.call_id,
        linkedAgentId,
      );
    }
    if (!storedCall) {
      return queueUnassociatedEvent(linkedAgentId ? call.agent_id ?? null : null);
    }
  }

  const created = await persistence.createEvent({
    callId: storedCall.id,
    eventType: event,
    externalEventId,
    payload: {
      event,
      callId: call.call_id,
      callStatus: call.call_status ?? null,
      disconnectionReason: call.disconnection_reason ?? null,
      startTimestamp: call.start_timestamp ?? null,
      endTimestamp: call.end_timestamp ?? null,
    },
  });
  if (!created) {
    return "duplicate";
  }

  await persistence.updateCall(storedCall.id, storedCall.status, payload);
  return "updated";
}

export function getRetellWebhookCallUpdate(
  currentStatus: string,
  payload: RetellWebhookPayload,
) {
  const call = payload.call;
  const mappedStatus = mapRetellCallStatus(
    payload.event,
    call.call_status ?? "",
    call.disconnection_reason,
  );
  const statusCanAdvance = mappedStatus !== null &&
    mayAdvanceCallStatus(currentStatus, mappedStatus);
  const calculatedDuration = call.start_timestamp !== undefined &&
      call.end_timestamp !== undefined &&
      call.end_timestamp >= call.start_timestamp
    ? Math.floor((call.end_timestamp - call.start_timestamp) / 1000)
    : undefined;
  const durationSeconds = call.duration_ms !== undefined
    ? Math.floor(call.duration_ms / 1000)
    : calculatedDuration !== undefined && calculatedDuration <= 2_147_483_647
      ? calculatedDuration
      : undefined;
  const recordingUrl = call.scrubbed_recording_url ?? call.recording_url;
  let safeRecordingUrl: string | undefined;
  if (recordingUrl) {
    try {
      const url = new URL(recordingUrl);
      if (url.protocol === "https:" && !url.username && !url.password) {
        safeRecordingUrl = url.toString();
      }
    } catch {
      safeRecordingUrl = undefined;
    }
  }

  return {
    ...(statusCanAdvance && mappedStatus ? { status: mappedStatus } : {}),
    ...(call.direction ? { direction: call.direction } : {}),
    ...(call.from_number ? { callerNumber: call.from_number } : {}),
    ...(call.to_number ? { destination: call.to_number } : {}),
    ...(call.start_timestamp !== undefined
      ? { startedAt: new Date(call.start_timestamp) }
      : {}),
    ...(call.end_timestamp !== undefined
      ? { endedAt: new Date(call.end_timestamp) }
      : {}),
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
    ...(call.transcript !== undefined ? { transcript: call.transcript } : {}),
    ...(call.call_analysis?.call_summary
      ? { outcome: call.call_analysis.call_summary }
      : {}),
    ...(safeRecordingUrl ? { recordingUrl: safeRecordingUrl } : {}),
    ...(mappedStatus === "failed"
      ? {
          failureCode: call.disconnection_reason ?? "provider_call_failed",
          failureMessage: "The provider reported that the call did not connect.",
        }
      : {}),
  };
}

export async function handleRetellWebhookRequest(
  request: Request,
  dependencies: {
    apiKey: string | null;
    verifySignature: (rawBody: string, apiKey: string, signature: string) => Promise<boolean>;
    persist: (
      payload: RetellWebhookPayload,
      rawBody: string,
    ) => Promise<RetellWebhookSyncResult>;
  },
): Promise<Response> {
  const apiKey = dependencies.apiKey?.trim();
  if (!apiKey) {
    return Response.json(
      { error: "Retell webhook verification is not configured." },
      { status: 503 },
    );
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_WEBHOOK_BYTES) {
    return Response.json({ error: "Webhook body is too large." }, { status: 413 });
  }
  const readResult = await readBoundedBody(request);
  if ("error" in readResult) {
    return readResult.error === "too_large"
      ? Response.json({ error: "Webhook body is too large." }, { status: 413 })
      : Response.json({ error: "Webhook body is invalid." }, { status: 400 });
  }
  const rawBody = readResult.body;

  const signature = request.headers.get("x-retell-signature");
  if (!signature) {
    return Response.json({ error: "Missing Retell signature." }, { status: 401 });
  }
  let isValidSignature = false;
  try {
    isValidSignature = await dependencies.verifySignature(rawBody, apiKey, signature);
  } catch {
    isValidSignature = false;
  }
  if (!isValidSignature) {
    return Response.json({ error: "Invalid Retell signature." }, { status: 401 });
  }

  const payload = parseRetellWebhookPayload(rawBody);
  if (!payload) {
    return Response.json({ error: "Retell webhook payload is invalid." }, { status: 400 });
  }

  try {
    await dependencies.persist(payload, rawBody);
  } catch {
    return Response.json({ error: "Unable to persist Retell call event." }, { status: 500 });
  }

  return new Response(null, { status: 204 });
}
