import { NextRequest, NextResponse } from "next/server";
import {
  takeMessage,
  extractToolPayload,
  verifyToolAuthorization,
  TakeMessageInput,
} from "@/lib/server/booking/service";

export async function POST(req: NextRequest) {
  try {
    let body = {};
    try {
      body = await req.json();
    } catch {
      // Body not provided or not valid JSON
    }

    const payload = extractToolPayload<TakeMessageInput>(body);

    // Verify Retell custom-tool authorization
    const auth = await verifyToolAuthorization(req.headers, payload);
    if (!auth.authorized) {
      return NextResponse.json(
        {
          success: false,
          message: auth.error,
        },
        { status: auth.status },
      );
    }

    const result = await takeMessage(payload, {
      organizationId: auth.organizationId,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error("Take message API error:", error?.message);
    return NextResponse.json(
      {
        success: false,
        message: "An unexpected error occurred while recording the message.",
      },
      { status: 200 },
    );
  }
}
