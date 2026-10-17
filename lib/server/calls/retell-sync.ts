import { prisma } from "../db.ts";
import { createRetellClient } from "./retell.ts";
import { ACTIVE_CALL_STATUSES, isTerminalCallStatus, mapRetellCallStatus } from "./policy.ts";

export type SynchronizedCallSummary = {
  id: string;
  externalCallId: string;
  previousStatus: string;
  newStatus: string;
  isTerminal: boolean;
};

export type RetellSyncDependencies = {
  client?: {
    call: {
      retrieve: (callId: string) => Promise<{
        call_status?: string;
        disconnection_reason?: string;
        duration_ms?: number;
        start_timestamp?: number;
        end_timestamp?: number;
        transcript?: string;
      }>;
    };
  };
  now?: () => Date;
};

const callSyncCooldown = new Map<string, number>();
const SYNC_COOLDOWN_MS = 2500;

export function clearCallSyncCooldown(): void {
  callSyncCooldown.clear();
}

/**
 * Safely synchronizes active non-terminal Retell calls for an organization.
 * Fetches call state from Retell's read API, updates the database, and transitions ended calls to terminal states.
 * Fails gracefully on network or provider errors without exposing sensitive information.
 */
export async function synchronizeActiveRetellCalls(
  organizationId: string,
  apiKey: string | undefined = process.env.RETELL_API_KEY,
  dependencies: RetellSyncDependencies = {},
): Promise<SynchronizedCallSummary[]> {
  if (!dependencies.client && (!apiKey || !apiKey.trim())) {
    return [];
  }

  // Find non-terminal calls with externalCallId belonging to this organization
  const activeCalls = await prisma.call.findMany({
    where: {
      organizationId,
      provider: "retell",
      externalCallId: { not: null },
      status: { in: [...ACTIVE_CALL_STATUSES] },
    },
    select: {
      id: true,
      status: true,
      externalCallId: true,
      startedAt: true,
      endedAt: true,
      durationSeconds: true,
      transcript: true,
    },
    take: 10,
  });

  if (activeCalls.length === 0) {
    return [];
  }

  const client = dependencies.client ?? createRetellClient(apiKey as string);
  const synchronized: SynchronizedCallSummary[] = [];
  const now = dependencies.now ? dependencies.now() : new Date();

  for (const localCall of activeCalls) {
    if (!localCall.externalCallId) continue;

    // Cooldown check to avoid unnecessary Retell API calls during fast polling
    const lastPolled = callSyncCooldown.get(localCall.externalCallId);
    if (!dependencies.client && lastPolled && now.getTime() - lastPolled < SYNC_COOLDOWN_MS) {
      continue;
    }
    callSyncCooldown.set(localCall.externalCallId, now.getTime());

    try {
      const remoteCall = await client.call.retrieve(localCall.externalCallId);
      const mappedStatus = mapRetellCallStatus(
        "poll",
        remoteCall.call_status ?? "",
        remoteCall.disconnection_reason,
      );

      const statusChanged = Boolean(mappedStatus && mappedStatus !== localCall.status);
      const durationSeconds = typeof remoteCall.duration_ms === "number" && remoteCall.duration_ms >= 0
        ? Math.floor(remoteCall.duration_ms / 1000)
        : undefined;

      const startedAt = typeof remoteCall.start_timestamp === "number" && remoteCall.start_timestamp > 0
        ? new Date(remoteCall.start_timestamp)
        : undefined;

      const endedAt = typeof remoteCall.end_timestamp === "number" && remoteCall.end_timestamp > 0
        ? new Date(remoteCall.end_timestamp)
        : undefined;

      const dataToUpdate: Record<string, unknown> = {};

      if (statusChanged && mappedStatus) {
        dataToUpdate.status = mappedStatus;
      }
      if (startedAt && !localCall.startedAt) {
        dataToUpdate.startedAt = startedAt;
      }
      if (endedAt && !localCall.endedAt) {
        dataToUpdate.endedAt = endedAt;
      }
      if (durationSeconds !== undefined && durationSeconds !== localCall.durationSeconds) {
        dataToUpdate.durationSeconds = durationSeconds;
      }
      let transcriptText = "";
      if (typeof remoteCall.transcript === "string" && remoteCall.transcript.trim()) {
        transcriptText = remoteCall.transcript.trim();
      } else if (Array.isArray((remoteCall as { transcript_object?: Array<{ role?: string; content?: string }> }).transcript_object)) {
        const transcriptObj = (remoteCall as { transcript_object?: Array<{ role?: string; content?: string }> }).transcript_object;
        if (transcriptObj && transcriptObj.length > 0) {
          transcriptText = transcriptObj
            .map((item) => `${item.role === "agent" ? "Agent" : "User"}: ${item.content || ""}`.trim())
            .filter(Boolean)
            .join("\n");
        }
      }
      if (transcriptText && transcriptText !== localCall.transcript) {
        dataToUpdate.transcript = transcriptText;
      }

      const finalStatus = (dataToUpdate.status as string) || localCall.status;
      if (isTerminalCallStatus(finalStatus) && !endedAt && !localCall.endedAt) {
        dataToUpdate.endedAt = now;
      }

      if (isTerminalCallStatus(finalStatus)) {
        callSyncCooldown.delete(localCall.externalCallId);
      }

      if (Object.keys(dataToUpdate).length > 0) {
        await prisma.call.update({
          where: { id: localCall.id },
          data: dataToUpdate,
        });

        synchronized.push({
          id: localCall.id,
          externalCallId: localCall.externalCallId,
          previousStatus: localCall.status,
          newStatus: finalStatus,
          isTerminal: isTerminalCallStatus(finalStatus),
        });
      }
    } catch {
      // Graceful error handling: API failures or timeouts leave the database in its existing state
      continue;
    }
  }

  return synchronized;
}
