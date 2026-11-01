import { prisma as defaultPrisma } from "../db.ts";
import { organizationScope } from "../auth/tenant-scope.ts";
import { ACTIVE_CALL_STATUSES } from "../calls/policy.ts";
import {
  createRetellClient,
  deleteRetellAgent,
  getRetellAgentDeleteFailure,
} from "../calls/retell.ts";
import { getRetellApiKey } from "../providers/configuration.ts";
import type Retell from "retell-sdk";

export class AgentNotFoundError extends Error {
  readonly status = 404;
  constructor(message = "Agent not found.") {
    super(message);
    this.name = "AgentNotFoundError";
  }
}

export class ActiveCallConflictError extends Error {
  readonly status = 409;
  constructor(
    message = "Cannot delete agent while it has active calls in progress. Please wait for calls to finish or terminate them first.",
  ) {
    super(message);
    this.name = "ActiveCallConflictError";
  }
}

export class RetellNotConfiguredError extends Error {
  readonly status = 503;
  constructor(
    message = "Retell agent discovery is not configured on the server. Cannot safely delete linked Retell agent.",
  ) {
    super(message);
    this.name = "RetellNotConfiguredError";
  }
}

export class RetellAgentDeleteError extends Error {
  readonly status: number;
  constructor(
    message: string,
    status: number,
  ) {
    super(message);
    this.name = "RetellAgentDeleteError";
    this.status = status;
  }
}

export type DeleteAgentOptions = {
  db?: any;
  retellClient?: Retell;
  retellApiKey?: string | null;
  environment?: Record<string, string | undefined>;
};

export async function deleteAgentPermanently(
  agentId: string,
  organizationId: string,
  userId?: string | null,
  options: DeleteAgentOptions = {},
) {
  const db = options.db ?? defaultPrisma;

  // 1. Locate local agent within tenant scope
  const agent = await db.agent.findFirst({
    where: {
      ...organizationScope(organizationId),
      id: agentId,
    },
    include: {
      providerLinks: {
        where: { provider: "retell" },
        select: { id: true, provider: true, providerId: true },
      },
    },
  });

  if (!agent) {
    throw new AgentNotFoundError();
  }

  // 2. Check for active calls to protect in-flight sessions
  const activeCall = await db.call.findFirst({
    where: {
      ...organizationScope(organizationId),
      agentId,
      status: { in: [...ACTIVE_CALL_STATUSES] },
    },
    select: { id: true, status: true },
  });

  if (activeCall) {
    throw new ActiveCallConflictError();
  }

  // 3. Identify linked Retell agent ID
  const retellLink = agent.providerLinks.find((link: any) => link.provider === "retell");
  const retellAgentId = retellLink?.providerId?.trim();

  if (retellAgentId) {
    // Check if any other agent shares this Retell agent (prevent deleting shared Retell resources)
    const otherSharedLink = await db.providerLink.findFirst({
      where: {
        provider: "retell",
        providerId: retellAgentId,
        agentId: { not: agentId },
      },
      select: { id: true, agentId: true },
    });

    if (!otherSharedLink) {
      // If not shared, delete from Retell
      const apiKey = options.retellApiKey ?? getRetellApiKey(options.environment);
      let retellClient = options.retellClient;

      if (!retellClient) {
        if (!apiKey) {
          throw new RetellNotConfiguredError();
        }
        retellClient = createRetellClient(apiKey);
      }

      try {
        await deleteRetellAgent(retellClient, retellAgentId);
      } catch (error) {
        const failure = getRetellAgentDeleteFailure(error);
        throw new RetellAgentDeleteError(failure.message, failure.status);
      }
    }
  }

  // 4. Perform database deletion within transaction
  await db.$transaction(async (tx: any) => {
    // Unassign phone numbers in this organization (preserves phone numbers)
    if (tx.phoneNumber?.updateMany) {
      await tx.phoneNumber.updateMany({
        where: {
          organizationId,
          assignedAgentId: agentId,
        },
        data: {
          assignedAgentId: null,
        },
      });
    }

    // Unassign appointments in this organization (preserves appointment records)
    if (tx.appointment?.updateMany) {
      await tx.appointment.updateMany({
        where: {
          organizationId,
          agentId: agentId,
        },
        data: {
          agentId: null,
        },
      });
    }

    // Unassign calls in this organization (preserves historical call records and transcripts)
    if (tx.call?.updateMany) {
      await tx.call.updateMany({
        where: {
          organizationId,
          agentId: agentId,
        },
        data: {
          agentId: null,
        },
      });
    }

    // Remove providerLinks for this agent
    if (tx.providerLink?.deleteMany) {
      await tx.providerLink.deleteMany({
        where: {
          agentId,
        },
      });
    }

    // Remove the Agent record
    await tx.agent.delete({
      where: {
        id: agentId,
      },
    });

    // Record AuditLog if auditLog model is supported
    if (tx.auditLog?.create) {
      await tx.auditLog.create({
        data: {
          organizationId,
          userId: userId ?? null,
          entity: "Agent",
          action: "DELETE",
          details: {
            agentId,
            name: agent.name,
            retellAgentId: retellAgentId ?? null,
          },
        },
      });
    }
  });

  return {
    success: true as const,
    deleted: true as const,
    id: agentId,
    name: agent.name,
  };
}
