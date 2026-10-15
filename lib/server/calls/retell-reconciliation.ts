import { randomUUID } from "node:crypto";

import {
  type RetellWebhookCall,
  type RetellWebhookPayload,
} from "./retell-webhook.ts";

const RECONCILABLE_EVENTS = new Set([
  "call_started",
  "call_ended",
  "call_analyzed",
  "transcript_updated",
  "transfer_started",
  "transfer_bridged",
  "transfer_cancelled",
  "transfer_ended",
]);

const CALL_ID = /^[a-zA-Z0-9_-]{1,200}$/;

export type RetellReconciliationEntry = {
  id: string;
  organizationId: string | null;
  details: unknown;
  claimAction: string;
};

export type RetellReconciliationCallRecord = {
  id: string;
  status: string;
  agentId: string | null;
  externalCallId: string | null;
  organizationId: string;
  transcript?: string | null;
  outcome?: string | null;
};

export type RetellAgentOwnership = {
  agentId: string;
  organizationId: string;
};

export class RetellReconciliationInvalidResponseError extends Error {
  constructor() {
    super("Retell returned an invalid call response for reconciliation.");
    this.name = "RetellReconciliationInvalidResponseError";
  }
}

export type RetellReconciliationPersistence = {
  claimPending: (input: {
    limit: number;
    now: string;
    leaseExpiresAt: string;
    claimAction: string;
  }) => Promise<RetellReconciliationEntry[]>;
  findUniqueAgentOwnership: (
    retellAgentId: string,
  ) => Promise<RetellAgentOwnership | null>;
  findByExternalCallId: (
    callId: string,
  ) => Promise<RetellReconciliationCallRecord | null>;
  findApplicationCall: (
    applicationCallId: string,
    callId: string,
    ownership: RetellAgentOwnership,
  ) => Promise<RetellReconciliationCallRecord | null>;
  retrieveCall: (callId: string) => Promise<RetellWebhookCall>;
  commit: (input: {
    entry: RetellReconciliationEntry;
    eventType: string;
    externalEventId: string;
    callRecordId: string;
    callMatch: "external_call_id" | "application_call_id";
    ownership: RetellAgentOwnership;
    payload: RetellWebhookPayload;
    now: string;
  }) => Promise<"reconciled" | "duplicate" | "stale" | "identity_mismatch">;
  defer: (
    entry: RetellReconciliationEntry,
    failureCategory: string,
    now: string,
  ) => Promise<void>;
};

export type RetellReconciliationResult = {
  claimed: number;
  reconciled: number;
  duplicates: number;
  deferred: number;
};

type ParsedQueueDetails = {
  eventType: string;
  externalEventId: string;
  externalCallId: string;
  retellAgentId: string | null;
};

function parseQueueDetails(details: unknown): ParsedQueueDetails | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const value = details as Record<string, unknown>;
  if (
    value.provider !== "retell" ||
    typeof value.eventType !== "string" ||
    value.eventType.length === 0 ||
    value.eventType.length > 100 ||
    typeof value.externalEventId !== "string" ||
    value.externalEventId.length === 0 ||
    value.externalEventId.length > 512 ||
    typeof value.externalCallId !== "string" ||
    !CALL_ID.test(value.externalCallId) ||
    (value.retellAgentId !== null &&
      value.retellAgentId !== undefined &&
      (typeof value.retellAgentId !== "string" || value.retellAgentId.length > 200))
  ) {
    return null;
  }
  return {
    eventType: value.eventType,
    externalEventId: value.externalEventId,
    externalCallId: value.externalCallId,
    retellAgentId: typeof value.retellAgentId === "string"
      ? value.retellAgentId
      : null,
  };
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

