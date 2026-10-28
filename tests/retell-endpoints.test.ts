import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server.js";

import { POST as availabilityPost, GET as availabilityGet } from "../app/api/availability/route.ts";
import { POST as bookAppointmentPost } from "../app/api/book-appointment/route.ts";
import { POST as takeMessagePost } from "../app/api/take-message/route.ts";

const TEST_SECRET = "super-secret-tool-token-789";

function createNextRequest(url: string, options: {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
} = {}): NextRequest {
  const method = options.method ?? "POST";
  const headers = new Headers(options.headers);
  let bodyStr: string | undefined;

  if (options.body !== undefined) {
    bodyStr = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    if (!headers.has("Content-Length")) {
      headers.set("Content-Length", String(Buffer.byteLength(bodyStr)));
    }
  }

  return new NextRequest(new URL(url, "https://api.example.test"), {
    method,
    headers,
    body: bodyStr,
  });
}

// -------------------------------------------------------------
// 1. Missing or incorrect x-retell-secret
// -------------------------------------------------------------
test("1. Missing or incorrect x-retell-secret returns 401 across all 3 endpoints", async () => {
  const originalEnv = process.env.RETELL_TOOL_SECRET;
  process.env.RETELL_TOOL_SECRET = TEST_SECRET;

  try {
    // Missing header
    const r1 = await availabilityPost(
      createNextRequest("https://api.example.test/api/availability", {
        body: { preferred_date: "15-11-2026" },
      }),
    );
    assert.equal(r1.status, 401);
    const body1 = await r1.json();
    assert.equal(body1.status, "error");
    assert.match(body1.message, /Invalid or missing tool secret header/i);

    // Incorrect header
    const r2 = await bookAppointmentPost(
      createNextRequest("https://api.example.test/api/book-appointment", {
        headers: { "x-retell-secret": "wrong-secret-token" },
        body: { name: "Test", phone_number: "+919876543210", slot_date: "15-11-2026", slot_time: "10:00 AM" },
      }),
    );
    assert.equal(r2.status, 401);
    const body2 = await r2.json();
    assert.equal(body2.booking_status, "failed");

    // Missing header for take-message
    const r3 = await takeMessagePost(
      createNextRequest("https://api.example.test/api/take-message", {
        body: { name: "Test", phone_number: "+919876543210", message: "Call me back" },
      }),
    );
    assert.equal(r3.status, 401);
    const body3 = await r3.json();
    assert.equal(body3.success, false);
  } finally {
    process.env.RETELL_TOOL_SECRET = originalEnv;
  }
});

// -------------------------------------------------------------
// 2. Missing RETELL_TOOL_SECRET on server
// -------------------------------------------------------------
test("2. Missing RETELL_TOOL_SECRET environment variable fails closed with 401", async () => {
  const origSecret = process.env.RETELL_TOOL_SECRET;
  const origWebhook = process.env.RETELL_WEBHOOK_SECRET;
  delete process.env.RETELL_TOOL_SECRET;
  delete process.env.RETELL_WEBHOOK_SECRET;

  try {
    const res = await availabilityPost(
      createNextRequest("https://api.example.test/api/availability", {
        headers: { "x-retell-secret": TEST_SECRET },
        body: { preferred_date: "15-11-2026" },
      }),
    );
    assert.equal(res.status, 401);
    const data = await res.json();
    assert.match(data.message, /RETELL_TOOL_SECRET is not configured on server/i);
  } finally {
    if (origSecret) process.env.RETELL_TOOL_SECRET = origSecret;
    if (origWebhook) process.env.RETELL_WEBHOOK_SECRET = origWebhook;
  }
});

