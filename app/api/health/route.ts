import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    app: "BolnaAI",
    environment: process.env.NODE_ENV ?? "development",
    timestamp: new Date().toISOString(),
  });
}
