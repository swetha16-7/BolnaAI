import { Prisma, type PrismaClient } from "@prisma/client";

import { prisma } from "../db.ts";
import {
  getRetellCallAllowedPreviousStatuses,
  getRetellWebhookCallUpdate,
} from "./retell-webhook.ts";
import type {
  RetellAgentOwnership,
  RetellReconciliationCallRecord,
  RetellReconciliationEntry,
  RetellReconciliationPersistence,
} from "./retell-reconciliation.ts";

type ClaimedAuditLog = {
  id: string;
  organizationId: string | null;
  details: Prisma.JsonValue | null;
  action: string;
};

class RetellReconciliationTransactionError extends Error {
  constructor(readonly result: "stale" | "identity_mismatch") {
    super("Retell reconciliation transaction could not complete.");
  }
}

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "P2002",
  );
}

function asDetailsObject(details: unknown): Record<string, unknown> {
  return details && typeof details === "object" && !Array.isArray(details)
    ? { ...details as Record<string, unknown> }
    : {};
}

function withoutLease(details: unknown) {
  const value = asDetailsObject(details);
  delete value.leaseExpiresAt;
  return value;
}

function callWhere(
  callRecordId: string,
  callId: string,
  ownership: RetellAgentOwnership,
  callMatch: "external_call_id" | "application_call_id",
) {
  return {
    id: callRecordId,
    provider: "retell",
    organizationId: ownership.organizationId,
    agentId: ownership.agentId,
    ...(callMatch === "external_call_id"
      ? { externalCallId: callId }
      : { OR: [{ externalCallId: null }, { externalCallId: callId }] }),
  };
}

async function markReconciled(
  transaction: Prisma.TransactionClient,
  input: {
    entry: RetellReconciliationEntry;
    ownership: RetellAgentOwnership;
    callRecordId: string;
    now: string;
  },
) {
  const details = {
    ...withoutLease(input.entry.details),
    reconciledCallId: input.callRecordId,
    reconciledAt: input.now,
  } satisfies Prisma.InputJsonObject;
  const result = await transaction.auditLog.updateMany({
    where: { id: input.entry.id, action: input.entry.claimAction },
    data: {
      organizationId: input.ownership.organizationId,
      action: "reconciled",
      details,
    },
  });
  return result.count === 1;
}

async function commitReconciliation(
  database: PrismaClient,
  input: Parameters<RetellReconciliationPersistence["commit"]>[0],
): Promise<"reconciled" | "duplicate" | "stale" | "identity_mismatch"> {
  try {
    return await database.$transaction(async (transaction) => {
      const claimedEntry = await transaction.auditLog.findFirst({
        where: {
          id: input.entry.id,
          action: input.entry.claimAction,
          entity: "retell_webhook",
        },
        select: { id: true },
      });
      if (!claimedEntry) return "stale";

      const baseWhere = callWhere(
        input.callRecordId,
        input.payload.call.call_id,
        input.ownership,
        input.callMatch,
      );
      const callRecord = await transaction.call.findFirst({
        where: baseWhere,
        select: {
          id: true,
          status: true,
          agentId: true,
          externalCallId: true,
          organizationId: true,
        },
      });
      if (!callRecord) return "identity_mismatch";

      const existingEvent = await transaction.callEvent.findFirst({
        where: {
          source: "retell",
          externalEventId: input.externalEventId,
        },
        select: { callId: true },
      });
      if (existingEvent) {
        if (existingEvent.callId !== callRecord.id) return "identity_mismatch";
        const marked = await markReconciled(transaction, {
          entry: input.entry,
          ownership: input.ownership,
          callRecordId: callRecord.id,
          now: input.now,
        });
        return marked ? "duplicate" : "stale";
      }

      await transaction.callEvent.create({
        data: {
          callId: callRecord.id,
          eventType: input.eventType,
          source: "retell",
          externalEventId: input.externalEventId,
          payload: {
            event: input.eventType,
            callId: input.payload.call.call_id,
            callStatus: input.payload.call.call_status ?? null,
            disconnectionReason: input.payload.call.disconnection_reason ?? null,
            startTimestamp: input.payload.call.start_timestamp ?? null,
            endTimestamp: input.payload.call.end_timestamp ?? null,
          } satisfies Prisma.InputJsonObject,
        },
      });

      const update = getRetellWebhookCallUpdate(callRecord.status, input.payload);
      const { status, ...additionalData } = update;
      const updateBase = {
        ...baseWhere,
        ...(input.callMatch === "application_call_id"
          ? { OR: [{ externalCallId: null }, { externalCallId: input.payload.call.call_id }] }
          : {}),
      };
      if (status) {
        const statusUpdate = await transaction.call.updateMany({
          where: {
            ...updateBase,
            status: { in: getRetellCallAllowedPreviousStatuses(status) },
          },
          data: {
            ...additionalData,
            status,
            externalCallId: input.payload.call.call_id,
          },
        });
        if (statusUpdate.count === 0) {
          const fieldsUpdate = await transaction.call.updateMany({
            where: updateBase,
            data: {
              ...additionalData,
              externalCallId: input.payload.call.call_id,
            },
          });
          if (fieldsUpdate.count === 0) {
            throw new RetellReconciliationTransactionError("identity_mismatch");
          }
        }
      } else {
        const fieldsUpdate = await transaction.call.updateMany({
          where: updateBase,
          data: {
            ...additionalData,
            externalCallId: input.payload.call.call_id,
          },
        });
        if (fieldsUpdate.count === 0) {
          throw new RetellReconciliationTransactionError("identity_mismatch");
        }
      }

      const marked = await markReconciled(transaction, {
        entry: input.entry,
        ownership: input.ownership,
        callRecordId: callRecord.id,
        now: input.now,
      });
      if (!marked) throw new RetellReconciliationTransactionError("stale");
      return "reconciled";
    });
  } catch (error) {
    if (error instanceof RetellReconciliationTransactionError) {
      return error.result;
    }
    if (!isPrismaUniqueConstraintError(error)) throw error;

    const existingEvent = await database.callEvent.findFirst({
      where: {
        source: "retell",
        externalEventId: input.externalEventId,
      },
      select: { callId: true },
    });
    if (existingEvent?.callId !== input.callRecordId) throw error;
    const marked = await database.$transaction((transaction) =>
      markReconciled(transaction, {
        entry: input.entry,
        ownership: input.ownership,
        callRecordId: input.callRecordId,
        now: input.now,
      }),
    );
    return marked ? "duplicate" : "stale";
  }
}