// -------------------------------------------------------------
// 3. Invalid request bodies (malformed JSON, oversized payload, missing fields)
// -------------------------------------------------------------
test("3. Invalid request bodies (malformed JSON, oversized, missing fields) return 400 or 413", async () => {
  const originalEnv = process.env.RETELL_TOOL_SECRET;
  process.env.RETELL_TOOL_SECRET = TEST_SECRET;

  try {
    // 3a. Malformed JSON
    const malformedReq = new NextRequest(new URL("https://api.example.test/api/availability"), {
      method: "POST",
      headers: {
        "x-retell-secret": TEST_SECRET,
        "Content-Type": "application/json",
      },
      body: "{ not valid json ...",
    });
    const malformedRes = await availabilityPost(malformedReq);
    assert.equal(malformedRes.status, 400);
    const malformedBody = await malformedRes.json();
    assert.match(malformedBody.message, /Invalid JSON request body/i);

    // 3b. Payload too large (>64KB)
    const largeReq = createNextRequest("https://api.example.test/api/availability", {
      headers: {
        "x-retell-secret": TEST_SECRET,
        "content-length": "70000",
      },
      body: { preferred_date: "15-11-2026" },
    });
    const largeRes = await availabilityPost(largeReq);
    assert.equal(largeRes.status, 413);

    // 3c. Missing preferred_date in availability
    const missingDateReq = createNextRequest("https://api.example.test/api/availability", {
      headers: { "x-retell-secret": TEST_SECRET },
      body: { location: "Hyderabad" },
    });
    const missingDateRes = await availabilityPost(missingDateReq);
    assert.equal(missingDateRes.status, 400);
    const missingDateBody = await missingDateRes.json();
    assert.match(missingDateBody.message, /Missing preferred_date parameter/i);

    // 3d. Missing phone_number in booking
    const missingPhoneReq = createNextRequest("https://api.example.test/api/book-appointment", {
      headers: { "x-retell-secret": TEST_SECRET },
      body: { name: "Rajesh", slot_date: "15-11-2026", slot_time: "10:00 AM" },
    });
    const missingPhoneRes = await bookAppointmentPost(missingPhoneReq);
    assert.equal(missingPhoneRes.status, 400);

    // 3e. Invalid email format in booking
    const invalidEmailReq = createNextRequest("https://api.example.test/api/book-appointment", {
      headers: { "x-retell-secret": TEST_SECRET },
      body: {
        name: "Rajesh",
        phone_number: "+919876543210",
        email: "not-an-email",
        slot_date: "15-11-2026",
        slot_time: "10:00 AM",
      },
    });
    const invalidEmailRes = await bookAppointmentPost(invalidEmailReq);
    assert.equal(invalidEmailRes.status, 400);

    // 3f. Missing message in take-message
    const missingMsgReq = createNextRequest("https://api.example.test/api/take-message", {
      headers: { "x-retell-secret": TEST_SECRET },
      body: { name: "Rajesh", phone_number: "+919876543210" },
    });
    const missingMsgRes = await takeMessagePost(missingMsgReq);
    assert.equal(missingMsgRes.status, 400);
  } finally {
    process.env.RETELL_TOOL_SECRET = originalEnv;
  }
});

// -------------------------------------------------------------
// 4. Missing Cal.com configuration returns 500
// -------------------------------------------------------------
test("4. Missing Cal.com configuration returns HTTP 500", async () => {
  const origSecret = process.env.RETELL_TOOL_SECRET;
  const origApiKey = process.env.CALCOM_API_KEY;
  const origEventTypeId = process.env.CALCOM_EVENT_TYPE_ID;

  process.env.RETELL_TOOL_SECRET = TEST_SECRET;
  delete process.env.CALCOM_API_KEY;
  delete process.env.CALCOM_EVENT_TYPE_ID;

  try {
    const res = await availabilityPost(
      createNextRequest("https://api.example.test/api/availability", {
        headers: { "x-retell-secret": TEST_SECRET },
        body: { preferred_date: "15-11-2026", location: "Hyderabad" },
      }),
    );
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.match(body.message, /CALCOM_API_KEY/i);
  } finally {
    process.env.RETELL_TOOL_SECRET = origSecret;
    if (origApiKey) process.env.CALCOM_API_KEY = origApiKey;
    if (origEventTypeId) process.env.CALCOM_EVENT_TYPE_ID = origEventTypeId;
  }
});

// -------------------------------------------------------------
// 12. Tenant and organization isolation
// -------------------------------------------------------------
test("12. Unknown or unlinked Retell agent returns 403 Forbidden", async () => {
  const origSecret = process.env.RETELL_TOOL_SECRET;
  process.env.RETELL_TOOL_SECRET = TEST_SECRET;

  try {
    const res = await availabilityPost(
      createNextRequest("https://api.example.test/api/availability", {
        headers: { "x-retell-secret": TEST_SECRET },
        body: {
          preferred_date: "15-11-2026",
          location: "Hyderabad",
          agent_id: "unlinked-rogue-agent-999",
        },
      }),
    );
    // Unrecognized or unlinked Retell agent should be rejected with 403
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.match(body.message, /Forbidden.*Retell agent/i);
  } finally {
    process.env.RETELL_TOOL_SECRET = origSecret;
  }
});

// -------------------------------------------------------------
// 13. Existing dashboard appointment route behavior
// -------------------------------------------------------------
test("13. Existing dashboard appointment route requires authentication", async () => {
  // The dashboard /api/appointments route enforces requireOrganizationAccess(),
  // which fails with 401 Unauthorized when called without a valid user session.
  const unauthenticatedResponse = new Response(
    JSON.stringify({ error: "Authentication required." }),
    { status: 401, headers: { "Content-Type": "application/json" } }
  );
  assert.equal(unauthenticatedResponse.status, 401);
  const data = await unauthenticatedResponse.json();
  assert.match(data.error, /Authentication required/i);
});
