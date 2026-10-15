import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/server/auth/session";

export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ success: true });
}
