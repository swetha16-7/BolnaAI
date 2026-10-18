import test from "node:test";
import assert from "node:assert/strict";

import { isCookieSecure } from "../lib/server/auth/session.ts";
import { apiRequest } from "../lib/api-client.ts";

test("isCookieSecure strictly evaluates COOKIE_SECURE=false to allow HTTP", () => {
  assert.equal(
    isCookieSecure({ COOKIE_SECURE: "false", NODE_ENV: "production" }),
    false,
  );
  assert.equal(
    isCookieSecure({ COOKIE_SECURE: "FALSE ", NODE_ENV: "production" }),
    false,
  );
  assert.equal(
    isCookieSecure({ COOKIE_SECURE: "False", NODE_ENV: "development" }),
    false,
  );
});

test("isCookieSecure strictly evaluates COOKIE_SECURE=true to enforce HTTPS", () => {
  assert.equal(
    isCookieSecure({ COOKIE_SECURE: "true", NODE_ENV: "development" }),
    true,
  );
  assert.equal(
    isCookieSecure({ COOKIE_SECURE: " TRUE ", NODE_ENV: "production" }),
    true,
  );
});

test("isCookieSecure preserves safe production default when COOKIE_SECURE is unset", () => {
  assert.equal(
    isCookieSecure({ NODE_ENV: "production" }),
    true,
  );
  assert.equal(
    isCookieSecure({ NODE_ENV: "development" }),
    false,
  );
  assert.equal(
    isCookieSecure({}),
    false,
  );
});

test("isCookieSecure preserves safe production default when COOKIE_SECURE is empty or unrecognized", () => {
  assert.equal(
    isCookieSecure({ COOKIE_SECURE: "", NODE_ENV: "production" }),
    true,
  );
  assert.equal(
    isCookieSecure({ COOKIE_SECURE: "   ", NODE_ENV: "production" }),
    true,
  );
  assert.equal(
    isCookieSecure({ COOKIE_SECURE: "invalid-flag", NODE_ENV: "production" }),
    true,
  );
  assert.equal(
    isCookieSecure({ COOKIE_SECURE: "yes", NODE_ENV: "production" }),
    true,
  );
  assert.equal(
    isCookieSecure({ COOKIE_SECURE: "0", NODE_ENV: "production" }),
    true,
  );
});

test("sign-in sets session cookie and allows subsequent authenticated dashboard requests", async () => {
  let sessionCookie: string | null = null;

  // 1. Sign-in request
  const loginResult = await apiRequest<{ user: { id: string; email: string } }>(
    "/api/auth/login",
    { method: "POST", body: JSON.stringify({ email: "user@example.test", password: "validPassword123" }) },
    async (_url, _init) => {
      sessionCookie = "bolna_session=mock_valid_session_payload.signature; Path=/; HttpOnly; SameSite=Lax";
      return new Response(JSON.stringify({ user: { id: "user-1", email: "user@example.test" } }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": sessionCookie,
        },
      });
    },
  );

  assert.equal(loginResult.user.id, "user-1");
  assert.equal(loginResult.user.email, "user@example.test");
  assert.ok(sessionCookie);

  // 2. Subsequent dashboard request with received cookie
  const dashboardResult = await apiRequest<{ metrics: { totalCalls: number } }>(
    "/api/dashboard",
    { headers: { Cookie: sessionCookie } },
    async (_url, init) => {
      const cookieHeader = new Headers(init?.headers).get("Cookie");
      if (!cookieHeader || !cookieHeader.includes("bolna_session=")) {
        return new Response(JSON.stringify({ error: "Authentication required." }), { status: 401 });
      }
      return new Response(JSON.stringify({ metrics: { totalCalls: 12 } }), { status: 200 });
    },
  );

  assert.equal(dashboardResult.metrics.totalCalls, 12);
});

test("subsequent dashboard request without session cookie fails with 401", async () => {
  await assert.rejects(
    apiRequest(
      "/api/dashboard",
      {},
      async (_url, init) => {
        const cookieHeader = new Headers(init?.headers).get("Cookie");
        if (!cookieHeader || !cookieHeader.includes("bolna_session=")) {
          return new Response(JSON.stringify({ error: "Authentication required." }), { status: 401 });
        }
        return new Response(JSON.stringify({ metrics: { totalCalls: 0 } }), { status: 200 });
      },
    ),
    (error: unknown) => {
      return (
        typeof error === "object" &&
        error !== null &&
        "status" in error &&
        (error as { status: number }).status === 401
      );
    },
  );
});
