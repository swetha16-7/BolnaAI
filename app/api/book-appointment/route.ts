import { NextRequest, NextResponse } from "next/server";
import {
  bookAppointment,
  extractToolPayload,
  verifyToolAuthorization,
  BookAppointmentInput,
} from "@/lib/server/booking/service";

export async function POST(req: NextRequest) {
  try {
    let body = {};
    try {
      body = await req.json();
    } catch {
      // Body not provided or not valid JSON
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

    const result = await bookAppointment(payload);
    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error("Book appointment API error:", error?.message);
    return NextResponse.json(
      {
        status: "error",
        booking_status: "failed",
        message: "An unexpected error occurred while booking the appointment.",
      },
      { status: 200 },
    );
  }
}
