import { NextRequest, NextResponse } from "next/server.js";
import {
  takeMessage,
  extractToolPayload,
  verifyToolAuthorization,
  type TakeMessageInput,
} from "../../../lib/server/booking/service.ts";

const MAX_PAYLOAD_BYTES = 65_536; // 64 KB

export async function POST(req: NextRequest) {
  try {
    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_PAYLOAD_BYTES) {
      return NextResponse.json(
        {
          success: false,
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
          success: false,
          message: "Invalid JSON request body.",
        },
        { status: 400 },
      );
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
    const status = result.statusCode || (result.success ? 200 : 400);
    return NextResponse.json(result, { status });
  } catch (error: any) {
    console.error("Take message API error:", error?.message);
    return NextResponse.json(
      {
        success: false,
        message: "An unexpected error occurred while recording the message.",
      },
      { status: 500 },
    );
  }
}
