import { NextResponse } from "next/server";
import { ForbiddenError } from "@/lib/server/auth/organization";
import { UnauthorizedError } from "@/lib/server/auth/session";

export class InvalidRequestError extends Error {
  constructor() {
    super("Request body must contain valid JSON.");
    this.name = "InvalidRequestError";
  }
}

export async function parseJsonRequest(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new InvalidRequestError();
  }
}

export function apiErrorResponse(error: unknown, fallback: string) {
  if (error instanceof InvalidRequestError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  return NextResponse.json({ error: fallback }, { status: 500 });
}
