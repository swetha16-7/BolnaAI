import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { prisma } from "@/lib/server/db";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
};

const SESSION_COOKIE = "bolna_session";
const ORGANIZATION_COOKIE = "bolna_organization";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;

export class UnauthorizedError extends Error {
  constructor() {
    super("Authentication required.");
    this.name = "UnauthorizedError";
  }
}

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be configured with at least 32 characters.");
  }
  return secret;
}

export function assertSessionConfiguration() {
  getSessionSecret();
}

function signSessionPayload(payload: string) {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
}

function encodeSessionPayload(payload: string) {
  return Buffer.from(payload, "utf8").toString("base64url");
}

function decodeSessionPayload(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const encoded = cookieStore.get(SESSION_COOKIE)?.value;

  if (!encoded) {
    return null;
  }

  assertSessionConfiguration();

  const [payloadPart, signaturePart, extraPart] = encoded.split(".");
  if (!payloadPart || !signaturePart || extraPart !== undefined) {
    return null;
  }

  const expected = Buffer.from(signSessionPayload(payloadPart), "hex");
  const actual = Buffer.from(signaturePart, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(decodeSessionPayload(payloadPart));
  } catch {
    return null;
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    !("userId" in payload) ||
    typeof payload.userId !== "string" ||
    !("expiresAt" in payload) ||
    typeof payload.expiresAt !== "number" ||
    payload.expiresAt <= Date.now()
  ) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
    },
  });

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
}

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    throw new UnauthorizedError();
  }
  return session;
}

export async function setSessionCookie(userId: string) {
  assertSessionConfiguration();
  const cookieStore = await cookies();
  const payload = JSON.stringify({
    userId,
    jti: randomUUID(),
    expiresAt: Date.now() + SESSION_DURATION_SECONDS * 1000,
  });
  const payloadEncoded = encodeSessionPayload(payload);
  const signature = signSessionPayload(payloadEncoded);

  cookieStore.set(SESSION_COOKIE, `${payloadEncoded}.${signature}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  cookieStore.set(ORGANIZATION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function setActiveOrganizationCookie(organizationId: string) {
  const cookieStore = await cookies();
  cookieStore.set(ORGANIZATION_COOKIE, organizationId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}
