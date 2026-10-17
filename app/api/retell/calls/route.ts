import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/server/auth/organization";
import { getOrganizationRetellAgentNames } from "@/lib/server/calls/retell-ownership";
import {
  createRetellClient,
  getRetellCallHistoryFailure,
  listRetellCalls,
} from "@/lib/server/calls/retell";
import { getRetellApiKey } from "@/lib/server/providers/configuration";
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

    const agentId = searchParams.get("agentId")?.trim() || undefined;
    const agentNames = await getOrganizationRetellAgentNames(organization.id, agentId);
    const apiKey = getRetellApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: "Retell call history is not configured on the server." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    try {
      const result = await listRetellCalls(createRetellClient(apiKey), {
        agentNames,
        limit: pageSize,
        ...(paginationKey ? { paginationKey } : {}),
      });
      return NextResponse.json(result, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      const failure = getRetellCallHistoryFailure(error);
      return NextResponse.json(
        { error: failure.message },
        { status: failure.status, headers: { "Cache-Control": "no-store" } },
      );
    }
  } catch (error) {
    return apiErrorResponse(error, "Unable to load Retell call history.");
  }
}
