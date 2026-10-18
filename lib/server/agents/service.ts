import type Retell from "retell-sdk";
import type { z } from "zod";

import { prisma as defaultPrisma } from "../db.ts";
import { organizationScope } from "../auth/tenant-scope.ts";
import { agentPublicSelect } from "../selects.ts";
import { presentAgent } from "../agent-response.ts";
import {
  createRetellAgentWithLlm,
  deleteRetellAgentAndLlm,
  getRetellAgentCreateFailure,
  type CreatedRetellAgentResult,
} from "../calls/retell.ts";
import type { agentSchema } from "../validation/schemas.ts";

export type AgentInput = z.infer<typeof agentSchema>;

import type { Prisma } from "@prisma/client";

export type AgentPublicPayload = Prisma.AgentGetPayload<{ select: typeof agentPublicSelect }>;
export type PresentedAgent = ReturnType<typeof presentAgent<AgentPublicPayload>>;

export type CreateAgentResult =
  | { success: true; status: 200 | 201; agent: PresentedAgent }
  | { success: false; status: number; error: string };

// In-flight request deduplication map to prevent race-condition duplicate provider creations
const inFlightCreations = new Map<string, Promise<CreateAgentResult>>();

export async function createOrganizationAgent(input: {
  organizationId: string;
  userId: string;
  data: AgentInput;
  idempotencyKey?: string | null;
  retellClient: Retell;
  db?: typeof defaultPrisma;
}): Promise<CreateAgentResult> {
  const {
    organizationId,
    userId,
    data,
    idempotencyKey,
    retellClient,
    db = defaultPrisma,
  } = input;

  // 1. Idempotency Check: if idempotencyKey is supplied, check if an agent was already created
  if (idempotencyKey) {
    const existing = await db.agent.findFirst({
      where: {
        ...organizationScope(organizationId),
        providerLinks: {
          some: {
            provider: "retell",
            metadata: {
              path: ["idempotencyKey"],
              equals: idempotencyKey,
            },
          },
        },
      },
      select: agentPublicSelect,
    });

    if (existing) {
      return {
        success: true,
        status: 200,
        agent: presentAgent(existing),
      };
    }
  }

  // 2. In-flight race-condition protection: serialize concurrent requests with identical (org, idempotencyKey)
  const inFlightKey = idempotencyKey ? `${organizationId}:${idempotencyKey}` : null;
  if (inFlightKey && inFlightCreations.has(inFlightKey)) {
    return await inFlightCreations.get(inFlightKey)!;
  }

  const execute = async (): Promise<CreateAgentResult> => {
    // 3. Create Retell agent + LLM via Retell SDK
    let retellResult: CreatedRetellAgentResult;
    try {
      retellResult = await createRetellAgentWithLlm(retellClient, {
        name: data.name,
        type: data.type,
        timezone: data.timezone,
        voiceName: data.voiceName,
        provider: data.provider,
        speed: data.speed,
        greeting: data.greeting,
        systemPrompt: data.systemPrompt,
        fallback: data.fallback,
        kbFaqs: data.kbFaqs,
        workingDays: data.workingDays,
        hoursStart: data.hoursStart,
        hoursEnd: data.hoursEnd,
      });
    } catch (providerError) {
      const failure = getRetellAgentCreateFailure(providerError);
      return {
        success: false,
        status: failure.status,
        error: failure.message,
      };
    }

    // 4. Persist to database in a transaction
    try {
      const agent = await db.$transaction(async (tx) => {
        const createdAgent = await tx.agent.create({
          data: {
            organizationId,
            createdByUserId: userId,
            name: data.name,
            type: data.type,
            timezone: data.timezone,
            provider: data.provider ?? "Deepgram",
            voiceName: data.voiceName ?? "Aura-Asteria",
            speed: data.speed ?? 1,
            languages: data.languages,
            greeting: data.greeting ?? "Hello.",
            systemPrompt: data.systemPrompt ?? "",
            fallback: data.fallback ?? "",
            kbLinks: data.kbLinks ?? "",
            kbFiles: data.kbFiles ?? [],
            kbFaqs: data.kbFaqs ?? [],
            workingDays: data.workingDays ?? [],
            hoursStart: data.hoursStart ?? null,
            hoursEnd: data.hoursEnd ?? null,
            holidays: data.holidays ?? "",
            status: data.status,
          },
        });

        await tx.providerLink.create({
          data: {
            agentId: createdAgent.id,
            provider: "retell",
            providerId: retellResult.retellAgentId,
            metadata: {
              llmId: retellResult.llmId,
              idempotencyKey: idempotencyKey ?? null,
              autoCreated: true,
            },
          },
        });

        await tx.auditLog.create({
          data: {
            organizationId,
            userId,
            entity: "agent",
            action: "create",
            details: {
              agentId: createdAgent.id,
              name: createdAgent.name,
              retellAgentId: retellResult.retellAgentId,
              llmId: retellResult.llmId,
            },
          },
        });

        return tx.agent.findUniqueOrThrow({
          where: { id: createdAgent.id },
          select: agentPublicSelect,
        });
      });

      return {
        success: true,
        status: 201,
        agent: presentAgent(agent),
      };
    } catch (dbError) {
      // Safe recovery: rollback newly created Retell resources since local persistence failed
      await deleteRetellAgentAndLlm(
        retellClient,
        retellResult.retellAgentId,
        retellResult.llmId,
      );

      return {
        success: false,
        status: 500,
        error: "Unable to save created agent.",
      };
    }
  };

  if (inFlightKey) {
    const promise = execute().finally(() => {
      inFlightCreations.delete(inFlightKey);
    });
    inFlightCreations.set(inFlightKey, promise);
    return await promise;
  }

  return await execute();
}
