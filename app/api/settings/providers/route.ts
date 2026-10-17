import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/server/auth/organization";
import { apiErrorResponse } from "@/lib/server/http";
import {
  canViewProviderSettings,
  getProviderConfigurationStatus,
} from "@/lib/server/providers/configuration";

export async function GET() {
  try {
    const { membership } = await requireOrganizationAccess();
    if (!canViewProviderSettings(membership.role)) {
      return NextResponse.json({ error: "Insufficient permissions." }, { status: 403 });
    }

    return NextResponse.json(getProviderConfigurationStatus(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiErrorResponse(error, "Unable to load provider configuration status.");
  }
}
