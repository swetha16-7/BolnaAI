import { NextResponse } from "next/server";

import { prisma } from "@/lib/server/db";
import { requireOrganizationAccess } from "@/lib/server/auth/organization";
import { agentSchema } from "@/lib/server/validation/schemas";
import { apiErrorResponse, parseJsonRequest } from "@/lib/server/http";
import { organizationScope } from "@/lib/server/auth/tenant-scope";
import { agentPublicSelect } from "@/lib/server/selects";
import { presentAgent } from "@/lib/server/agent-response";

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

    const data = parsed.data;
    const agent = await prisma.agent.create({
      data: {
        organizationId: organization.id,
        createdByUserId: user.id,
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
      select: agentPublicSelect,
    });

    return NextResponse.json({ agent: presentAgent(agent) }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "Unable to create agent.");
  }
}
