import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { POST as calcomWebhookPost } from "../app/api/webhooks/calcom/route.ts";
import { bookAppointment, takeMessage, type TakeMessageInput, type BookAppointmentInput } from "../lib/server/booking/service.ts";

function createWebhookRequest(payload: any, options: {
  secret?: string;
  signature?: string;
} = {}): Request {
  const rawBody = JSON.stringify(payload);
  const headers = new Headers({
    "Content-Type": "application/json",
  });

  if (options.signature) {
    headers.set("x-cal-signature-256", options.signature);
  } else if (options.secret) {
    const hmac = crypto.createHmac("sha256", options.secret);
    const sig = hmac.update(rawBody).digest("hex");
    headers.set("x-cal-signature-256", sig);
  }

  return new Request("https://api.example.test/api/webhooks/calcom", {
    method: "POST",
    headers,
    body: rawBody,
  });
}

test("1. Cal.com webhook rejects unauthorized requests when CALCOM_WEBHOOK_SECRET is set", async () => {
  const origSecret = process.env.CALCOM_WEBHOOK_SECRET;
  process.env.CALCOM_WEBHOOK_SECRET = "whsec_test_secret_12345";

  try {
    // Missing signature header
    const req1 = createWebhookRequest({ triggerEvent: "BOOKING_CREATED", payload: { uid: "test-uid-1" } });
    const res1 = await calcomWebhookPost(req1);
    assert.equal(res1.status, 401);

    // Invalid signature header
    const req2 = createWebhookRequest(
      { triggerEvent: "BOOKING_CREATED", payload: { uid: "test-uid-1" } },
      { signature: "invalid-signature" }
    );
    const res2 = await calcomWebhookPost(req2);
    assert.equal(res2.status, 401);
  } finally {
    process.env.CALCOM_WEBHOOK_SECRET = origSecret;
  }
});

test("2. Cal.com webhook returns 400 for missing booking UID", async () => {
  const origSecret = process.env.CALCOM_WEBHOOK_SECRET;
  delete process.env.CALCOM_WEBHOOK_SECRET;

  try {
    const req = createWebhookRequest({ triggerEvent: "BOOKING_CREATED", payload: {} });
    const res = await calcomWebhookPost(req);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /Missing booking UID/i);
  } finally {
    process.env.CALCOM_WEBHOOK_SECRET = origSecret;
  }
});

