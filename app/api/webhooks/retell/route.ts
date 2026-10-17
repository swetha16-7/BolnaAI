import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/server/db";
import { verifyRetellSignature } from "@/lib/server/calls/webhook-signatures";
import {
  getRetellCallAllowedPreviousStatuses,
  getRetellWebhookCallUpdate,
  handleRetellWebhookRequest,
  synchronizeRetellCallEvent,
} from "@/lib/server/calls/retell-webhook";

function isPrismaUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "P2002",
  );
}

async function persistRetellWebhook(
  payload: Parameters<typeof synchronizeRetellCallEvent>[0],
  rawBody: string,
) {
  try {
    return await prisma.$transaction(async (transaction) =>
      synchronizeRetellCallEvent(payload, rawBody, {
        findByExternalCallId: async (callId) =>
          transaction.call.findFirst({
            where: { provider: "retell", externalCallId: callId },
            select: {
              id: true,
              status: true,
              agentId: true,
              externalCallId: true,
            },
          }),
        findUniqueLinkedAgentId: async (retellAgentId) => {
          const links = await transaction.providerLink.findMany({
            where: { provider: "retell", providerId: retellAgentId },
            select: { agentId: true },
            take: 2,
          });
          return links.length === 1 ? links[0].agentId : null;
        },
        findApplicationCall: async (applicationCallId, callId, localAgentId) =>
          transaction.call.findFirst({
            where: {
              id: applicationCallId,
              provider: "retell",
              agentId: localAgentId,
              OR: [{ externalCallId: null }, { externalCallId: callId }],
            },
            select: {
              id: true,
              status: true,
              agentId: true,
              externalCallId: true,
            },
          }),
        createEvent: async (input) => {
          const duplicate = await transaction.callEvent.findFirst({
            where: { source: "retell", externalEventId: input.externalEventId },
            select: { id: true },
          });
          if (duplicate) return false;

          await transaction.callEvent.create({
            data: {
              ...input,
              source: "retell",
              payload: input.payload satisfies Prisma.InputJsonObject,
            },
          });
          return true;
        },
        recordUnassociatedEvent: async (input) => {
          const queueId = `retell-webhook-${createHash("sha256")
            .update(input.externalEventId)
            .digest("hex")}`;
          const existing = await transaction.auditLog.findUnique({
            where: { id: queueId },
            select: { id: true },
          });
          if (existing) return false;

          let organizationId: string | null = null;
          if (input.retellAgentId) {
            const linkedAgents = await transaction.providerLink.findMany({
              where: {
                provider: "retell",
                providerId: input.retellAgentId,
              },
              select: {
                agent: { select: { organizationId: true } },
              },
              take: 2,
            });
            if (linkedAgents.length === 1) {
              organizationId = linkedAgents[0].agent.organizationId;
            }
          }

          await transaction.auditLog.create({
            data: {
              id: queueId,
              organizationId,
              entity: "retell_webhook",
              action: "pending_reconciliation",
              details: {
                provider: "retell",
                eventType: input.eventType,
                externalEventId: input.externalEventId,
                externalCallId: input.externalCallId,
                retellAgentId: input.retellAgentId,
              } satisfies Prisma.InputJsonObject,
            },
          });
          return true;
        },
        updateCall: async (callId, currentStatus, eventPayload) => {
          const update = getRetellWebhookCallUpdate(currentStatus, eventPayload);
          const { status, ...additionalData } = update;
          const externalCallId = eventPayload.call.call_id;
          if (status) {
            const updateResult = await transaction.call.updateMany({
              where: {
                id: callId,
                status: { in: getRetellCallAllowedPreviousStatuses(status) },
              },
              data: {
                ...additionalData,
                status,
                externalCallId,
              },
            });
            if (updateResult.count > 0) return;
          }

          await transaction.call.updateMany({
            where: { id: callId },
            data: {
              ...additionalData,
              externalCallId,
            },
          });
        },
      }),
    );
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      return "duplicate" as const;
    }
    throw error;
  }
}

export async function POST(request: Request) {
  const response = await handleRetellWebhookRequest(request, {
    apiKey: process.env.RETELL_API_KEY ?? null,
    verifySignature: verifyRetellSignature,
    persist: persistRetellWebhook,
  });
  return new NextResponse(response.body, {
    status: response.status,
    headers: response.headers,
  });
}
