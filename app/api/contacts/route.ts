import { NextResponse } from "next/server";

import { prisma } from "@/lib/server/db";
import { requireOrganizationAccess } from "@/lib/server/auth/organization";
import { contactSchema } from "@/lib/server/validation/schemas";
import { apiErrorResponse, parseJsonRequest } from "@/lib/server/http";
import { organizationScope } from "@/lib/server/auth/tenant-scope";
import { contactPublicSelect } from "@/lib/server/selects";

export async function GET(request: Request) {
  try {
    const { organization } = await requireOrganizationAccess({
      allowedRoles: ["OWNER", "ADMIN", "MANAGER", "MEMBER"],
    });

    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim();
    const status = searchParams.get("status")?.trim();

    const contacts = await prisma.contact.findMany({
      where: {
        ...organizationScope(organization.id),
        ...(query
          ? {
              OR: [
                { firstName: { contains: query, mode: "insensitive" } },
                { lastName: { contains: query, mode: "insensitive" } },
                { email: { contains: query, mode: "insensitive" } },
                { phone: { contains: query, mode: "insensitive" } },
                { company: { contains: query, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: contactPublicSelect,
    });

    return NextResponse.json({ contacts });
  } catch (error) {
    return apiErrorResponse(error, "Unable to load contacts.");
  }
}

export async function POST(request: Request) {
  try {
    const { organization } = await requireOrganizationAccess({
      allowedRoles: ["OWNER", "ADMIN", "MANAGER"],
    });

    const body = await parseJsonRequest(request);
    const parsed = contactSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({
        error: "Contact data is invalid.",
        details: parsed.error.flatten().fieldErrors,
      }, { status: 400 });
    }

    if (
      parsed.data.voiceConsentGranted &&
      (!parsed.data.voiceConsentSource || !parsed.data.voiceConsentEvidence || parsed.data.doNotCall)
    ) {
      return NextResponse.json({
        error: "Recording call consent requires its source and evidence, and cannot be combined with do-not-call.",
      }, { status: 400 });
    }

    const consentGrantedAt = parsed.data.voiceConsentGranted ? new Date() : null;
    const optedOutAt = parsed.data.doNotCall ? new Date() : null;
    const contact = await prisma.contact.create({
      data: {
        organizationId: organization.id,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName ?? null,
        email: parsed.data.email ?? null,
        phone: parsed.data.phone ?? null,
        company: parsed.data.company ?? null,
        title: parsed.data.title ?? null,
        source: parsed.data.source ?? null,
        value: parsed.data.value ?? null,
        lastContactAt: parsed.data.lastContactAt ? new Date(parsed.data.lastContactAt) : null,
        voiceConsentAt: consentGrantedAt,
        voiceConsentSource: parsed.data.voiceConsentGranted ? parsed.data.voiceConsentSource : null,
        voiceConsentEvidence: parsed.data.voiceConsentGranted ? parsed.data.voiceConsentEvidence : null,
        voiceConsentRevokedAt: optedOutAt,
        doNotCall: parsed.data.doNotCall ?? false,
        doNotCallAt: optedOutAt,
        status: parsed.data.status,
      },
      select: contactPublicSelect,
    });

    return NextResponse.json({ contact }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "Unable to create contact.");
  }
}