test("3. bookAppointment stores location, propertyType, bookingUid, and links originating callId", async () => {
  const createdAppointments: any[] = [];
  const createdCallEvents: any[] = [];
  const createdAuditLogs: any[] = [];

  const mockDb = {
    appointment: {
      findFirst: async () => null,
      findMany: async () => [],
    },
    $transaction: async (callback: any) => {
      const tx = {
        appointment: {
          findFirst: async () => null,
          create: async ({ data }: any) => {
            const record = { id: "appt_123", ...data };
            createdAppointments.push(record);
            return record;
          },
        },
        contact: {
          findFirst: async () => ({ id: "cnt_123", organizationId: "org_1" }),
          update: async ({ data }: any) => ({ id: "cnt_123", ...data }),
        },
        call: {
          findFirst: async () => ({ id: "call_db_123", externalCallId: "call_retell_999" }),
        },
        callEvent: {
          create: async ({ data }: any) => {
            createdCallEvents.push(data);
            return { id: "ce_1", ...data };
          },
        },
        auditLog: {
          create: async ({ data }: any) => {
            createdAuditLogs.push(data);
            return { id: "al_1", ...data };
          },
        },
      };
      return callback(tx);
    },
  };

  const fakeFetch = async () =>
    new Response(
      JSON.stringify({
        status: "success",
        data: {
          id: 998877,
          uid: "booking_uid_xyz789",
          startTime: "2026-11-15T10:00:00.000Z",
          endTime: "2026-11-15T11:00:00.000Z",
          title: "Luxury Villa Tour",
        },
      }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );

  const input: BookAppointmentInput = {
    date: "15-11-2026",
    time: "10:00 AM",
    location: "Gachibowli, Hyderabad",
    property_type: "Luxury Villa Tour",
    name: "Vikram Reddy",
    phone_number: "+919876543210",
    email: "vikram@example.com",
    agent_role: "Property Consultant",
    call: { call_id: "call_retell_999" },
  };

  const res = await bookAppointment(input, {
    env: {
      CALCOM_API_KEY: "cal_live_test_12345",
      CALCOM_EVENT_TYPE_ID: "7283034",
    },
    now: new Date("2026-10-26T06:00:00.000Z"),
    organizationId: "org_1",
    db: mockDb as any,
    fetchFn: fakeFetch as any,
  });

  assert.equal(res.status, "confirmed");
  assert.equal(res.booking_reference, "booking_uid_xyz789");

  // Verify DB record contains all CRM metadata
  assert.equal(createdAppointments.length, 1);
  const saved = createdAppointments[0];
  assert.equal(saved.calcomEventId, "booking_uid_xyz789");
  assert.equal(saved.serviceName, "Vikram Reddy - Property Viewing (Luxury Villa Tour) in Gachibowli, Hyderabad");
  assert.equal(saved.timezone, "Asia/Kolkata");
  assert.equal(saved.metadata.location, "Gachibowli, Hyderabad");
  assert.equal(saved.metadata.propertyType, "Luxury Villa Tour");
  assert.equal(saved.metadata.calcomBookingUid, "booking_uid_xyz789");
  assert.equal(saved.metadata.callId, "call_retell_999");

  // Verify callEvent created for Retell call
  assert.equal(createdCallEvents.length, 1);
  assert.equal(createdCallEvents[0].eventType, "appointment_booked");
  assert.equal(createdCallEvents[0].callId, "call_db_123");
  assert.equal(createdCallEvents[0].payload.calcomBookingUid, "booking_uid_xyz789");

  // Verify audit log
  assert.equal(createdAuditLogs.length, 1);
  assert.equal(createdAuditLogs[0].action, "create_booking");
});

test("4. takeMessage persists caller details, contactId, pending status, and links Retell call", async () => {
  const createdAuditLogs: any[] = [];
  const createdCallEvents: any[] = [];

  const mockDb = {
    contact: {
      findFirst: async () => null,
    },
    $transaction: async (callback: any) => {
      const tx = {
        contact: {
          findFirst: async () => null,
          create: async ({ data }: any) => ({
            id: "contact_new_456",
            ...data,
          }),
        },
        auditLog: {
          findFirst: async () => null,
          create: async ({ data }: any) => {
            const entry = { id: "log_msg_1", ...data };
            createdAuditLogs.push(entry);
            return entry;
          },
        },
        call: {
          findFirst: async () => ({ id: "call_db_888", externalCallId: "call_retell_abc" }),
        },
        callEvent: {
          create: async ({ data }: any) => {
            createdCallEvents.push(data);
            return { id: "ce_2", ...data };
          },
        },
      };
      return callback(tx);
    },
  };

  const input: TakeMessageInput = {
    name: "Sunita Rao",
    phone_number: "+919988776655",
    email: "sunita@example.com",
    message: "Interested in the 3BHK flat in Banjara Hills. Please call back after 5 PM.",
    reason: "Inquiry about 3BHK pricing",
    call: { call_id: "call_retell_abc" },
  };

  const res = await takeMessage(input, {
    organizationId: "org_test",
    db: mockDb as any,
  });

  assert.equal(res.success, true);
  assert.equal(res.name, "Sunita Rao");

  // Verify AuditLog details
  assert.equal(createdAuditLogs.length, 1);
  const log = createdAuditLogs[0];
  assert.equal(log.entity, "caller_message");
  assert.equal(log.details.callerName, "Sunita Rao");
  assert.equal(log.details.phoneNumber, "+919988776655");
  assert.equal(log.details.email, "sunita@example.com");
  assert.equal(log.details.message, "Interested in the 3BHK flat in Banjara Hills. Please call back after 5 PM.");
  assert.equal(log.details.status, "pending");
  assert.equal(log.details.contactId, "contact_new_456");
  assert.equal(log.details.callId, "call_retell_abc");

  // Verify CallEvent
  assert.equal(createdCallEvents.length, 1);
  assert.equal(createdCallEvents[0].eventType, "caller_message");
  assert.equal(createdCallEvents[0].callId, "call_db_888");
});
