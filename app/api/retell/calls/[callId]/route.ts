import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/server/auth/organization";
import { getOrganizationRetellAgentNames } from "@/lib/server/calls/retell-ownership";
import {
  createRetellClient,
  getRetellCallHistoryFailure,
  RetellCallOwnershipError,
  retrieveRetellCall,
} from "@/lib/server/calls/retell";
import { getRetellApiKey } from "@/lib/server/providers/configuration";
import { apiErrorResponse } from "@/lib/server/http";

const RETELL_CALL_ID = /^[a-zA-Z0-9_-]{1,100}$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ callId: string }> },
) {
  try {
    const { organization } = await requireOrganizationAccess();
    const { callId } = await params;
    if (!RETELL_CALL_ID.test(callId)) {
      return NextResponse.json(
        { error: "Call was not found." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const agentNames = await getOrganizationRetellAgentNames(organization.id);
    const apiKey = getRetellApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: "Retell call details are not configured on the server." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    try {
      const call = await retrieveRetellCall(
        createRetellClient(apiKey),
        callId,
      );
      const linkedAgentName = agentNames.get(call.agentId) || call.agentName || call.agentId;
      return NextResponse.json({ call: { ...call, agentName: linkedAgentName } }, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      if (error instanceof RetellCallOwnershipError) {
        return NextResponse.json(
          { error: "Call was not found." },
          { status: 404, headers: { "Cache-Control": "no-store" } },
        );
      }
      const failure = getRetellCallHistoryFailure(error);
      return NextResponse.json(
        { error: failure.message },
        { status: failure.status, headers: { "Cache-Control": "no-store" } },
      );
    }
  } catch (error) {
    return apiErrorResponse(error, "Unable to load Retell call details.");
  }
}
