import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth/session";

export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ authenticated: false }, { status: 200 });
    }

    return NextResponse.json({ authenticated: true, user: session });
  } catch {
    return NextResponse.json({ error: "Unable to verify session. Check server configuration and database availability." }, { status: 500 });
  }
}
