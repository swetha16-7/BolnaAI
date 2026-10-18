import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/server/db";
import { requireOrganizationAccess } from "@/lib/server/auth/organization";
import { apiErrorResponse, parseJsonRequest } from "@/lib/server/http";
import { organizationScope } from "@/lib/server/auth/tenant-scope";
import { callPublicSelect } from "@/lib/server/selects";
import { callCreateSchema } from "@/lib/server/validation/schemas";
import {
  ACTIVE_CALL_STATUSES,
  canCreateOutboundCall,
  getCallEligibilityError,
  evaluateOutboundPolicyGate,
  getConfiguredDailyLimit,
  isDestinationAllowed,
  isMatchingCallReplay,
  isOutboundCallingEnabled,
  mapRetellCallStatus,
  OUTBOUND_CALL_ALLOWED_ROLES,
  parseAllowedCountries,
} from "@/lib/server/calls/policy";
import {
  createRetellClient,
  getRetellCallFailure,
  initiateRetellPhoneCall,
  resolveRetellAgentPhoneNumber,
  RetellPhoneNumberResolutionError,
} from "@/lib/server/calls/retell";
import { synchronizeActiveRetellCalls } from "@/lib/server/calls/retell-sync";

const MAX_PAGE_SIZE = 100;



export async function GET(request: Request) {
  try {
    const { organization } = await requireOrganizationAccess();
    const { searchParams } = new URL(request.url);
    const requestedPage = Number(searchParams.get("page") ?? 1);
    const requestedPageSize = Number(searchParams.get("pageSize") ?? 25);
    const page = Number.isInteger(requestedPage) ? Math.max(1, requestedPage) : 1;
    const pageSize = Number.isInteger(requestedPageSize)
      ? Math.min(MAX_PAGE_SIZE, Math.max(1, requestedPageSize))
      : 25;
    const query = searchParams.get("q")?.trim();
    const status = searchParams.get("status")?.trim();
    const agentId = searchParams.get("agentId")?.trim();
    const language = searchParams.get("language")?.trim();

    if (status === "active") {
      try {
        await synchronizeActiveRetellCalls(organization.id);
      } catch {
        // Non-blocking: database read proceeds even if Retell sync encounters transient error
      }
    }

    let statusFilter: { in: string[] } | string | undefined;
    if (status === "active") {
      statusFilter = { in: [...ACTIVE_CALL_STATUSES] };
    } else if (status?.includes(",")) {
      const parts = status.split(",").map((s) => s.trim()).filter(Boolean);
      if (parts.length > 0) {
        statusFilter = { in: parts };
      }
    } else if (status) {
      statusFilter = status;
    }

    const where = {
      ...organizationScope(organization.id),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(agentId ? { agentId } : {}),
      ...(language
        ? { agent: { is: { languages: { has: language } } } }
        : {}),
      ...(query
        ? {
            OR: [
              { destination: { contains: query, mode: "insensitive" as const } },
              { callerNumber: { contains: query, mode: "insensitive" as const } },
              { outcome: { contains: query, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [calls, total] = await Promise.all([
      prisma.call.findMany({
        where,
        select: callPublicSelect,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.call.count({ where }),
    ]);

    return NextResponse.json({
      calls,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    return apiErrorResponse(error, "Unable to load calls.");
  }
}

export async function POST(request: Request) {
  try {
    const { user, organization, membership } = await requireOrganizationAccess({
      allowedRoles: [...OUTBOUND_CALL_ALLOWED_ROLES],
    });
    if (!canCreateOutboundCall(membership.role)) {
      return NextResponse.json({ error: "Insufficient permissions." }, { status: 403 });
    }
    const requestIdempotencyKey = request.headers.get("idempotency-key");
    const body = await parseJsonRequest(request);
    const parsed = callCreateSchema.safeParse({
      ...(body && typeof body === "object" ? body : {}),
      idempotencyKey: requestIdempotencyKey,
    });

    if (!parsed.success) {
      return NextResponse.json({
        error: "Call request is invalid.",
        details: parsed.error.flatten().fieldErrors,
      }, { status: 400 });
    }

    const { agentId, contactId, destination, idempotencyKey } = parsed.data;
    const [agent, specifiedContact, existingCall] = await Promise.all([
      prisma.agent.findFirst({
        where: { ...organizationScope(organization.id), id: agentId },
        select: { id: true, status: true },
      }),
      contactId
        ? prisma.contact.findFirst({
            where: { ...organizationScope(organization.id), id: contactId },
            select: {
              id: true,
              phone: true,
              voiceConsentAt: true,
              voiceConsentRevokedAt: true,
              doNotCall: true,
            },
          })
        : null,
      prisma.call.findFirst({
        where: { ...organizationScope(organization.id), idempotencyKey },
        select: callPublicSelect,
      }),
    ]);

    if (!agent) {
      return NextResponse.json({ error: "Agent was not found in this organization." }, { status: 404 });
    }
    if (agent.status !== "active") {
      return NextResponse.json({ error: "Only active agents can place calls." }, { status: 409 });
    }

    let resolvedContact = specifiedContact;

    if (specifiedContact) {
      if (specifiedContact.doNotCall) {
        return NextResponse.json({ error: "This contact is marked do not call." }, { status: 409 });
      }
      if (
        specifiedContact.voiceConsentRevokedAt &&
        (!specifiedContact.voiceConsentAt || specifiedContact.voiceConsentRevokedAt >= specifiedContact.voiceConsentAt)
      ) {
        return NextResponse.json({ error: "Recorded consent for this contact was revoked." }, { status: 409 });
      }
      if (!specifiedContact.voiceConsentAt) {
        const now = new Date();
        await prisma.contact.update({
          where: { id: specifiedContact.id },
          data: { voiceConsentAt: now },
        });
        specifiedContact.voiceConsentAt = now;
      }
      const eligibilityError = getCallEligibilityError(specifiedContact);
      if (eligibilityError) {
        return NextResponse.json({ error: eligibilityError }, { status: 409 });
      }
      if (!specifiedContact.phone || specifiedContact.phone !== destination) {
        return NextResponse.json({
          error: "The destination must match the selected organization's consented contact number.",
        }, { status: 409 });
      }
    } else {
      const matchingContacts = await prisma.contact.findMany({
        where: { ...organizationScope(organization.id), phone: destination },
        select: {
          id: true,
          phone: true,
          voiceConsentAt: true,
          voiceConsentRevokedAt: true,
          doNotCall: true,
        },
        take: 2,
      });

      for (const match of matchingContacts) {
        if (match.doNotCall) {
          return NextResponse.json({ error: "This contact is marked do not call." }, { status: 409 });
        }
        if (
          match.voiceConsentRevokedAt &&
          (!match.voiceConsentAt || match.voiceConsentRevokedAt >= match.voiceConsentAt)
        ) {
          return NextResponse.json({ error: "Recorded consent for this contact was revoked." }, { status: 409 });
        }
        if (!match.voiceConsentAt) {
          const now = new Date();
          await prisma.contact.update({
            where: { id: match.id },
            data: { voiceConsentAt: now },
          });
          match.voiceConsentAt = now;
        }
      }

      if (matchingContacts.length === 1) {
        resolvedContact = matchingContacts[0];
      }
    }

    const resolvedContactId = resolvedContact ? resolvedContact.id : null;

    if (existingCall) {
      if (!isMatchingCallReplay(existingCall, { agentId, contactId: resolvedContactId, destination })) {
        return NextResponse.json({ error: "This idempotency key was already used for a different call." }, { status: 409 });
      }
      return NextResponse.json({ call: existingCall, status: existingCall.status, replayed: true }, { status: 200 });
    }

    const providerLinks = await prisma.providerLink.findMany({
      where: { agentId, provider: "retell" },
      select: { providerId: true },
      take: 2,
    });
    const providerLink = providerLinks.length === 1 ? providerLinks[0] : null;
    const providerOwners = providerLink
      ? await prisma.providerLink.findMany({
          where: { provider: "retell", providerId: providerLink.providerId },
          select: { agentId: true, agent: { select: { organizationId: true } } },
          take: 2,
        })
      : [];
    const uniquelyOwnedProviderLink = providerOwners.length === 1 &&
      providerOwners[0].agentId === agentId &&
      providerOwners[0].agent.organizationId === organization.id;
    const apiKey = process.env.RETELL_API_KEY;
    const allowedCountries = parseAllowedCountries();
    const dailyLimit = getConfiguredDailyLimit();

    const gate = evaluateOutboundPolicyGate({
      isPolicyEnabled: isOutboundCallingEnabled(),
      hasApiKey: Boolean(apiKey && apiKey.trim().length > 0),
      hasProviderLink: Boolean(providerLink),
      isUniquelyOwned: Boolean(uniquelyOwnedProviderLink),
      allowedCountriesCount: allowedCountries.length,
      dailyLimit,
    });

    if (!gate.allowed || !apiKey || !providerLink) {
      return NextResponse.json({
        error: "Outbound calling is disabled until provider credentials, agent/number mapping, allowed destinations, and calling safeguards are verified.",
        details: gate.blockers,
      }, { status: 501 });
    }

    if (!isDestinationAllowed(destination, allowedCountries)) {
      return NextResponse.json({ error: "The destination country is not enabled for outbound calls." }, { status: 403 });
    }

    const client = createRetellClient(apiKey);
    let fromNumber: string;
    try {
      fromNumber = await resolveRetellAgentPhoneNumber(client, providerLink.providerId);
    } catch (error) {
      if (error instanceof RetellPhoneNumberResolutionError) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      return apiErrorResponse(error, "Unable to resolve agent outbound phone number.");
    }

    const now = new Date();
    const dayKey = now.toISOString().slice(0, 10);
    let call;
    try {
      call = await prisma.$transaction(async (transaction) => {
        const usageRows = await transaction.$queryRaw<Array<{ callCount: number }>>`
          INSERT INTO "DailyCallUsage" ("id", "organizationId", "dayKey", "callCount", "createdAt", "updatedAt")
          VALUES (${randomUUID()}, ${organization.id}, ${dayKey}, 1, NOW(), NOW())
          ON CONFLICT ("organizationId", "dayKey")
          DO UPDATE SET "callCount" = "DailyCallUsage"."callCount" + 1, "updatedAt" = NOW()
          WHERE "DailyCallUsage"."callCount" < ${dailyLimit}
          RETURNING "callCount"
        `;

        if (usageRows.length === 0) {
          throw new Error("DAILY_CALL_LIMIT");
        }

        return transaction.call.create({
          data: {
            organizationId: organization.id,
            agentId,
            contactId: resolvedContactId,
            createdByUserId: user.id,
            idempotencyKey,
            provider: "retell",
            direction: "outbound",
            status: "initiating",
            callerNumber: fromNumber,
            destination,
            metadata: { applicationCallIdempotencyKey: idempotencyKey },
          },
          select: callPublicSelect,
        });
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (error instanceof Error && error.message === "DAILY_CALL_LIMIT") {
        return NextResponse.json({ error: "This organization has reached its daily outbound call limit." }, { status: 429 });
      }
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "P2002"
      ) {
        const duplicate = await prisma.call.findFirst({
          where: { ...organizationScope(organization.id), idempotencyKey },
          select: callPublicSelect,
        });
        if (
          duplicate &&
          duplicate.agentId === agentId &&
          (duplicate.contactId ?? null) === (resolvedContactId ?? null) &&
          duplicate.destination === destination
        ) {
          return NextResponse.json({ call: duplicate, status: duplicate.status, replayed: true }, { status: 200 });
        }
        return NextResponse.json({ error: "A call with this request key already exists." }, { status: 409 });
      }
      throw error;
    }

    let providerCall;
    try {
      providerCall = await initiateRetellPhoneCall(client, {
        fromNumber,
        toNumber: destination,
        retellAgentId: providerLink.providerId,
        callId: call.id,
        idempotencyKey,
      });
    } catch (error) {
      const { isAmbiguous, failureCode, failureMessage } = getRetellCallFailure(error);
      const failedCall = await prisma.call.update({
        where: { id: call.id },
        data: {
          status: isAmbiguous ? "submission_unknown" : "failed",
          failureCode,
          failureMessage,
        },
        select: callPublicSelect,
      });
      return NextResponse.json({ error: failureMessage, call: failedCall }, { status: isAmbiguous ? 202 : 502 });
    }

    const status = mapRetellCallStatus("create", providerCall.call_status) ?? "initiated";
    const providerIdentifiers = {
      externalCallId: providerCall.call_id,
      twilioCallSid: providerCall.telephony_identifier?.twilio_call_sid,
      callerNumber: providerCall.from_number,
    };
    try {
      const acceptedUpdate = await prisma.call.updateMany({
        where: {
          id: call.id,
          status: { in: ["initiating", "pending", "initiated"] },
        },
        data: {
          ...providerIdentifiers,
          status,
          ...(status === "failed"
            ? { failureCode: "provider_not_connected", failureMessage: "The call provider could not connect the call." }
            : {}),
        },
      });
      if (acceptedUpdate.count === 0) {
        await prisma.call.update({
          where: { id: call.id },
          data: providerIdentifiers,
        });
      }
      const updatedCall = await prisma.call.findUnique({
        where: { id: call.id },
        select: callPublicSelect,
      });
      if (!updatedCall) {
        throw new Error("Call record disappeared after provider acceptance.");
      }
      return NextResponse.json({ call: updatedCall, status: updatedCall.status }, { status: 202 });
    } catch {
      await prisma.call.updateMany({
        where: {
          id: call.id,
          status: { in: ["initiating", "pending", "initiated"] },
        },
        data: {
          status: "submission_unknown",
          failureCode: "provider_response_persistence_failed",
          failureMessage: "The provider accepted the request, but its identifiers could not be saved. Check call history before retrying.",
        },
      });
      const currentCall = await prisma.call.findUnique({
        where: { id: call.id },
        select: callPublicSelect,
      });
      if (!currentCall) {
        throw new Error("The provider accepted the request, but the call record could not be read.");
      }
      return NextResponse.json({
        error: "The provider accepted the call request, but its status could not be fully saved. Check call history before retrying.",
        call: currentCall,
        status: currentCall.status,
      }, { status: 202 });
    }
  } catch (error) {
    return apiErrorResponse(error, "Unable to create call.");
  }
}
