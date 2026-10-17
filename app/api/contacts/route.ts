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
    const dnc = searchParams.get("dnc")?.trim();
    const pageParam = parseInt(searchParams.get("page") ?? "1", 10);
    const pageSizeParam = parseInt(searchParams.get("pageSize") ?? "25", 10);
    const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1;
    const pageSize = Number.isInteger(pageSizeParam) && pageSizeParam > 0 ? Math.min(100, pageSizeParam) : 25;
    const skip = (page - 1) * pageSize;

    const where = {
      ...organizationScope(organization.id),
      ...(query
        ? {
            OR: [
              { id: { contains: query, mode: "insensitive" as const } },
              { firstName: { contains: query, mode: "insensitive" as const } },
              { lastName: { contains: query, mode: "insensitive" as const } },
              { email: { contains: query, mode: "insensitive" as const } },
              { phone: { contains: query, mode: "insensitive" as const } },
              { company: { contains: query, mode: "insensitive" as const } },
            ],
          }
        : {}),
      ...(status ? { status } : {}),
      ...(dnc === "true" ? { doNotCall: true } : dnc === "false" ? { doNotCall: false } : {}),
    };

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take: pageSize,
        select: contactPublicSelect,
      }),
      prisma.contact.count({ where }),
    ]);

    const contactIds = contacts.map((c) => c.id);
    const contactPhones = [...new Set(contacts.map((c) => c.phone).filter((p): p is string => Boolean(p)))];

    const relatedCalls = (contactIds.length === 0 && contactPhones.length === 0)
      ? []
      : await prisma.call.findMany({
          where: {
            ...organizationScope(organization.id),
            OR: [
              ...(contactIds.length > 0 ? [{ contactId: { in: contactIds } }] : []),
              ...(contactPhones.length > 0
                ? [
                    { destination: { in: contactPhones } },
                    { callerNumber: { in: contactPhones } },
                  ]
                : []),
            ],
          },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            externalCallId: true,
            contactId: true,
            callerNumber: true,
            destination: true,
            status: true,
            direction: true,
            outcome: true,
            durationSeconds: true,
            startedAt: true,
            createdAt: true,
            transcript: true,
          },
        });

    const contactsWithCalls = contacts.map((contact) => {
      const calls = relatedCalls.filter(
        (call) =>
          call.contactId === contact.id ||
          (contact.phone && (call.destination === contact.phone || call.callerNumber === contact.phone)),
      );
      const latestCall = calls[0] ?? null;
      const latestTimestamp = latestCall?.startedAt ?? latestCall?.createdAt ?? contact.lastContactAt ?? null;
      return {
        ...contact,
        calls: calls.map((c) => ({
          id: c.id,
          externalCallId: c.externalCallId,
          status: c.status,
          direction: c.direction,
          outcome: c.outcome,
          durationSeconds: c.durationSeconds,
          startedAt: c.startedAt ? c.startedAt.toISOString() : null,
          createdAt: c.createdAt.toISOString(),
          transcript: c.transcript,
        })),
        latestCall: latestCall
          ? {
              id: latestCall.id,
              externalCallId: latestCall.externalCallId,
              status: latestCall.status,
              direction: latestCall.direction,
              outcome: latestCall.outcome,
              durationSeconds: latestCall.durationSeconds,
              startedAt: latestCall.startedAt ? latestCall.startedAt.toISOString() : null,
              createdAt: latestCall.createdAt.toISOString(),
              transcript: latestCall.transcript,
            }
          : null,
        lastConversationAt: latestTimestamp
          ? latestTimestamp instanceof Date
            ? latestTimestamp.toISOString()
            : String(latestTimestamp)
          : null,
      };
    });

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return NextResponse.json({
      contacts: contactsWithCalls,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
      },
    });
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