async function processEntry(
  entry: RetellReconciliationEntry,
  persistence: RetellReconciliationPersistence,
  now: string,
): Promise<"reconciled" | "duplicate" | "deferred"> {
  const details = parseQueueDetails(entry.details);
  if (!details) {
    await persistence.defer(entry, "invalid_queue_entry", now);
    return "deferred";
  }
  if (!RECONCILABLE_EVENTS.has(details.eventType)) {
    await persistence.defer(entry, "unsupported_event", now);
    return "deferred";
  }

  let call: RetellWebhookCall;
  try {
    call = await persistence.retrieveCall(details.externalCallId);
  } catch (error) {
    await persistence.defer(
      entry,
      error instanceof RetellReconciliationInvalidResponseError
        ? "invalid_provider_response"
        : "provider_unavailable",
      now,
    );
    return "deferred";
  }

  if (
    call.call_id !== details.externalCallId ||
    !call.agent_id ||
    (details.retellAgentId !== null && details.retellAgentId !== call.agent_id)
  ) {
    await persistence.defer(entry, "provider_identity_mismatch", now);
    return "deferred";
  }

  const ownership = await persistence.findUniqueAgentOwnership(call.agent_id);
  if (!ownership) {
    await persistence.defer(entry, "ambiguous_agent_ownership", now);
    return "deferred";
  }
  if (entry.organizationId && entry.organizationId !== ownership.organizationId) {
    await persistence.defer(entry, "organization_mismatch", now);
    return "deferred";
  }

  let callRecord = await persistence.findByExternalCallId(call.call_id);
  let callMatch: "external_call_id" | "application_call_id" = "external_call_id";
  if (callRecord) {
    if (
      callRecord.organizationId !== ownership.organizationId ||
      callRecord.agentId !== ownership.agentId ||
      callRecord.externalCallId !== call.call_id
    ) {
      await persistence.defer(entry, "local_call_identity_mismatch", now);
      return "deferred";
    }
  } else {
    const applicationCallId = getApplicationCallId(call.metadata);
    callRecord = applicationCallId
      ? await persistence.findApplicationCall(
          applicationCallId,
          call.call_id,
          ownership,
        )
      : null;
    callMatch = "application_call_id";
    if (!callRecord) {
      await persistence.defer(entry, "local_call_not_found", now);
      return "deferred";
    }
    if (
      callRecord.organizationId !== ownership.organizationId ||
      callRecord.agentId !== ownership.agentId ||
      (callRecord.externalCallId !== null &&
        callRecord.externalCallId !== call.call_id)
    ) {
      await persistence.defer(entry, "local_call_identity_mismatch", now);
      return "deferred";
    }
  }

  const updatePayload: RetellWebhookPayload = {
    event: "call_analyzed",
    call,
  };
  const commitResult = await persistence.commit({
    entry,
    eventType: details.eventType,
    externalEventId: details.externalEventId,
    callRecordId: callRecord.id,
    callMatch,
    ownership,
    payload: updatePayload,
    now,
  });
  if (commitResult === "reconciled") return "reconciled";
  if (commitResult === "duplicate") return "duplicate";
  await persistence.defer(
    entry,
    commitResult === "identity_mismatch"
      ? "local_call_identity_mismatch"
      : "claim_expired",
    now,
  );
  return "deferred";
}

export async function reconcilePendingRetellEvents(
  persistence: RetellReconciliationPersistence,
  options: {
    limit?: number;
    concurrency?: number;
    now?: Date;
    leaseDurationMs?: number;
  } = {},
): Promise<RetellReconciliationResult> {
  const limit = Math.min(50, Math.max(1, options.limit ?? 10));
  const concurrency = Math.min(limit, Math.max(1, options.concurrency ?? 5));
  const nowDate = options.now ?? new Date();
  const now = nowDate.toISOString();
  const leaseExpiresAt = new Date(
    nowDate.getTime() + (options.leaseDurationMs ?? 120_000),
  ).toISOString();
  const claimAction = `reconciliation_in_progress:${randomUUID()}`;
  const entries = await persistence.claimPending({
    limit,
    now,
    leaseExpiresAt,
    claimAction,
  });
  const result: RetellReconciliationResult = {
    claimed: entries.length,
    reconciled: 0,
    duplicates: 0,
    deferred: 0,
  };

  let nextIndex = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (nextIndex < entries.length) {
      const entry = entries[nextIndex];
      nextIndex += 1;
      try {
        const outcome = await processEntry(entry, persistence, now);
        result[outcome === "reconciled"
          ? "reconciled"
          : outcome === "duplicate"
            ? "duplicates"
            : "deferred"] += 1;
      } catch {
        try {
          await persistence.defer(entry, "reconciliation_failed", now);
        } catch {
          // The expiring lease keeps the entry retryable if the database is unavailable.
        }
        result.deferred += 1;
      }
    }
  });
  await Promise.all(workers);
  return result;
}
