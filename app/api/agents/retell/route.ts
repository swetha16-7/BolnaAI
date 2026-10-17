import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/server/auth/organization";
import { apiErrorResponse } from "@/lib/server/http";
import {
  createRetellClient,
  getRetellAgentListFailure,
  listRetellAgents,
} from "@/lib/server/calls/retell";
import { getRetellApiKey } from "@/lib/server/providers/configuration";

export async function GET() {
  try {
    await requireOrganizationAccess();

    const apiKey = getRetellApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: "Retell agent discovery is not configured on the server." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    try {
      const agents = await listRetellAgents(createRetellClient(apiKey));
      return NextResponse.json({ agents }, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      const failure = getRetellAgentListFailure(error);
      return NextResponse.json(
        { error: failure.message },
        { status: failure.status, headers: { "Cache-Control": "no-store" } },
      );
    }
  } catch (error) {
    return apiErrorResponse(error, "Unable to load Retell agents.");
  }
}
