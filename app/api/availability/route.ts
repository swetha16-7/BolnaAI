import { NextRequest, NextResponse } from "next/server";
import {
  checkAvailability,
  extractToolPayload,
  verifyToolAuthorization,
  CheckAvailabilityInput,
} from "@/lib/server/booking/service";

export async function POST(req: NextRequest) {
  try {
    let body = {};
    try {
      body = await req.json();
    } catch {
      // Body not provided or not valid JSON
    }

    const payload = extractToolPayload<CheckAvailabilityInput>(body);

    // Verify Retell custom-tool authorization
    const auth = await verifyToolAuthorization(req.headers, payload);
    if (!auth.authorized) {
      return NextResponse.json(
        {
          status: "error",
          available_slots: [],
          total_slots: 0,
          message: auth.error,
        },
        { status: auth.status },
      );
    }

    const result = await checkAvailability(payload, {
      organizationId: auth.organizationId,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error("Availability API error:", error?.message);
    return NextResponse.json(
      {
        status: "error",
        available_slots: [],
        total_slots: 0,
        message: "An unexpected error occurred while checking availability.",
      },
      { status: 200 },
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const payload: CheckAvailabilityInput = {
      preferred_date: searchParams.get("preferred_date") || searchParams.get("date"),
      location: searchParams.get("location"),
      appointment_type: searchParams.get("appointment_type") || searchParams.get("type"),
      property_type: searchParams.get("property_type"),
      timezone: searchParams.get("timezone"),
      agent_id: searchParams.get("agent_id"),
    };

    // Verify Retell custom-tool authorization
    const auth = await verifyToolAuthorization(req.headers, payload);
    if (!auth.authorized) {
      return NextResponse.json(
        {
          status: "error",
          available_slots: [],
          total_slots: 0,
          message: auth.error,
        },
        { status: auth.status },
      );
    }

    const result = await checkAvailability(payload, {
      organizationId: auth.organizationId,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error("Availability API GET error:", error?.message);
    return NextResponse.json(
      {
        status: "error",
        available_slots: [],
        total_slots: 0,
        message: "An unexpected error occurred while checking availability.",
      },
      { status: 200 },
    );
  }
}
