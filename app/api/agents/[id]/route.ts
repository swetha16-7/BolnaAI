import { NextResponse } from "next/server";

import { prisma } from "@/lib/server/db";
import { requireOrganizationAccess } from "@/lib/server/auth/organization";
import { agentSchema } from "@/lib/server/validation/schemas";
import { apiErrorResponse, parseJsonRequest } from "@/lib/server/http";
import { organizationScope } from "@/lib/server/auth/tenant-scope";
import { agentPublicSelect } from "@/lib/server/selects";
import { presentAgent } from "@/lib/server/agent-response";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { organization } = await requireOrganizationAccess({
      allowedRoles: ["OWNER", "ADMIN", "MANAGER", "MEMBER"],
    });

    const agent = await prisma.agent.findFirst({
      where: {
        ...organizationScope(organization.id),
        id,
      },
      select: agentPublicSelect,
    });

    if (!agent) {
      return NextResponse.json({ error: "Agent not found." }, { status: 404 });
    }

    return NextResponse.json({ agent: presentAgent(agent) });
  } catch (error) {
    return apiErrorResponse(error, "Unable to load agent.");
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { organization } = await requireOrganizationAccess({
      allowedRoles: ["OWNER", "ADMIN", "MANAGER"],
    });

    const body = await parseJsonRequest(request);
    if (body && typeof body === "object" && "retellAgentId" in body) {
      return NextResponse.json(
        { error: "Link Retell agents through the organization-authorized linking action." },
        { status: 400 },
      );
    }
    const parsed = agentSchema.partial().safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({
        error: "Agent data is invalid.",
        details: parsed.error.flatten().fieldErrors,
      }, { status: 400 });
    }

    const existing = await prisma.agent.findFirst({
      where: { ...organizationScope(organization.id), id },
      select: agentPublicSelect,
    });

    if (!existing) {
      return NextResponse.json({ error: "Agent not found." }, { status: 404 });
    }

    const agent = await prisma.$transaction(async (transaction) => {
      await transaction.agent.update({
        where: { id },
        data: {
          ...parsed.data,
          provider: parsed.data.provider ?? existing.provider,
          voiceName: parsed.data.voiceName ?? existing.voiceName,
          languages: parsed.data.languages ?? existing.languages,
          status: parsed.data.status ?? existing.status,
        },
      });

      return transaction.agent.findUniqueOrThrow({
        where: { id },
        select: agentPublicSelect,
      });
    });

    return NextResponse.json({ agent: presentAgent(agent) });
  } catch (error) {
    return apiErrorResponse(error, "Unable to update agent.");
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { organization } = await requireOrganizationAccess({
      allowedRoles: ["OWNER", "ADMIN", "MANAGER"],
    });

    const existing = await prisma.agent.findFirst({
      where: { ...organizationScope(organization.id), id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Agent not found." }, { status: 404 });
    }

    await prisma.agent.update({
      where: { id },
      data: { status: "paused" },
      select: agentPublicSelect,
    });

    return NextResponse.json({ success: true, archived: true });
  } catch (error) {
    return apiErrorResponse(error, "Unable to archive agent.");
  }
}
