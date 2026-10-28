import { NextRequest, NextResponse } from "next/server.js";
import {
  checkAvailability,
  extractToolPayload,
  verifyToolAuthorization,
  type CheckAvailabilityInput,
} from "../../../lib/server/booking/service.ts";

const MAX_PAYLOAD_BYTES = 65_536; // 64 KB

export async function POST(req: NextRequest) {
  try {
    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_PAYLOAD_BYTES) {
      return NextResponse.json(
        {
          status: "error",
          available_slots: [],
          total_slots: 0,
          message: "Request payload too large.",
        },
        { status: 413 },
      );
    }

    let body = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          status: "error",
          available_slots: [],
          total_slots: 0,
          message: "Invalid JSON request body.",
        },
        { status: 400 },
      );
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
    const status = result.statusCode || (result.status === "error" ? 400 : 200);
    return NextResponse.json(result, { status });
  } catch (error: any) {
    console.error("Availability API error:", error?.message);
    return NextResponse.json(
      {
        status: "error",
        available_slots: [],
        total_slots: 0,
        message: "An unexpected error occurred while checking availability.",
      },
      { status: 500 },
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
    const status = result.statusCode || (result.status === "error" ? 400 : 200);
    return NextResponse.json(result, { status });
  } catch (error: any) {
    console.error("Availability API GET error:", error?.message);
    return NextResponse.json(
      {
        status: "error",
        available_slots: [],
        total_slots: 0,
        message: "An unexpected error occurred while checking availability.",
      },
      { status: 500 },
    );
  }
}
