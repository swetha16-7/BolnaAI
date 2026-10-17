import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    app: "BoomiSolutions",
    environment: process.env.NODE_ENV ?? "development",
    timestamp: new Date().toISOString(),
  });
}
