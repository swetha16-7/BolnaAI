import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/server/auth/organization";
import {
  createRetellClient,
  getRetellContactListFailure,
  listRetellContacts,
} from "@/lib/server/calls/retell";
import { getRetellApiKey } from "@/lib/server/providers/configuration";
import { prisma } from "@/lib/server/db";
import { apiErrorResponse } from "@/lib/server/http";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const MAX_CURSOR_LENGTH = 2048;

export async function GET(request: Request) {
  try {
    const { organization } = await requireOrganizationAccess();
    const { searchParams } = new URL(request.url);
    const requestedPageSize = Number(searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE);
    const pageSize = Number.isInteger(requestedPageSize)
      ? Math.min(MAX_PAGE_SIZE, Math.max(1, requestedPageSize))
      : DEFAULT_PAGE_SIZE;
    const paginationKey = searchParams.get("cursor") ?? undefined;
    if (paginationKey && paginationKey.length > MAX_CURSOR_LENGTH) {
      return NextResponse.json(
        { error: "Retell pagination cursor is invalid." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const apiKey = getRetellApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: "Retell contacts are not configured on the server." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    try {
      const result = await listRetellContacts(createRetellClient(apiKey), {
        limit: pageSize,
        ...(paginationKey ? { paginationKey } : {}),
      });
      const phones = [...new Set(result.contacts.map((contact) => contact.phoneNumber))];
      const otherOrgContacts = phones.length === 0
        ? []
        : await prisma.contact.findMany({
            where: {
              phone: { in: phones },
              organizationId: { not: organization.id },
            },
            select: { phone: true },
          });
      const otherOrgPhones = new Set(
        otherOrgContacts
          .map((contact) => contact.phone)
          .filter((phone): phone is string => Boolean(phone)),
      );
      const contacts = result.contacts.filter(
        (contact) => !otherOrgPhones.has(contact.phoneNumber),
      );

      const localCrmContacts = phones.length === 0
        ? []
        : await prisma.contact.findMany({
            where: {
              organizationId: organization.id,
              phone: { in: phones },
            },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              company: true,
              title: true,
              status: true,
              voiceConsentAt: true,
              voiceConsentSource: true,
              voiceConsentEvidence: true,
              doNotCall: true,
            },
          });
      const localCrmByPhone = new Map(localCrmContacts.map((c) => [c.phone, c]));

      const localCalls = phones.length === 0
        ? []
        : await prisma.call.findMany({
            where: {
              organizationId: organization.id,
              OR: [
                { destination: { in: phones } },
                { callerNumber: { in: phones } },
              ],
            },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              externalCallId: true,
              destination: true,
              callerNumber: true,
              status: true,
              direction: true,
              outcome: true,
              durationSeconds: true,
              startedAt: true,
              createdAt: true,
              transcript: true,
            },
          });

      const enrichedContacts = contacts.map((c) => {
        const localCrm = localCrmByPhone.get(c.phoneNumber);
        const relatedCalls = localCalls.filter(
          (call) => call.destination === c.phoneNumber || call.callerNumber === c.phoneNumber,
        );
        const latestCall = relatedCalls[0] ?? null;
        const lastCallTimestamp = latestCall?.startedAt?.getTime() ?? latestCall?.createdAt?.getTime() ?? null;
        const latestTimestamp = c.lastConversationTimestamp ?? lastCallTimestamp;

        return {
          ...c,
          firstName: c.firstName || localCrm?.firstName || null,
          lastName: c.lastName || localCrm?.lastName || null,
          email: localCrm?.email || null,
          company: localCrm?.company || null,
          title: localCrm?.title || null,
          status: localCrm?.status || "new",
          crmId: localCrm?.id || null,
          voiceConsentAt: localCrm?.voiceConsentAt ? localCrm.voiceConsentAt.toISOString() : null,
          voiceConsentSource: localCrm?.voiceConsentSource || null,
          voiceConsentEvidence: localCrm?.voiceConsentEvidence || null,
          doNotCall: Boolean(c.doNotCall || localCrm?.doNotCall),
          lastConversationTimestamp: latestTimestamp,
          conversationCount: c.conversationCount ?? relatedCalls.length,
          calls: relatedCalls.map((call) => ({
            id: call.id,
            externalCallId: call.externalCallId,
            status: call.status,
            direction: call.direction,
            outcome: call.outcome,
            durationSeconds: call.durationSeconds,
            startedAt: call.startedAt ? call.startedAt.toISOString() : null,
            createdAt: call.createdAt.toISOString(),
            transcript: call.transcript,
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
        };
      });

      const query = searchParams.get("q")?.trim().toLowerCase();
      const statusFilter = searchParams.get("status")?.trim().toLowerCase();
      const dncFilter = searchParams.get("dnc")?.trim();

      let filteredContacts = enrichedContacts;
      if (query) {
        filteredContacts = filteredContacts.filter((c) => {
          const fullName = [c.firstName, c.lastName].filter(Boolean).join(" ").toLowerCase();
          return (
            c.contactId.toLowerCase().includes(query) ||
            fullName.includes(query) ||
            c.phoneNumber.toLowerCase().includes(query) ||
            (c.email && c.email.toLowerCase().includes(query)) ||
            (c.company && c.company.toLowerCase().includes(query))
          );
        });
      }
      if (statusFilter) {
        filteredContacts = filteredContacts.filter(
          (c) => (c.status || "new").toLowerCase() === statusFilter,
        );
      }
      if (dncFilter === "true") {
        filteredContacts = filteredContacts.filter((c) => Boolean(c.doNotCall));
      } else if (dncFilter === "false") {
        filteredContacts = filteredContacts.filter((c) => !c.doNotCall);
      }

      return NextResponse.json({
        contacts: filteredContacts,
        hasMore: result.hasMore,
        nextCursor: result.nextCursor,
      }, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      const failure = getRetellContactListFailure(error);
      return NextResponse.json(
        { error: failure.message },
        { status: failure.status, headers: { "Cache-Control": "no-store" } },
      );
    }
  } catch (error) {
    return apiErrorResponse(error, "Unable to load Retell contacts.");
  }
}
