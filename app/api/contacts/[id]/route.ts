import { NextResponse } from "next/server";

import { prisma } from "@/lib/server/db";
import { requireOrganizationAccess } from "@/lib/server/auth/organization";
import { contactSchema } from "@/lib/server/validation/schemas";
import { apiErrorResponse, parseJsonRequest } from "@/lib/server/http";
import { organizationScope } from "@/lib/server/auth/tenant-scope";
import { contactPublicSelect } from "@/lib/server/selects";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { organization } = await requireOrganizationAccess({
      allowedRoles: ["OWNER", "ADMIN", "MANAGER", "MEMBER"],
    });
    const { id } = await params;

    const contact = await prisma.contact.findFirst({
      where: {
        ...organizationScope(organization.id),
        id,
      },
      select: contactPublicSelect,
    });

    if (!contact) {
      return NextResponse.json({ error: "Contact not found." }, { status: 404 });
    }

    const relatedCalls = await prisma.call.findMany({
      where: {
        ...organizationScope(organization.id),
        OR: [
          { contactId: contact.id },
          ...(contact.phone ? [{ destination: contact.phone }, { callerNumber: contact.phone }] : []),
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

    const latestCall = relatedCalls[0] ?? null;
    const latestTimestamp = latestCall?.startedAt ?? latestCall?.createdAt ?? contact.lastContactAt ?? null;

    const contactWithCalls = {
      ...contact,
      calls: relatedCalls.map((c) => ({
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

    return NextResponse.json({ contact: contactWithCalls });
  } catch (error) {
    return apiErrorResponse(error, "Unable to load contact.");
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { organization } = await requireOrganizationAccess({
      allowedRoles: ["OWNER", "ADMIN", "MANAGER"],
    });
    const { id } = await params;

    const body = await parseJsonRequest(request);
    const parsed = contactSchema.partial().safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({
        error: "Contact data is invalid.",
        details: parsed.error.flatten().fieldErrors,
      }, { status: 400 });
    }

    if (
      parsed.data.voiceConsentGranted &&
      (!parsed.data.voiceConsentSource || !parsed.data.voiceConsentEvidence ||
        (parsed.data.doNotCall ?? false))
    ) {
      return NextResponse.json({
        error: "Recording call consent requires its source and evidence, and cannot be combined with do-not-call.",
      }, { status: 400 });
    }

    const existing = await prisma.contact.findFirst({
      where: {
        ...organizationScope(organization.id),
        id,
      },
      select: contactPublicSelect,
    });

    if (!existing) {
      return NextResponse.json({ error: "Contact not found." }, { status: 404 });
    }

    if (parsed.data.voiceConsentGranted && parsed.data.doNotCall !== false && existing.doNotCall) {
      return NextResponse.json({
        error: "Explicitly clear the do-not-call flag before recording new consent.",
      }, { status: 409 });
    }

    const now = new Date();
    const grantConsent = parsed.data.voiceConsentGranted === true;
    const optOut = parsed.data.doNotCall === true;
    const currentConsent =
      existing.voiceConsentAt !== null &&
      (existing.voiceConsentRevokedAt === null ||
        existing.voiceConsentAt > existing.voiceConsentRevokedAt);

    const contact = await prisma.contact.update({
      where: { id },
      data: {
        ...(parsed.data.firstName ? { firstName: parsed.data.firstName } : {}),
        ...(parsed.data.lastName !== undefined ? { lastName: parsed.data.lastName ?? null } : {}),
        ...(parsed.data.email !== undefined ? { email: parsed.data.email ?? null } : {}),
        ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone ?? null } : {}),
        ...(parsed.data.company !== undefined ? { company: parsed.data.company ?? null } : {}),
        ...(parsed.data.title !== undefined ? { title: parsed.data.title ?? null } : {}),
        ...(parsed.data.source !== undefined ? { source: parsed.data.source ?? null } : {}),
        ...(parsed.data.value !== undefined ? { value: parsed.data.value ?? null } : {}),
        ...(parsed.data.lastContactAt !== undefined
          ? { lastContactAt: parsed.data.lastContactAt ? new Date(parsed.data.lastContactAt) : null }
          : {}),
        ...(grantConsent
          ? {
              voiceConsentAt: now,
              voiceConsentSource: parsed.data.voiceConsentSource,
              voiceConsentEvidence: parsed.data.voiceConsentEvidence,
              voiceConsentRevokedAt: null,
            }
          : parsed.data.voiceConsentGranted === false && currentConsent
            ? { voiceConsentRevokedAt: now }
            : {}),
        ...(parsed.data.doNotCall !== undefined
          ? {
              doNotCall: parsed.data.doNotCall,
              doNotCallAt: optOut ? now : null,
              ...(optOut ? { voiceConsentRevokedAt: now } : {}),
            }
          : {}),
        ...(parsed.data.status ? { status: parsed.data.status } : {}),
      },
      select: contactPublicSelect,
    });

    return NextResponse.json({ contact });
  } catch (error) {
    return apiErrorResponse(error, "Unable to update contact.");
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { organization } = await requireOrganizationAccess({
      allowedRoles: ["OWNER", "ADMIN", "MANAGER"],
    });
    const { id } = await params;

    const existing = await prisma.contact.findFirst({
      where: {
        ...organizationScope(organization.id),
        id,
      },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Contact not found." }, { status: 404 });
    }

    await prisma.contact.update({
      where: { id },
      data: { status: "inactive" },
    });

    return NextResponse.json({ success: true, archived: true });
  } catch (error) {
    return apiErrorResponse(error, "Unable to archive contact.");
  }
}