export function createRetellReconciliationPersistence(
  database: PrismaClient = prisma,
): Omit<RetellReconciliationPersistence, "retrieveCall"> {
  return {
    claimPending: async ({ limit, now, leaseExpiresAt, claimAction }) => {
      const rows = await database.$queryRaw<ClaimedAuditLog[]>`
        WITH candidates AS (
          SELECT id
          FROM "AuditLog"
          WHERE entity = 'retell_webhook'
            AND (
              action = 'pending_reconciliation'
              OR (
                action LIKE 'reconciliation_in_progress:%'
                AND COALESCE(details->>'leaseExpiresAt', '') <= ${now}
              )
            )
          ORDER BY "createdAt" ASC
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        )
        UPDATE "AuditLog" AS entry
        SET action = ${claimAction},
            details = jsonb_set(
              COALESCE(entry.details, '{}'::jsonb),
              '{leaseExpiresAt}',
              to_jsonb(${leaseExpiresAt}::text),
              true
            )
        FROM candidates
        WHERE entry.id = candidates.id
        RETURNING entry.id, entry."organizationId", entry.details, entry.action
      `;
      return rows.map((row) => ({
        id: row.id,
        organizationId: row.organizationId,
        details: row.details,
        claimAction: row.action,
      }));
    },
    findUniqueAgentOwnership: async (retellAgentId) => {
      const links = await database.providerLink.findMany({
        where: { provider: "retell", providerId: retellAgentId },
        select: {
          agentId: true,
          agent: { select: { organizationId: true } },
        },
        take: 2,
      });
      return links.length === 1
        ? {
            agentId: links[0].agentId,
            organizationId: links[0].agent.organizationId,
          }
        : null;
    },
    findByExternalCallId: async (callId) =>
      database.call.findFirst({
        where: { provider: "retell", externalCallId: callId },
        select: {
          id: true,
          status: true,
          agentId: true,
          externalCallId: true,
          organizationId: true,
        },
      }) as Promise<RetellReconciliationCallRecord | null>,
    findApplicationCall: async (applicationCallId, callId, ownership) =>
      database.call.findFirst({
        where: {
          id: applicationCallId,
          provider: "retell",
          organizationId: ownership.organizationId,
          agentId: ownership.agentId,
          OR: [{ externalCallId: null }, { externalCallId: callId }],
        },
        select: {
          id: true,
          status: true,
          agentId: true,
          externalCallId: true,
          organizationId: true,
        },
      }) as Promise<RetellReconciliationCallRecord | null>,
    commit: (input) => commitReconciliation(database, input),
    defer: async (entry, failureCategory, now) => {
      const details = asDetailsObject(entry.details);
      delete details.leaseExpiresAt;
      const retryCount = typeof details.retryCount === "number" &&
          Number.isInteger(details.retryCount) &&
          details.retryCount >= 0
        ? details.retryCount + 1
        : 1;
      await database.auditLog.updateMany({
        where: { id: entry.id, action: entry.claimAction },
        data: {
          action: "pending_reconciliation",
          details: {
            ...details,
            retryCount,
            lastAttemptAt: now,
            lastFailureCategory: failureCategory,
          } satisfies Prisma.InputJsonObject,
        },
      });
    },
  };
}
