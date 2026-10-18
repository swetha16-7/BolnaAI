import { NextResponse } from "next/server";

import { prisma } from "@/lib/server/db";
import { requireOrganizationAccess } from "@/lib/server/auth/organization";
import { agentSchema } from "@/lib/server/validation/schemas";
import { apiErrorResponse, parseJsonRequest } from "@/lib/server/http";
import { organizationScope } from "@/lib/server/auth/tenant-scope";
import { agentPublicSelect } from "@/lib/server/selects";
import { presentAgent } from "@/lib/server/agent-response";

import { createRetellClient } from "@/lib/server/calls/retell";
import { getRetellApiKey } from "@/lib/server/providers/configuration";
import { createOrganizationAgent } from "@/lib/server/agents/service";

export async function GET() {
  try {
    const { user, organization } = await requireOrganizationAccess({
      allowedRoles: ["OWNER", "ADMIN", "MANAGER", "MEMBER"],
    });

    const agents = await prisma.agent.findMany({
      where: organizationScope(organization.id),
      select: agentPublicSelect,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ agents: agents.map(presentAgent), user });
  } catch (error) {
    return apiErrorResponse(error, "Unable to load agents.");
  }
}

export async function POST(request: Request) {
  try {
    const { user, organization } = await requireOrganizationAccess({
      allowedRoles: ["OWNER", "ADMIN", "MANAGER"],
    });

    const body = await parseJsonRequest(request);
    if (body && typeof body === "object" && "retellAgentId" in body) {
      return NextResponse.json(
        { error: "Link Retell agents through the organization-authorized linking action." },
        { status: 400 },
      );
    }
    const parsed = agentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({
        error: "Agent data is invalid.",
        details: parsed.error.flatten().fieldErrors,
      }, { status: 400 });
    }

    const apiKey = getRetellApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: "Retell agent creation is not configured on the server." },
        { status: 503 },
      );
    }

    const idempotencyKey =
      request.headers.get("idempotency-key")?.trim() ||
      (typeof body === "object" && body && "idempotencyKey" in body && typeof body.idempotencyKey === "string"
        ? body.idempotencyKey.trim()
        : null) ||
      null;

    const retellClient = createRetellClient(apiKey);
    const result = await createOrganizationAgent({
      organizationId: organization.id,
      userId: user.id,
      data: parsed.data,
      idempotencyKey,
      retellClient,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ agent: result.agent }, { status: result.status });
  } catch (error) {
    return apiErrorResponse(error, "Unable to create agent.");
  }
}

