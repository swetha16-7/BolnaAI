import { NextResponse } from "next/server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/db";
import { requireOrganizationAccess } from "@/lib/server/auth/organization";
import { apiErrorResponse, parseJsonRequest } from "@/lib/server/http";
import { organizationScope } from "@/lib/server/auth/tenant-scope";
import { agentPublicSelect } from "@/lib/server/selects";
import { presentAgent } from "@/lib/server/agent-response";
import {
  createRetellClient,
  getRetellAgentListFailure,
  listRetellAgents,
} from "@/lib/server/calls/retell";
import { getRetellApiKey } from "@/lib/server/providers/configuration";
import { retellAgentLinkSchema } from "@/lib/server/validation/schemas";

class RetellAgentLinkError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "RetellAgentLinkError";
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { organization } = await requireOrganizationAccess({
      allowedRoles: ["OWNER", "ADMIN"],
    });

    const body = await parseJsonRequest(request);
    const parsed = retellAgentLinkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({
        error: "Retell agent link data is invalid.",
        details: parsed.error.flatten().fieldErrors,
      }, { status: 400 });
    }

    const localAgent = await prisma.agent.findFirst({
      where: { ...organizationScope(organization.id), id },
      select: { id: true },
    });
    if (!localAgent) {
      return NextResponse.json({ error: "Agent not found." }, { status: 404 });
    }

    const apiKey = getRetellApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: "Retell agent discovery is not configured on the server." },
        { status: 503 },
      );
    }

    let retellAgents;
    try {
      retellAgents = await listRetellAgents(createRetellClient(apiKey));
    } catch (error) {
      const failure = getRetellAgentListFailure(error);
      return NextResponse.json({ error: failure.message }, { status: failure.status });
    }

    const retellAgent = retellAgents.find(
      (agent) => agent.retellAgentId === parsed.data.retellAgentId,
    );
    if (!retellAgent) {
      return NextResponse.json({ error: "Retell agent was not found in the configured account." }, { status: 404 });
    }
    if (retellAgent.channel !== "voice") {
      return NextResponse.json(
        { error: "Only Retell voice agents can be linked to an application voice agent." },
        { status: 409 },
      );
    }

    const agent = await prisma.$transaction(async (transaction) => {
      const currentAgent = await transaction.agent.findFirst({
        where: { ...organizationScope(organization.id), id },
        select: {
          id: true,
          providerLinks: {
            where: { provider: "retell" },
            select: { providerId: true },
            take: 2,
          },
        },
      });

      if (!currentAgent) {
        throw new RetellAgentLinkError("Agent not found.", 404);
      }

      if (currentAgent.providerLinks.length > 1) {
        throw new RetellAgentLinkError(
          "This application agent has conflicting Retell mappings. Resolve them before linking.",
          409,
        );
      }

      const currentLink = currentAgent.providerLinks[0];
      if (currentLink?.providerId === parsed.data.retellAgentId) {
        return transaction.agent.findUniqueOrThrow({
          where: { id },
          select: agentPublicSelect,
        });
      }
      if (currentLink) {
        throw new RetellAgentLinkError(
          "This application agent is already linked to a different Retell agent.",
          409,
        );
      }

      const existingLink = await transaction.providerLink.findFirst({
        where: {
          provider: "retell",
          providerId: parsed.data.retellAgentId,
        },
        select: { agentId: true },
      });
      if (existingLink) {
        throw new RetellAgentLinkError(
          "This Retell agent is already linked to an application agent.",
          409,
        );
      }

      await transaction.providerLink.create({
        data: {
          agentId: id,
          provider: "retell",
          providerId: parsed.data.retellAgentId,
        },
      });

      return transaction.agent.findUniqueOrThrow({
        where: { id },
        select: agentPublicSelect,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json({ agent: presentAgent(agent) });
  } catch (error) {
    if (error instanceof RetellAgentLinkError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error.code === "P2002" || error.code === "P2034")
    ) {
      return NextResponse.json(
        { error: "The Retell agent mapping changed concurrently. Refresh and try again." },
        { status: 409 },
      );
    }

    return apiErrorResponse(error, "Unable to link the Retell agent.");
  }
}
