import { NextRequest, NextResponse } from "next/server.js";
import {
  bookAppointment,
  extractToolPayload,
  verifyToolAuthorization,
  type BookAppointmentInput,
} from "../../../lib/server/booking/service.ts";

const MAX_PAYLOAD_BYTES = 65_536; // 64 KB

export async function POST(req: NextRequest) {
  try {
    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_PAYLOAD_BYTES) {
      return NextResponse.json(
        {
          status: "error",
          booking_status: "failed",
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
          booking_status: "failed",
          message: "Invalid JSON request body.",
        },
        { status: 400 },
      );
    }

    const payload = extractToolPayload<BookAppointmentInput>(body);

    // Verify Retell custom-tool authorization to protect against unauthorized appointment creation
    const auth = await verifyToolAuthorization(req.headers, payload);
    if (!auth.authorized) {
      return NextResponse.json(
        {
          status: "error",
          booking_status: "failed",
          message: auth.error,
        },
        { status: auth.status },
      );
    }

    const result = await bookAppointment(payload, {
      organizationId: auth.organizationId,
    });
    const status =
      result.statusCode ||
      (result.status === "confirmed" ? 200 : result.status === "unavailable" ? 409 : 400);
    return NextResponse.json(result, { status });
  } catch (error: any) {
    console.error("Book appointment API error:", error?.message);
    return NextResponse.json(
      {
        status: "error",
        booking_status: "failed",
        message: "An unexpected error occurred while booking the appointment.",
      },
      { status: 500 },
    );
  }
}
