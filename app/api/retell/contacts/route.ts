import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/server/auth/organization";
import { selectUniquelyOwnedRetellContacts } from "@/lib/server/calls/retell-ownership";
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
      const matchingLocalContacts = phones.length === 0
        ? []
        : await prisma.contact.findMany({
            where: { phone: { in: phones } },
            select: { id: true, organizationId: true, phone: true },
          });
      const contacts = selectUniquelyOwnedRetellContacts(
        organization.id,
        result.contacts,
        matchingLocalContacts.filter(
          (contact): contact is typeof contact & { phone: string } => contact.phone !== null,
        ),
      );
      return NextResponse.json({
        contacts,
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
