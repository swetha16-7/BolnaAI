import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server.js";
import { POST as rescheduleAppointmentRoute } from "../app/api/reschedule-appointment/route.ts";

import {
  checkAvailability,
  bookAppointment,
  rescheduleAppointment,
  phoneNumbersMatch,
  takeMessage,
  extractToolPayload,
  verifyToolAuthorization,
  parseDateString,
  parseTimeString,
  resolveLocationTimezone,
  createDateInTimezone,
  type CheckAvailabilityInput,
  type BookAppointmentInput,
  type RescheduleAppointmentInput,
  type TakeMessageInput,
} from "../lib/server/booking/service.ts";

const VALID_CAL_ENV = {
  CALCOM_API_KEY: "cal_live_test_api_key_12345",
  CALCOM_EVENT_TYPE_ID: "123456",
};

// Helper to mock Prisma transactions and operations
function createMockDb(overrides: {
  appointments?: any[];
  contacts?: any[];
  organization?: any;
  providerLink?: any;
  transactionFail?: boolean;
} = {}) {
  const appointments: any[] = [...(overrides.appointments ?? [])];
  const contacts: any[] = [...(overrides.contacts ?? [])];
  const auditLogs: any[] = [];
  const organization = overrides.organization ?? { id: "org-test-1", name: "Test Org" };
  const providerLink = overrides.providerLink ?? {
    id: "link-1",
    provider: "retell",
    providerId: "agent_49f28308f661ae06a348071fff",
    agent: { organizationId: organization.id },
  };

  const tx = {
    organization: {
      findFirst: async () => organization,
    },
    providerLink: {
      findFirst: async () => providerLink,
    },
    appointment: {
      findMany: async (args: any) => {
        return appointments.filter((a) => {
          if (args?.where?.organizationId && a.organizationId !== args.where.organizationId) return false;
          if (args?.where?.status?.in && !args.where.status.in.includes(a.status)) return false;
          if (args?.where?.startsAt?.gte && a.startsAt < args.where.startsAt.gte) return false;
          if (args?.where?.startsAt?.lte && a.startsAt > args.where.startsAt.lte) return false;
          return true;
        });
      },
      findFirst: async (args: any) => {
        return appointments.find((a) => {
          if (args?.where?.organizationId && a.organizationId !== args.where.organizationId) {
            return false;
          }
          if (args?.where?.id?.not && a.id === args.where.id.not) {
            return false;
          }
          if (args?.where?.status?.in && !args.where.status.in.includes(a.status)) {
            return false;
          }
          if (args?.where?.startsAt && args.where.startsAt instanceof Date) {
            if (a.startsAt.getTime() === args.where.startsAt.getTime()) {
              return true;
            }
          }
          if (args?.where?.OR && Array.isArray(args.where.OR)) {
            const matchesOr = args.where.OR.some((cond: any) => {
              if (cond.calcomEventId && a.calcomEventId === cond.calcomEventId) return true;
              if (cond.id && a.id === cond.id) return true;
              if (cond.startsAt?.lt && cond.endsAt?.gt) {
                const aEnd = a.endsAt ?? new Date(a.startsAt.getTime() + 60 * 60 * 1000);
                if (a.startsAt < cond.startsAt.lt && aEnd > cond.endsAt.gt) return true;
              }
              if (cond.endsAt === null && cond.startsAt?.lt && cond.startsAt?.gt) {
                const aEnd = a.endsAt ?? new Date(a.startsAt.getTime() + 60 * 60 * 1000);
                if (a.startsAt < cond.startsAt.lt && aEnd > cond.startsAt.gt) return true;
              }
              return false;
            });
            if (matchesOr) return true;
          }
          return false;
        }) ?? null;
      },
      create: async ({ data }: any) => {
        const created = { id: `appt-${appointments.length + 1}`, ...data };
        appointments.push(created);
        return created;
      },
      update: async ({ where, data }: any) => {
        const index = appointments.findIndex((a) => a.id === where.id);
        if (index >= 0) {
          appointments[index] = { ...appointments[index], ...data };
          return appointments[index];
        }
        return null;
      },
    },
    contact: {
      findFirst: async (args: any) => {
        const orConditions = args?.where?.OR ?? [];
        return contacts.find((c) =>
          orConditions.some((cond: any) =>
            (cond.phone && c.phone === cond.phone) || (cond.email && c.email === cond.email)
          )
        ) ?? null;
      },
      create: async ({ data }: any) => {
        const created = { id: `contact-${contacts.length + 1}`, ...data };
        contacts.push(created);
        return created;
      },
      update: async ({ where, data }: any) => {
        const index = contacts.findIndex((c) => c.id === where.id);
        if (index >= 0) {
          contacts[index] = { ...contacts[index], ...data };
          return contacts[index];
        }
        return null;
      },
    },
    auditLog: {
      findFirst: async () => {
        return auditLogs.length > 0 ? auditLogs[auditLogs.length - 1] : null;
      },
      create: async ({ data }: any) => {
        auditLogs.push(data);
        return data;
      },
    },
  };

  const mockDb = {
    ...tx,
    $transaction: async (cb: any) => {
      if (overrides.transactionFail) {
        throw new Error("Simulated database connection failure during transaction");
      }
      return cb(tx);
    },
    _state: { appointments, contacts, auditLogs },
  };

  return mockDb;
}

// ==========================================
// Basic Parsing & Utility Unit Tests
// ==========================================

test("parseDateString parses DD-MM-YYYY and YYYY-MM-DD accurately", () => {
  const d1 = parseDateString("28-10-2026");
  assert.notEqual(d1, null);
  assert.equal(d1?.year, 2026);
  assert.equal(d1?.month, 10);
  assert.equal(d1?.day, 28);

  const d2 = parseDateString("2026-10-28");
  assert.notEqual(d2, null);
  assert.equal(d2?.year, 2026);
  assert.equal(d2?.month, 10);
  assert.equal(d2?.day, 28);

  // Invalid dates
  assert.equal(parseDateString("32-10-2026"), null);
  assert.equal(parseDateString("29-02-2025"), null); // non-leap year
  assert.equal(parseDateString("invalid"), null);
  assert.equal(parseDateString(null), null);
});

test("parseTimeString parses 12-hour and 24-hour formats", () => {
  const t1 = parseTimeString("10:00 AM");
  assert.deepEqual(t1, { hours: 10, minutes: 0 });

  const t2 = parseTimeString("2:30 PM");
  assert.deepEqual(t2, { hours: 14, minutes: 30 });

  const t3 = parseTimeString("14:00");
  assert.deepEqual(t3, { hours: 14, minutes: 0 });

  assert.equal(parseTimeString("invalid"), null);
});

test("resolveLocationTimezone maps locations to appropriate IANA timezones", () => {
  assert.equal(resolveLocationTimezone("Hyderabad"), "Asia/Kolkata");
  assert.equal(resolveLocationTimezone("Bangalore"), "Asia/Kolkata");
  assert.equal(resolveLocationTimezone("London"), "Europe/London");
  assert.equal(resolveLocationTimezone("New York"), "America/New_York");
  assert.equal(resolveLocationTimezone("California"), "America/Los_Angeles");
  assert.equal(resolveLocationTimezone(null, "Europe/Paris"), "Europe/Paris");
});

// ==========================================
// 13 Required Cal.com Test Scenarios
// ==========================================

// Scenario 1: Successful availability lookup
test("1. Successful availability lookup through Cal.com API v2", async () => {
  const mockDb = createMockDb();
  const simulatedNow = new Date("2026-10-26T06:00:00.000Z");

  const mockCalFetch: typeof fetch = async (url, init) => {
    assert.match(String(url), /https:\/\/api\.cal\.com\/v2\/slots/);
    assert.match(String(url), /eventTypeId=123456/);
    const auth = (init?.headers as any)?.Authorization || (init?.headers as any)?.authorization;
    assert.equal(auth, `Bearer ${VALID_CAL_ENV.CALCOM_API_KEY}`);

    return new Response(
      JSON.stringify({
        status: "success",
        data: {
          "2026-10-28": [
            { start: "2026-10-28T04:30:00.000Z" }, // 10:00 AM IST
            { start: "2026-10-28T06:30:00.000Z" }, // 12:00 PM IST
            { start: "2026-10-28T09:30:00.000Z" }, // 3:00 PM IST
          ],
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const result = await checkAvailability(
    {
      preferred_date: "28-10-2026",
      location: "Hyderabad",
      appointment_type: "property viewing",
    },
    {
      db: mockDb as any,
      now: simulatedNow,
      env: VALID_CAL_ENV,
      fetchFn: mockCalFetch,
    }
  );

  assert.equal(result.status, "available");
  assert.equal(result.total_slots, 3);
  assert.equal(result.available_slots.includes("10:00 AM"), true);
  assert.equal(result.timezone, "Asia/Kolkata");
  assert.match(result.message, /Slots are available/i);
});

// Scenario 2: No available slots
test("2. No available slots returned from Cal.com", async () => {
  const mockDb = createMockDb();
  const simulatedNow = new Date("2026-10-26T06:00:00.000Z");

  const mockEmptyCalFetch: typeof fetch = async () => {
    return new Response(
      JSON.stringify({
        status: "success",
        data: {
          "2026-10-28": [],
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const result = await checkAvailability(
    {
      preferred_date: "28-10-2026",
      location: "Hyderabad",
    },
    {
      db: mockDb as any,
      now: simulatedNow,
      env: VALID_CAL_ENV,
      fetchFn: mockEmptyCalFetch,
    }
  );

  assert.equal(result.status, "unavailable");
  assert.equal(result.total_slots, 0);
  assert.equal(result.available_slots.length, 0);
  assert.match(result.message, /No available slots/i);
});

// Scenario 1b: October 27, 2026 villa viewing in Hyderabad with standard Cal.com v2 data.slots response format
test("1b. Availability lookup for October 27, 2026 villa viewing in Hyderabad with standard Cal.com v2 data.slots format", async () => {
  const mockDb = createMockDb();
  // Simulated current time: evening of October 26, 2026 (IST)
  const simulatedNow = new Date("2026-10-26T14:08:34.000Z");

  let requestedUrl = "";
  const mockCalFetch: typeof fetch = async (url, init) => {
    requestedUrl = String(url);
    const auth = (init?.headers as any)?.Authorization || (init?.headers as any)?.authorization;
    assert.equal(auth, `Bearer ${VALID_CAL_ENV.CALCOM_API_KEY}`);
    const apiVersion = (init?.headers as any)?.["cal-api-version"];
    assert.equal(apiVersion, "2024-09-04");

    // Standard Cal.com API v2 response with data.slots
    return new Response(
      JSON.stringify({
        status: "success",
        data: {
          slots: {
            "2026-10-27": [
              { time: "2026-10-27T04:30:00.000Z" }, // 10:00 AM in Asia/Kolkata (+5:30)
              { time: "2026-10-27T06:30:00.000Z" }, // 12:00 PM in Asia/Kolkata (+5:30)
              { time: "2026-10-27T09:30:00.000Z" }, // 03:00 PM in Asia/Kolkata (+5:30)
            ],
          },
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const result = await checkAvailability(
    {
      appointment_type: "viewing",
      preferred_date: "27-10-2026",
      location: "Hyderabad",
      property_type: "villa",
    },
    {
      db: mockDb as any,
      now: simulatedNow,
      env: VALID_CAL_ENV,
      fetchFn: mockCalFetch,
    }
  );

  // Verify URL query parameters: eventTypeId, start, end, timeZone
  assert.match(requestedUrl, /eventTypeId=123456/);
  assert.match(requestedUrl, /timeZone=Asia%2FKolkata/);
  // Start of day in Asia/Kolkata for Oct 27 is Oct 26 18:30:00Z
  assert.match(requestedUrl, /start=2026-10-26T18%3A30%3A00\.000Z/);
  // End of day (24h later) in Asia/Kolkata is Oct 27 18:30:00Z
  assert.match(requestedUrl, /end=2026-10-27T18%3A30%3A00\.000Z/);

  assert.equal(result.status, "available");
  assert.equal(result.total_slots, 3);
  assert.deepEqual(result.available_slots, ["10:00 AM", "12:00 PM", "03:00 PM"]);
  assert.equal(result.date, "27-10-2026");
  assert.equal(result.timezone, "Asia/Kolkata");
  assert.match(result.message, /Slots are available on 27-10-2026: 10:00 AM, 12:00 PM, 03:00 PM/);
});

// Scenario 2b: Cal.com API v2 returns empty data.slots map for October 27, 2026
test("2b. Cal.com API v2 returns empty data.slots map for October 27, 2026", async () => {
  const mockDb = createMockDb();
  const simulatedNow = new Date("2026-10-26T14:08:34.000Z");

  const mockEmptyV2Fetch: typeof fetch = async () => {
    return new Response(
      JSON.stringify({
        status: "success",
        data: {
          slots: {},
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const result = await checkAvailability(
    {
      appointment_type: "viewing",
      preferred_date: "27-10-2026",
      location: "Hyderabad",
      property_type: "villa",
    },
    {
      db: mockDb as any,
      now: simulatedNow,
      env: VALID_CAL_ENV,
      fetchFn: mockEmptyV2Fetch,
    }
  );

  assert.equal(result.status, "unavailable");
  assert.equal(result.total_slots, 0);
  assert.equal(result.available_slots.length, 0);
  assert.equal(result.date, "27-10-2026");
  assert.equal(result.timezone, "Asia/Kolkata");
  assert.match(result.message, /No available slots on 27-10-2026/);
});

// Scenario 3: Successful booking
test("3. Successful booking through Cal.com API v2 with DB persistence", async () => {
  const mockDb = createMockDb();
  const simulatedNow = new Date("2026-10-26T06:00:00.000Z");

  const mockBookingFetch: typeof fetch = async (url, init) => {
    assert.match(String(url), /https:\/\/api\.cal\.com\/v2\/bookings/);
    const body = JSON.parse(init?.body as string);
    assert.equal(body.eventTypeId, 123456);
    assert.equal(body.attendee.name, "Rajesh Kumar");
    assert.equal(body.attendee.email, "rajesh@example.com");
    assert.equal(body.attendee.phoneNumber, "+919876543210");

    return new Response(
      JSON.stringify({
        status: "success",
        data: {
          uid: "cal_booking_uid_98765",
          title: "Property Viewing with Rajesh Kumar",
          start: "2026-10-28T04:30:00.000Z",
          duration: 60,
        },
      }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );
  };

  const input: BookAppointmentInput = {
    name: "Rajesh Kumar",
    phone_number: "+919876543210",
    email: "rajesh@example.com",
    appointment_type: "property viewing",
    issue_description: "AC is not cooling",
    location: "Hyderabad",
    slot_date: "28-10-2026",
    slot_time: "10:00 AM",
  };

  const result = await bookAppointment(input, {
    db: mockDb as any,
    now: simulatedNow,
    env: VALID_CAL_ENV,
    fetchFn: mockBookingFetch,
  });

  assert.equal(result.status, "confirmed");
  assert.equal(result.booking_status, "confirmed");
  assert.equal(result.booking_reference, "cal_booking_uid_98765");
  assert.match(result.message, /successfully booked/i);

  // Verify persistence in local database with calcomEventId
  const appointments = mockDb._state.appointments;
  assert.equal(appointments.length, 1);
  assert.equal(appointments[0].calcomEventId, "cal_booking_uid_98765");
  assert.equal(appointments[0].provider, "calcom");
  assert.equal(appointments[0].status, "confirmed");

  const contacts = mockDb._state.contacts;
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].phone, "+919876543210");
  assert.equal(contacts[0].firstName, "Rajesh");
});

// Scenario 4: Cal.com authentication failure (401)
test("4. Cal.com authentication failure returns clear error and does not report success", async () => {
  const mockDb = createMockDb();
  const simulatedNow = new Date("2026-10-26T06:00:00.000Z");

  const mock401Fetch: typeof fetch = async () => {
    return new Response(
      JSON.stringify({ error: { message: "Invalid API key" } }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  };

  const availResult = await checkAvailability(
    { preferred_date: "28-10-2026", location: "Hyderabad" },
    { db: mockDb as any, now: simulatedNow, env: VALID_CAL_ENV, fetchFn: mock401Fetch }
  );
  assert.equal(availResult.status, "error");
  assert.match(availResult.message, /Cal\.com authentication failed/i);

  const bookResult = await bookAppointment(
    {
      name: "Suresh",
      phone_number: "+919876543210",
      service_type: "AC Repair",
      issue_description: "AC is not cooling",
      slot_date: "28-10-2026",
      slot_time: "10:00 AM",
      location: "Hyderabad",
    },
    { db: mockDb as any, now: simulatedNow, env: VALID_CAL_ENV, fetchFn: mock401Fetch }
  );
  assert.equal(bookResult.status, "error");
  assert.equal(bookResult.booking_status, "failed");
  assert.match(bookResult.message, /Cal\.com authentication failed/i);
  assert.equal(mockDb._state.appointments.length, 0);
});

// Scenario 5: Missing API key or event type ID
test("5. Missing API key or event type ID returns actionable error without silent fallback", async () => {
  const mockDb = createMockDb();
  const simulatedNow = new Date("2026-10-26T06:00:00.000Z");

  // Test missing CALCOM_API_KEY
  const availResult1 = await checkAvailability(
    { preferred_date: "28-10-2026", location: "Hyderabad" },
    { db: mockDb as any, now: simulatedNow, env: { CALCOM_EVENT_TYPE_ID: "123456" } }
  );
  assert.equal(availResult1.status, "error");
  assert.match(availResult1.message, /CALCOM_API_KEY/i);

  // Test missing CALCOM_EVENT_TYPE_ID
  const availResult2 = await checkAvailability(
    { preferred_date: "28-10-2026", location: "Hyderabad" },
    { db: mockDb as any, now: simulatedNow, env: { CALCOM_API_KEY: "cal_123" } }
  );
  assert.equal(availResult2.status, "error");
  assert.match(availResult2.message, /CALCOM_EVENT_TYPE_ID/i);

  // Booking missing CALCOM_API_KEY
  const bookResult = await bookAppointment(
    {
      name: "Test",
      phone_number: "+919876543210",
      service_type: "AC Repair",
      issue_description: "AC is not cooling",
      slot_date: "28-10-2026",
      slot_time: "10:00 AM",
      location: "Hyderabad",
    },
    { db: mockDb as any, now: simulatedNow, env: {} }
  );
  assert.equal(bookResult.status, "error");
  assert.equal(bookResult.booking_status, "failed");
  assert.match(bookResult.message, /CALCOM_API_KEY/i);
});

// Scenario 6: Invalid event type ID (non-numeric or 404)
test("6. Invalid event type ID returns clear error", async () => {
  const mockDb = createMockDb();
  const simulatedNow = new Date("2026-10-26T06:00:00.000Z");

  // Non-numeric event type ID
  const availNonNumeric = await checkAvailability(
    { preferred_date: "28-10-2026", location: "Hyderabad" },
    { db: mockDb as any, now: simulatedNow, env: { CALCOM_API_KEY: "cal_key", CALCOM_EVENT_TYPE_ID: "not-a-number" } }
  );
  assert.equal(availNonNumeric.status, "error");
  assert.match(availNonNumeric.message, /valid numeric event type ID/i);

  // Cal.com returns 404 (Event type not found)
  const mock404Fetch: typeof fetch = async () => {
    return new Response(
      JSON.stringify({ error: { message: "Event type not found" } }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  };

  const avail404 = await checkAvailability(
    { preferred_date: "28-10-2026", location: "Hyderabad" },
    { db: mockDb as any, now: simulatedNow, env: VALID_CAL_ENV, fetchFn: mock404Fetch }
  );
  assert.equal(avail404.status, "error");
  assert.match(avail404.message, /event type.*was not found/i);
});

// Scenario 7: Provider timeout or rate limit
test("7. Cal.com rate limit (429) and timeout handled gracefully", async () => {
  const mockDb = createMockDb();
  const simulatedNow = new Date("2026-10-26T06:00:00.000Z");

  // 429 Rate Limit
  const mock429Fetch: typeof fetch = async () => {
    return new Response(
      JSON.stringify({ message: "Rate limit exceeded" }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  };

  const avail429 = await checkAvailability(
    { preferred_date: "28-10-2026", location: "Hyderabad" },
    { db: mockDb as any, now: simulatedNow, env: VALID_CAL_ENV, fetchFn: mock429Fetch }
  );
  assert.equal(avail429.status, "error");
  assert.match(avail429.message, /rate limit reached/i);

  // Provider Timeout (AbortError)
  const mockTimeoutFetch: typeof fetch = async () => {
    const error = new Error("The operation was aborted due to timeout");
    error.name = "AbortError";
    throw error;
  };

  const availTimeout = await checkAvailability(
    { preferred_date: "28-10-2026", location: "Hyderabad" },
    { db: mockDb as any, now: simulatedNow, env: VALID_CAL_ENV, fetchFn: mockTimeoutFetch }
  );
  assert.equal(availTimeout.status, "error");
  assert.match(availTimeout.message, /timed out/i);
});

// Scenario 7b: Upstream Cal.com 500 server error
test("7b. Cal.com upstream HTTP 500 error returns error status without fabricating slots", async () => {
  const mockDb = createMockDb();
  const simulatedNow = new Date("2026-10-26T06:00:00.000Z");

  const mock500Fetch: typeof fetch = async () => {
    return new Response(
      JSON.stringify({ message: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  };

  const avail500 = await checkAvailability(
    { preferred_date: "27-10-2026", location: "Hyderabad" },
    { db: mockDb as any, now: simulatedNow, env: VALID_CAL_ENV, fetchFn: mock500Fetch }
  );
  assert.equal(avail500.status, "error");
  assert.equal(avail500.available_slots.length, 0);
  assert.equal(avail500.total_slots, 0);
  assert.match(avail500.message, /HTTP 500/i);

  const book500 = await bookAppointment(
    {
      name: "Suresh",
      phone_number: "+919876543210",
      service_type: "AC Repair",
      issue_description: "AC is not cooling",
      slot_date: "27-10-2026",
      slot_time: "10:00 AM",
      location: "Hyderabad",
    },
    { db: mockDb as any, now: simulatedNow, env: VALID_CAL_ENV, fetchFn: mock500Fetch }
  );
  assert.equal(book500.status, "error");
  assert.equal(book500.booking_status, "failed");
  assert.match(book500.message, /HTTP 500/i);
});

// Scenario 8: Double booking or slot becoming unavailable between lookup and booking
test("8. Cal.com 400 slot unavailable error marks booking as unavailable", async () => {
  const mockDb = createMockDb();
  const simulatedNow = new Date("2026-10-26T06:00:00.000Z");

  const mockSlotTakenFetch: typeof fetch = async () => {
    return new Response(
      JSON.stringify({
        status: "error",
        error: { message: "Selected time slot is no longer available" },
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  };

  const input: BookAppointmentInput = {
    name: "Vikram",
    phone_number: "+919876543210",
    service_type: "AC Repair",
    issue_description: "AC is not cooling",
    slot_date: "28-10-2026",
    slot_time: "10:00 AM",
    location: "Hyderabad",
  };

  const result = await bookAppointment(input, {
    db: mockDb as any,
    now: simulatedNow,
    env: VALID_CAL_ENV,
    fetchFn: mockSlotTakenFetch,
  });

  assert.equal(result.status, "unavailable");
  assert.equal(result.booking_status, "failed");
  assert.match(result.message, /slot.*unavailable/i);
  assert.equal(mockDb._state.appointments.length, 0);
});

// Scenario 9: Invalid dates, timezones, and attendee information
test("9. Validates invalid dates, timezones, and attendee information", async () => {
  const mockDb = createMockDb();
  const simulatedNow = new Date("2026-10-26T06:00:00.000Z");

  // Invalid date format
  const r1 = await checkAvailability(
    { preferred_date: "not-a-date" },
    { db: mockDb as any, env: VALID_CAL_ENV }
  );
  assert.equal(r1.status, "error");
  assert.match(r1.message, /Invalid date format/i);

  // Past date
  const r2 = await checkAvailability(
    { preferred_date: "20-10-2026" },
    { db: mockDb as any, now: simulatedNow, env: VALID_CAL_ENV }
  );
  assert.equal(r2.status, "unavailable");
  assert.match(r2.message, /in the past/i);

  // Missing phone number in booking
  const r3 = await bookAppointment(
    { name: "John", service_type: "AC Repair", issue_description: "AC is not cooling", location: "Hyderabad", slot_date: "28-10-2026", slot_time: "10:00 AM" },
    { db: mockDb as any, env: VALID_CAL_ENV }
  );
  assert.equal(r3.status, "error");
  assert.match(r3.message, /phone number is required/i);

  // Invalid email format in booking
  const r4 = await bookAppointment(
    {
      name: "John",
      phone_number: "+919876543210",
      service_type: "AC Repair",
      issue_description: "AC is not cooling",
      location: "Hyderabad",
      email: "not-an-email-address",
      slot_date: "28-10-2026",
      slot_time: "10:00 AM",
    },
    { db: mockDb as any, env: VALID_CAL_ENV }
  );
  assert.equal(r4.status, "error");
  assert.match(r4.message, /invalid/i);
});

// Scenario 10: Database persistence failure after Cal.com booking succeeds
test("10. Handles DB persistence failure after Cal.com confirms booking without losing reference", async () => {
  const simulatedNow = new Date("2026-10-26T06:00:00.000Z");
  // create mock DB that throws inside $transaction
  const mockFailingDb = createMockDb({ transactionFail: true });

  const mockBookingFetch: typeof fetch = async () => {
    return new Response(
      JSON.stringify({
        status: "success",
        data: {
          uid: "cal_booking_confirmed_123",
          title: "Site Visit with Rahul",
          start: "2026-10-28T04:30:00.000Z",
          duration: 60,
        },
      }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );
  };

  const input: BookAppointmentInput = {
    name: "Rahul",
    phone_number: "+919876543210",
    service_type: "AC Repair",
    issue_description: "AC is not cooling",
    slot_date: "28-10-2026",
    slot_time: "10:00 AM",
    location: "Hyderabad",
  };

  const result = await bookAppointment(input, {
    db: mockFailingDb as any,
    now: simulatedNow,
    env: VALID_CAL_ENV,
    fetchFn: mockBookingFetch,
  });

  // Must still return confirmed because Cal.com booked it!
  assert.equal(result.status, "confirmed");
  assert.equal(result.booking_status, "confirmed");
  assert.equal(result.booking_reference, "cal_booking_confirmed_123");
  assert.match(result.message, /successfully booked/i);
  assert.notEqual(result.warning, undefined);
  assert.match(result.warning!, /database recording issue/i);
});

// Scenario 11: Duplicate booking requests and idempotency
test("11. Rejects duplicate booking requests for the same slot time", async () => {
  const simulatedNow = new Date("2026-10-26T06:00:00.000Z");
  const tz = "Asia/Kolkata";
  const slotDate = "28-10-2026";
  const slotTime = "10:00 AM";

  const parsedDate = parseDateString(slotDate)!;
  const parsedTime = parseTimeString(slotTime)!;
  const startsAt = createDateInTimezone(parsedDate, parsedTime, tz);

  const mockDb = createMockDb({
    appointments: [
      {
        id: "existing-appt-1",
        organizationId: "org-test-1",
        startsAt,
        status: "confirmed",
      },
    ],
  });

  let calComCalled = false;
  const mockFetch: typeof fetch = async () => {
    calComCalled = true;
    return new Response(JSON.stringify({ status: "success" }), { status: 200 });
  };

  const input: BookAppointmentInput = {
    name: "Pooja Reddy",
    phone_number: "+919123456789",
    service_type: "AC Repair",
    issue_description: "AC is not cooling",
    slot_date: slotDate,
    slot_time: slotTime,
    location: "Hyderabad",
  };

  const result = await bookAppointment(input, {
    db: mockDb as any,
    now: simulatedNow,
    env: VALID_CAL_ENV,
    fetchFn: mockFetch,
  });

  assert.equal(result.status, "unavailable");
  assert.equal(result.booking_status, "failed");
  assert.match(result.message, /already booked/i);
  // Provider should not be called when local DB conflict is detected
  assert.equal(calComCalled, false);
});

// Scenario 12: Retell tool argument mapping and structured responses
test("12. Retell tool argument mapping extracts direct and nested arguments", () => {
  // Case 1: Direct arguments
  const p1 = extractToolPayload({
    preferred_date: "28-10-2026",
    location: "Hyderabad",
    call: { call_id: "c1", agent_id: "a1" },
  });
  assert.equal(p1.preferred_date, "28-10-2026");
  assert.equal(p1.location, "Hyderabad");
  assert.equal(p1.call?.call_id, "c1");

  // Case 2: Nested under args
  const p2 = extractToolPayload({
    args: {
      slot_date: "28-10-2026",
      slot_time: "10:00 AM",
      name: "Suresh",
    },
    call: { call_id: "c2", agent_id: "a2" },
  });
  assert.equal(p2.slot_date, "28-10-2026");
  assert.equal(p2.slot_time, "10:00 AM");
  assert.equal(p2.name, "Suresh");
  assert.equal(p2.call?.call_id, "c2");

  // Case 3: Empty / malformed body
  const p3 = extractToolPayload(null);
  assert.deepEqual(p3, {});
});

// Scenario 13: Organization isolation and unauthorized requests
test("13. verifyToolAuthorization enforces security and tenant isolation", async () => {
  const envWithSecret = {
    RETELL_TOOL_SECRET: "secret-super-key-123",
    RETELL_API_KEY: "retell-key-123",
  };

  // 13a. Reject request when RETELL_TOOL_SECRET is not configured on server
  const r1 = await verifyToolAuthorization(
    { "x-retell-secret": "secret-super-key-123" },
    { agent_id: "agent-1" },
    { env: {} }
  );
  assert.equal(r1.authorized, false);
  if (!r1.authorized) {
    assert.equal(r1.status, 401);
    assert.match(r1.error, /RETELL_TOOL_SECRET is not configured/i);
  }

  // 13b. Reject request when request is missing the secret header
  const r2 = await verifyToolAuthorization(
    {},
    { agent_id: "agent-1" },
    { env: envWithSecret }
  );
  assert.equal(r2.authorized, false);
  if (!r2.authorized) {
    assert.equal(r2.status, 401);
    assert.match(r2.error, /Invalid or missing tool secret header/i);
  }

  // 13c. Reject request with incorrect secret header
  const r3 = await verifyToolAuthorization(
    { "x-retell-secret": "wrong-attacker-secret" },
    { agent_id: "agent-1" },
    { env: envWithSecret }
  );
  assert.equal(r3.authorized, false);
  if (!r3.authorized) {
    assert.equal(r3.status, 401);
    assert.match(r3.error, /Invalid or missing tool secret header/i);
  }

  // 13d. Reject request with valid secret but spoofed/fabricated call_id
  const mockRetellClient = { call: { retrieve: async () => null } };
  const r4 = await verifyToolAuthorization(
    { "x-retell-secret": "secret-super-key-123" },
    { agent_id: "agent-legit", call: { call_id: "fake-call-999", agent_id: "agent-legit" } },
    { env: envWithSecret, retellClient: mockRetellClient }
  );
  assert.equal(r4.authorized, false);
  if (!r4.authorized) {
    assert.equal(r4.status, 403);
    assert.match(r4.error, /Call ID not found in Retell/i);
  }

  // 13e. Reject request with valid secret but unrecognized/unlinked agent_id in database
  const mockUnlinkedDb = { providerLink: { findFirst: async () => null } };
  const r5 = await verifyToolAuthorization(
    { "x-retell-secret": "secret-super-key-123" },
    { agent_id: "attacker-agent" },
    { env: envWithSecret, db: mockUnlinkedDb as any }
  );
  assert.equal(r5.authorized, false);
  if (!r5.authorized) {
    assert.equal(r5.status, 403);
    assert.match(r5.error, /Unrecognized or unlinked Retell agent/i);
  }

  // 13f. Accept request with valid secret header and verified agent link
  const mockLinkedDb = {
    providerLink: {
      findFirst: async () => ({
        id: "link-legit",
        provider: "retell",
        providerId: "agent-legit",
        agent: { organizationId: "org-legit-456" },
      }),
    },
  };
  const r6 = await verifyToolAuthorization(
    { "x-retell-secret": "secret-super-key-123" },
    { agent_id: "agent-legit" },
    { env: envWithSecret, db: mockLinkedDb as any }
  );
  assert.equal(r6.authorized, true);
  if (r6.authorized) {
    assert.equal(r6.organizationId, "org-legit-456");
  }

  // 13g. Never treat untrusted body agent_id, call_id, or organizationId as proof of authentication
  const r7 = await verifyToolAuthorization(
    {},
    {
      agent_id: "agent-legit",
      call: { call_id: "call-123", agent_id: "agent-legit" },
      // Attacker trying to spoof organization
      ...({ organizationId: "victim-org" } as any),
    },
    { env: envWithSecret }
  );
  assert.equal(r7.authorized, false);
  if (!r7.authorized) {
    assert.equal(r7.status, 401);
  }

  // 13h. Diagnostic logs do not print secret values or sensitive tokens
  const loggedWarns: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: any[]) => loggedWarns.push(args.join(" "));
  try {
    await verifyToolAuthorization(
      { "x-retell-secret": "secret-to-never-log-123" },
      { agent_id: "agent-1" },
      { env: { RETELL_TOOL_SECRET: "server-secret-never-log-456" } }
    );
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(loggedWarns.length >= 1, true);
  for (const log of loggedWarns) {
    assert.equal(log.includes("secret-to-never-log-123"), false);
    assert.equal(log.includes("server-secret-never-log-456"), false);
  }
});

// ==========================================
// Additional Tool Tests: takeMessage
// ==========================================

test("takeMessage records message and marks DNC if caller requested stop calling", async () => {
  const mockDb = createMockDb();
  const simulatedNow = new Date("2026-10-26T06:00:00.000Z");

  const dncInput: TakeMessageInput = {
    name: "Amit Patel",
    phone_number: "+919876543210",
    email: "amit@example.com",
    message: "Please remove my number and stop calling me.",
  };

  const result = await takeMessage(dncInput, {
    db: mockDb as any,
    now: simulatedNow,
  });

  assert.equal(result.success, true);
  assert.equal(result.name, "Amit Patel");

  // Verify contact was marked doNotCall
  const contact = mockDb._state.contacts[0];
  assert.equal(contact.doNotCall, true);
  assert.equal(contact.status, "inactive");

  // Verify audit log entry
  const auditLogs = mockDb._state.auditLogs;
  assert.equal(auditLogs.length, 1);
  assert.equal(auditLogs[0].action, "record_dnc_message");
  assert.equal(auditLogs[0].details.isDnc, true);
});

test("takeMessage deduplicates identical messages received within 60 seconds", async () => {
  const mockDb = createMockDb();
  const simulatedNow = new Date("2026-10-26T06:00:00.000Z");

  const msgInput: TakeMessageInput = {
    name: "Pooja Sharma",
    phone_number: "+919123456789",
    message: "Please call me tomorrow at 4 PM.",
  };

  // First submission
  const res1 = await takeMessage(msgInput, {
    db: mockDb as any,
    now: simulatedNow,
  });
  assert.equal(res1.success, true);
  assert.equal(mockDb._state.auditLogs.length, 1);

  // Immediate retry submission (e.g. within 10s)
  const res2 = await takeMessage(msgInput, {
    db: mockDb as any,
    now: new Date(simulatedNow.getTime() + 10_000),
  });
  assert.equal(res2.success, true);
  // Audit log count should NOT increase due to deduplication
  assert.equal(mockDb._state.auditLogs.length, 1);
});

// -------------------------------------------------------------
// Cal.com API v2 Verified Event Type 7283034 & Availability Tests
// -------------------------------------------------------------
test("Cal.com API v2 slots lookup for verified Event Type 7283034 uses 2024-09-04 and parses response", async () => {
  const mockDb = createMockDb();
  const simulatedNow = new Date("2026-10-26T06:00:00.000Z");

  let capturedUrl = "";
  let capturedHeaders: Record<string, string> = {};

  const mockFetcher: typeof fetch = async (url, init) => {
    capturedUrl = String(url);
    const headers = init?.headers as any;
    capturedHeaders = {
      authorization: headers?.Authorization || headers?.authorization,
      "cal-api-version": headers?.["cal-api-version"],
      "content-type": headers?.["Content-Type"] || headers?.["content-type"],
    };

    // Official Cal.com API v2 slots response shape
    return new Response(
      JSON.stringify({
        status: "success",
        data: {
          "2026-11-01": [
            { start: "2026-11-01T04:30:00.000Z" }, // 10:00 AM IST
            { start: "2026-11-01T05:30:00.000Z" }, // 11:00 AM IST
            { start: "2026-11-01T09:30:00.000Z" }, // 03:00 PM IST
          ],
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const result = await checkAvailability(
    { preferred_date: "01-11-2026", location: "Hyderabad" },
    {
      db: mockDb as any,
      now: simulatedNow,
      env: {
        CALCOM_API_KEY: "cal_live_valid_key_123",
        CALCOM_EVENT_TYPE_ID: "7283034",
      },
      fetchFn: mockFetcher,
    },
  );

  // Verify headers and URL parameters
  assert.equal(capturedHeaders["cal-api-version"], "2024-09-04");
  assert.equal(capturedHeaders.authorization, "Bearer cal_live_valid_key_123");
  assert.match(capturedUrl, /eventTypeId=7283034/);
  assert.match(capturedUrl, /timeZone=Asia%2FKolkata/);
  // Verify start and end are valid ISO-8601 strings
  assert.match(capturedUrl, /start=2026-10-31T18%3A30%3A00\.000Z/);
  assert.match(capturedUrl, /end=2026-11-01T18%3A30%3A00\.000Z/);

  // Verify parsed slots
  assert.equal(result.status, "available");
  assert.equal(result.total_slots, 3);
  assert.deepEqual(result.available_slots, ["10:00 AM", "11:00 AM", "03:00 PM"]);
  assert.equal(result.timezone, "Asia/Kolkata");
  assert.match(result.message, /Slots are available on 01-11-2026/);
});

test("Regression test: Upstream 404 route error (e.g. Cannot GET /v2/slots) is not falsely reported as event type missing", async () => {
  const mockDb = createMockDb();
  const simulatedNow = new Date("2026-10-26T06:00:00.000Z");

  // Simulates NestJS route 404 when cal-api-version header is rejected
  const mockRoute404Fetcher: typeof fetch = async () => {
    return new Response(
      JSON.stringify({
        statusCode: 404,
        message: "Cannot GET /v2/slots?eventTypeId=7283034",
        error: "Not Found",
      }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  };

  const result = await checkAvailability(
    { preferred_date: "01-11-2026", location: "Hyderabad" },
    {
      db: mockDb as any,
      now: simulatedNow,
      env: {
        CALCOM_API_KEY: "cal_live_key",
        CALCOM_EVENT_TYPE_ID: "7283034",
      },
      fetchFn: mockRoute404Fetcher,
    },
  );

  assert.equal(result.status, "error");
  assert.equal(result.statusCode, 502);
  // Must NOT falsely claim the event type 7283034 was not found
  assert.doesNotMatch(result.message, /event type '7283034' was not found/i);
  assert.match(result.message, /404 Not Found/i);
});

test("extractCalcomSlots handles flat slot array in response", async () => {
  const mockDb = createMockDb();
  const simulatedNow = new Date("2026-10-26T06:00:00.000Z");

  const mockArrayFetcher: typeof fetch = async () => {
    return new Response(
      JSON.stringify({
        status: "success",
        data: [
          { start: "2026-11-01T04:30:00.000Z" },
          { start: "2026-11-01T08:30:00.000Z" },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const result = await checkAvailability(
    { preferred_date: "01-11-2026", location: "Hyderabad" },
    {
      db: mockDb as any,
      now: simulatedNow,
      env: {
        CALCOM_API_KEY: "cal_live_key",
        CALCOM_EVENT_TYPE_ID: "7283034",
      },
      fetchFn: mockArrayFetcher,
    },
  );

  assert.equal(result.status, "available");
  assert.equal(result.total_slots, 2);
  assert.deepEqual(result.available_slots, ["10:00 AM", "02:00 PM"]);
});

test("CALCOM_SLOTS_API_VERSION environment variable override is respected", async () => {
  const mockDb = createMockDb();
  const simulatedNow = new Date("2026-10-26T06:00:00.000Z");

  let capturedVersion = "";
  const mockFetcher: typeof fetch = async (_url, init) => {
    capturedVersion = (init?.headers as any)?.["cal-api-version"];
    return new Response(
      JSON.stringify({ status: "success", data: {} }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  await checkAvailability(
    { preferred_date: "01-11-2026", location: "Hyderabad" },
    {
      db: mockDb as any,
      now: simulatedNow,
      env: {
        CALCOM_API_KEY: "cal_live_key",
        CALCOM_EVENT_TYPE_ID: "7283034",
        CALCOM_SLOTS_API_VERSION: "2024-09-04",
      },
      fetchFn: mockFetcher,
    },
  );

  assert.equal(capturedVersion, "2024-09-04");
});

test("Cal.com API v2 booking uses 2024-08-13 by default, preserves attendee/schedule details, and accepts field aliases", async () => {
  const mockDb = createMockDb();
  const simulatedNow = new Date("2026-10-26T06:00:00.000Z");

  let capturedUrl = "";
  let capturedHeaders: Record<string, string> = {};
  let capturedBody: any = null;

  const mockFetcher: typeof fetch = async (url, init) => {
    capturedUrl = String(url);
    const headers = init?.headers as any;
    capturedHeaders = {
      authorization: headers?.Authorization || headers?.authorization,
      "cal-api-version": headers?.["cal-api-version"],
      "content-type": headers?.["Content-Type"] || headers?.["content-type"],
    };
    capturedBody = JSON.parse(String(init?.body || "{}"));

    return new Response(
      JSON.stringify({
        status: "success",
        data: {
          uid: "cal_booking_uid_ac_repair_123",
          title: "AC Repair for Kiran",
          start: "2026-11-02T06:00:00.000Z",
          duration: 60,
        },
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  };

  const input: BookAppointmentInput = {
    customer_name: "Kiran Sharma",
    phone_number: "+919876543210",
    email: "kiran@example.com",
    service_type: "AC Repair",
    issue_description: "AC is not cooling",
    service_address: "Banjara Hills, Hyderabad",
    preferred_date: "02-11-2026",
    preferred_time: "11:30 AM",
  };

  const result = await bookAppointment(input, {
    db: mockDb as any,
    now: simulatedNow,
    env: {
      CALCOM_API_KEY: "cal_live_valid_key_123",
      CALCOM_EVENT_TYPE_ID: "7283034",
    },
    fetchFn: mockFetcher,
  });

  // Verify headers
  assert.equal(capturedHeaders["cal-api-version"], "2024-08-13");
  assert.equal(capturedHeaders.authorization, "Bearer cal_live_valid_key_123");
  assert.equal(capturedUrl, "https://api.cal.com/v2/bookings");

  // Verify payload matches Cal.com v2 specification
  assert.equal(capturedBody.eventTypeId, 7283034);
  assert.equal(capturedBody.start, "2026-11-02T06:00:00.000Z"); // 11:30 AM IST -> 06:00 UTC
  assert.equal(capturedBody.attendee.name, "Kiran Sharma");
  assert.equal(capturedBody.attendee.email, "kiran@example.com");
  assert.equal(capturedBody.attendee.phoneNumber, "+919876543210");
  assert.equal(capturedBody.attendee.timeZone, "Asia/Kolkata");

  // Verify result
  assert.equal(result.status, "confirmed");
  assert.equal(result.booking_status, "confirmed");
  assert.equal(result.booking_reference, "cal_booking_uid_ac_repair_123");
  assert.match(result.message, /successfully booked/i);

  // Verify DB persistence
  const appts = mockDb._state.appointments;
  assert.equal(appts.length, 1);
  assert.equal(appts[0].calcomEventId, "cal_booking_uid_ac_repair_123");
  assert.equal(appts[0].provider, "calcom");
  assert.equal(appts[0].status, "confirmed");

  const contacts = mockDb._state.contacts;
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].phone, "+919876543210");
  assert.equal(contacts[0].firstName, "Kiran");
});

test("Cal.com HTTP 409 Conflict returns slot unavailable without creating database records", async () => {
  const mockDb = createMockDb();
  const simulatedNow = new Date("2026-10-26T06:00:00.000Z");

  const mock409Fetcher: typeof fetch = async () => {
    return new Response(
      JSON.stringify({
        status: "error",
        message: "The requested time slot is unavailable or has already been booked.",
      }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
  };

  const result = await bookAppointment(
    {
      name: "Suresh",
      phone_number: "+919876543210",
      service_type: "AC Repair",
      issue_description: "AC is not cooling",
      slot_date: "02-11-2026",
      slot_time: "11:30 AM",
      location: "Hyderabad",
    },
    {
      db: mockDb as any,
      now: simulatedNow,
      env: VALID_CAL_ENV,
      fetchFn: mock409Fetcher,
    },
  );

  assert.equal(result.status, "unavailable");
  assert.equal(result.statusCode, 409);
  assert.equal(result.booking_status, "failed");
  assert.match(result.message, /unavailable or has already been booked/i);
  assert.equal(mockDb._state.appointments.length, 0);
});

test("Cal.com HTTP 400 validation error surfaces upstream message and does not report as unavailable", async () => {
  const mockDb = createMockDb();
  const simulatedNow = new Date("2026-10-26T06:00:00.000Z");

  const mock400Fetcher: typeof fetch = async () => {
    return new Response(
      JSON.stringify({
        error: {
          message: "Attendee email domain is not authorized for this event type",
        },
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  };

  const result = await bookAppointment(
    {
      name: "Suresh",
      phone_number: "+919876543210",
      email: "suresh@blocked-domain.com",
      service_type: "AC Repair",
      issue_description: "AC is not cooling",
      slot_date: "02-11-2026",
      slot_time: "11:30 AM",
      location: "Hyderabad",
    },
    {
      db: mockDb as any,
      now: simulatedNow,
      env: VALID_CAL_ENV,
      fetchFn: mock400Fetcher,
    },
  );

  assert.equal(result.status, "error");
  assert.equal(result.statusCode, 400);
  assert.equal(result.booking_status, "failed");
  // Must NOT report as unavailable!
  assert.notEqual(result.status, "unavailable");
  assert.match(result.message, /Attendee email domain is not authorized/i);
  assert.equal(mockDb._state.appointments.length, 0);
});

test("Cal.com HTTP 404 Event type not found returns error and does not persist appointment", async () => {
  const mockDb = createMockDb();
  const simulatedNow = new Date("2026-10-26T06:00:00.000Z");

  const mock404Fetcher: typeof fetch = async () => {
    return new Response(
      JSON.stringify({
        error: { message: "Event type not found" },
      }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  };

  const result = await bookAppointment(
    {
      name: "Suresh",
      phone_number: "+919876543210",
      service_type: "AC Repair",
      issue_description: "AC is not cooling",
      slot_date: "02-11-2026",
      slot_time: "11:30 AM",
      location: "Hyderabad",
    },
    {
      db: mockDb as any,
      now: simulatedNow,
      env: VALID_CAL_ENV,
      fetchFn: mock404Fetcher,
    },
  );

  assert.equal(result.status, "error");
  assert.equal(result.booking_status, "failed");
  assert.match(result.message, /event type.*was not found/i);
  assert.equal(mockDb._state.appointments.length, 0);
});

test("Cal.com response missing booking UID is not reported as confirmed", async () => {
  const mockDb = createMockDb();
  const simulatedNow = new Date("2026-10-26T06:00:00.000Z");

  const mockNoUidFetcher: typeof fetch = async () => {
    return new Response(
      JSON.stringify({
        status: "success",
        data: {}, // No UID or id
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  };

  const result = await bookAppointment(
    {
      name: "Suresh",
      phone_number: "+919876543210",
      service_type: "AC Repair",
      issue_description: "AC is not cooling",
      slot_date: "02-11-2026",
      slot_time: "11:30 AM",
      location: "Hyderabad",
    },
    {
      db: mockDb as any,
      now: simulatedNow,
      env: VALID_CAL_ENV,
      fetchFn: mockNoUidFetcher,
    },
  );

  assert.equal(result.status, "error");
  assert.equal(result.statusCode, 502);
  assert.equal(result.booking_status, "failed");
  assert.match(result.message, /missing a valid booking confirmation identifier/i);
  assert.equal(mockDb._state.appointments.length, 0);
});

test("CALCOM_BOOKING_API_VERSION environment variable override is respected", async () => {
  const mockDb = createMockDb();
  const simulatedNow = new Date("2026-10-26T06:00:00.000Z");

  let capturedVersion = "";
  const mockFetcher: typeof fetch = async (_url, init) => {
    capturedVersion = (init?.headers as any)?.["cal-api-version"];
    return new Response(
      JSON.stringify({
        status: "success",
        data: { uid: "cal_uid_override_test" },
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  };

  await bookAppointment(
    {
      name: "Test User",
      phone_number: "+919876543210",
      service_type: "AC Repair",
      issue_description: "AC is not cooling",
      slot_date: "02-11-2026",
      slot_time: "11:30 AM",
      location: "Hyderabad",
    },
    {
      db: mockDb as any,
      now: simulatedNow,
      env: {
        CALCOM_API_KEY: "cal_live_key",
        CALCOM_EVENT_TYPE_ID: "7283034",
        CALCOM_BOOKING_API_VERSION: "2024-08-13",
      },
      fetchFn: mockFetcher,
    },
  );

  assert.equal(capturedVersion, "2024-08-13");
});
test("appointment_type: 'AC Repair' populates the required service_type in bookingFieldsResponses", async () => {
  const mockDb = createMockDb();
  const simulatedNow = new Date("2026-10-26T06:00:00.000Z");

  let capturedBody: any = null;
  const mockFetcher: typeof fetch = async (_url, init) => {
    capturedBody = JSON.parse(String(init?.body || "{}"));
    return new Response(
      JSON.stringify({ status: "success", data: { uid: "cal_uid_ac_repair_field_test" } }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  };

  const result = await bookAppointment(
    {
      name: "Ramesh Gupta",
      phone_number: "+919876543210",
      appointment_type: "AC Repair",
      issue_description: "AC is not cooling",
      slot_date: "02-11-2026",
      slot_time: "11:30 AM",
      location: "Hyderabad",
    },
    {
      db: mockDb as any,
      now: simulatedNow,
      env: VALID_CAL_ENV,
      fetchFn: mockFetcher,
    },
  );

  assert.equal(result.status, "confirmed");
  assert.equal(capturedBody?.bookingFieldsResponses?.service_type, "AC Repair");
  assert.equal(capturedBody?.metadata?.serviceType, "AC Repair");
});

test("Explicitly supplied bookingFieldsResponses object is preserved alongside service_type", async () => {
  const mockDb = createMockDb();
  const simulatedNow = new Date("2026-10-26T06:00:00.000Z");

  let capturedBody: any = null;
  const mockFetcher: typeof fetch = async (_url, init) => {
    capturedBody = JSON.parse(String(init?.body || "{}"));
    return new Response(
      JSON.stringify({ status: "success", data: { uid: "cal_uid_custom_fields_test" } }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  };

  const result = await bookAppointment(
    {
      name: "Priya Sharma",
      phone_number: "+919876543210",
      service_type: "Plumbing",
      issue_description: "Bathroom tap leaking constantly",
      bookingFieldsResponses: {
        urgency: "urgent",
      },
      slot_date: "02-11-2026",
      slot_time: "11:30 AM",
      location: "Hyderabad",
    },
    {
      db: mockDb as any,
      now: simulatedNow,
      env: VALID_CAL_ENV,
      fetchFn: mockFetcher,
    },
  );

  assert.equal(result.status, "confirmed");
  assert.equal(capturedBody?.bookingFieldsResponses?.service_type, "Plumbing");
  assert.equal(capturedBody?.bookingFieldsResponses?.issue_description, "Bathroom tap leaking constantly");
  assert.equal(capturedBody?.bookingFieldsResponses?.urgency, "urgent");
});

test("Missing service type produces a clear validation error without calling Cal.com", async () => {
  const mockDb = createMockDb();
  let fetcherCalled = false;
  const mockFetcher: typeof fetch = async () => {
    fetcherCalled = true;
    return new Response(JSON.stringify({ status: "success" }), { status: 200 });
  };

  const result = await bookAppointment(
    {
      name: "Anil Kumar",
      phone_number: "+919876543210",
      issue_description: "AC is not cooling",
      slot_date: "02-11-2026",
      slot_time: "11:30 AM",
      location: "Hyderabad",
    },
    {
      db: mockDb as any,
      env: VALID_CAL_ENV,
      fetchFn: mockFetcher,
    },
  );

  assert.equal(result.status, "error");
  assert.equal(result.statusCode, 400);
  assert.equal(result.booking_status, "failed");
  assert.match(result.message, /service type is required/i);
  assert.equal(fetcherCalled, false);
});
test("issue_description: 'AC is not cooling' reaches Cal.com and preserves service_type and custom fields", async () => {
  const mockDb = createMockDb();
  const simulatedNow = new Date("2026-10-26T06:00:00.000Z");

  let capturedBody: any = null;
  const mockFetcher: typeof fetch = async (_url, init) => {
    capturedBody = JSON.parse(String(init?.body || "{}"));
    return new Response(
      JSON.stringify({ status: "success", data: { uid: "cal_uid_issue_desc_test" } }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  };

  const result = await bookAppointment(
    {
      name: "Kavita Rao",
      phone_number: "+919876543210",
      service_type: "AC Repair",
      issue_description: "AC is not cooling",
      bookingFieldsResponses: {
        preferred_technician: "Senior Tech",
      },
      slot_date: "02-11-2026",
      slot_time: "11:30 AM",
      location: "Hyderabad",
    },
    {
      db: mockDb as any,
      now: simulatedNow,
      env: VALID_CAL_ENV,
      fetchFn: mockFetcher,
    },
  );

  assert.equal(result.status, "confirmed");
  assert.equal(capturedBody?.bookingFieldsResponses?.service_type, "AC Repair");
  assert.equal(capturedBody?.bookingFieldsResponses?.issue_description, "AC is not cooling");
  assert.equal(capturedBody?.bookingFieldsResponses?.preferred_technician, "Senior Tech");
  assert.equal(capturedBody?.metadata?.serviceType, "AC Repair");
  assert.equal(capturedBody?.metadata?.issueDescription, "AC is not cooling");
});

test("Missing issue_description produces a clear validation error without calling Cal.com", async () => {
  const mockDb = createMockDb();
  let fetcherCalled = false;
  const mockFetcher: typeof fetch = async () => {
    fetcherCalled = true;
    return new Response(JSON.stringify({ status: "success" }), { status: 200 });
  };

  const result = await bookAppointment(
    {
      name: "Anil Kumar",
      phone_number: "+919876543210",
      service_type: "AC Repair",
      slot_date: "02-11-2026",
      slot_time: "11:30 AM",
      location: "Hyderabad",
    },
    {
      db: mockDb as any,
      env: VALID_CAL_ENV,
      fetchFn: mockFetcher,
    },
  );

  assert.equal(result.status, "error");
  assert.equal(result.statusCode, 400);
  assert.equal(result.booking_status, "failed");
  assert.match(result.message, /issue description is required/i);
  assert.equal(fetcherCalled, false);
});

test("Supports issue_description aliases (description, problem_description, customer_issue, problem)", async () => {
  const simulatedNow = new Date("2026-10-26T06:00:00.000Z");

  const testCases = [
    ["description", "Water leaking from AC indoor unit"],
    ["problem_description", "Compressor making loud humming noise"],
    ["customer_issue", "AC tripping circuit breaker"],
    ["problem", "Remote not responding"],
  ];

  for (const [key, val] of testCases) {
    const mockDb = createMockDb();
    let capturedBody: any = null;
    const mockFetcher: typeof fetch = async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body || "{}"));
      return new Response(
        JSON.stringify({ status: "success", data: { uid: "cal_uid_alias_test" } }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    };

    const result = await bookAppointment(
      {
        name: "Test Caller",
        phone_number: "+919876543210",
        service_type: "AC Repair",
        [key]: val,
        slot_date: "02-11-2026",
        slot_time: "11:30 AM",
        location: "Hyderabad",
      },
      {
        db: mockDb as any,
        now: simulatedNow,
        env: VALID_CAL_ENV,
        fetchFn: mockFetcher,
      },
    );

    assert.equal(result.status, "confirmed");
    assert.equal(capturedBody?.bookingFieldsResponses?.issue_description, val);
  }
});

test("location: 'Hyderabad' is forwarded as attendeeAddress location to Cal.com while preserving service_type, issue_description, and custom fields", async () => {
  const mockDb = createMockDb();
  const simulatedNow = new Date("2026-10-26T06:00:00.000Z");

  let capturedBody: any = null;
  const mockFetcher: typeof fetch = async (_url, init) => {
    capturedBody = JSON.parse(String(init?.body || "{}"));
    return new Response(
      JSON.stringify({ status: "success", data: { uid: "cal_uid_attendee_address_test" } }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  };

  const result = await bookAppointment(
    {
      name: "Swetha",
      phone_number: "+919121998166",
      service_type: "AC Repair",
      issue_description: "AC is not cooling",
      location: "Hyderabad",
      bookingFieldsResponses: {
        preferred_technician: "Senior Tech",
      },
      slot_date: "02-11-2026",
      slot_time: "10:00 AM",
    },
    {
      db: mockDb as any,
      now: simulatedNow,
      env: VALID_CAL_ENV,
      fetchFn: mockFetcher,
    },
  );

  assert.equal(result.status, "confirmed");
  assert.deepStrictEqual(capturedBody?.location, {
    type: "attendeeAddress",
    address: "Hyderabad",
  });
  assert.equal(capturedBody?.bookingFieldsResponses?.service_type, "AC Repair");
  assert.equal(capturedBody?.bookingFieldsResponses?.issue_description, "AC is not cooling");
  assert.equal(capturedBody?.bookingFieldsResponses?.preferred_technician, "Senior Tech");
  assert.equal(capturedBody?.metadata?.location, "Hyderabad");
  assert.equal(capturedBody?.metadata?.serviceType, "AC Repair");
  assert.equal(capturedBody?.metadata?.issueDescription, "AC is not cooling");
});

test("Missing location produces a clear validation error without calling Cal.com", async () => {
  const mockDb = createMockDb();
  let fetcherCalled = false;
  const mockFetcher: typeof fetch = async () => {
    fetcherCalled = true;
    return new Response(JSON.stringify({ status: "success" }), { status: 200 });
  };

  const result = await bookAppointment(
    {
      name: "Swetha",
      phone_number: "+919121998166",
      service_type: "AC Repair",
      issue_description: "AC is not cooling",
      slot_date: "02-11-2026",
      slot_time: "10:00 AM",
    },
    {
      db: mockDb as any,
      env: VALID_CAL_ENV,
      fetchFn: mockFetcher,
    },
  );

  assert.equal(result.status, "error");
  assert.equal(result.statusCode, 400);
  assert.equal(result.booking_status, "failed");
  assert.match(result.message, /location\/address is required/i);
  assert.equal(fetcherCalled, false);
});

test("Supports location aliases (service_address, address, city)", async () => {
  const simulatedNow = new Date("2026-10-26T06:00:00.000Z");

  const testCases = [
    ["service_address", "Flat 402, Banjara Hills, Hyderabad"],
    ["address", "Plot 12, Jubilee Hills, Hyderabad"],
    ["city", "Hyderabad"],
  ];

  for (const [key, val] of testCases) {
    const mockDb = createMockDb();
    let capturedBody: any = null;
    const mockFetcher: typeof fetch = async (_url, init) => {
      capturedBody = JSON.parse(String(init?.body || "{}"));
      return new Response(
        JSON.stringify({ status: "success", data: { uid: "cal_uid_location_alias_test" } }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    };

    const result = await bookAppointment(
      {
        name: "Test Caller",
        phone_number: "+919876543210",
        service_type: "AC Repair",
        issue_description: "AC is not cooling",
        [key]: val,
        slot_date: "02-11-2026",
        slot_time: "11:30 AM",
      },
      {
        db: mockDb as any,
        now: simulatedNow,
        env: VALID_CAL_ENV,
        fetchFn: mockFetcher,
      },
    );

    assert.equal(result.status, "confirmed");
    assert.deepStrictEqual(capturedBody?.location, {
      type: "attendeeAddress",
      address: val,
    });
  }
});

// ==========================================
// Reschedule Appointment Unit Tests
// ==========================================

test("rescheduleAppointment: Option A caller identification with 1 upcoming appointment succeeds", async () => {
  const simulatedNow = new Date("2026-11-01T06:00:00.000Z");
  const initialStartsAt = new Date("2026-11-02T04:30:00.000Z"); // 10:00 AM IST
  const initialEndsAt = new Date("2026-11-02T05:30:00.000Z");   // 11:00 AM IST

  const mockDb = createMockDb({
    appointments: [
      {
        id: "appt-resched-1",
        organizationId: "org-test-1",
        contactId: "contact-1",
        status: "confirmed",
        startsAt: initialStartsAt,
        endsAt: initialEndsAt,
        timezone: "Asia/Kolkata",
        serviceName: "AC Inspection",
        calcomEventId: "cal_uid_initial_123",
        metadata: {
          customerName: "Kiran Kumar",
          phoneNumber: "+919876543210",
          serviceType: "AC Inspection",
          location: "Banjara Hills",
        },
      },
    ],
    contacts: [
      {
        id: "contact-1",
        organizationId: "org-test-1",
        firstName: "Kiran",
        lastName: "Kumar",
        phone: "+919876543210",
      },
    ],
  });

  let capturedUrl = "";
  let capturedBody: any = null;
  const mockFetcher: typeof fetch = async (url, init) => {
    capturedUrl = String(url);
    capturedBody = JSON.parse(String(init?.body || "{}"));
    return new Response(
      JSON.stringify({
        status: "success",
        data: {
          uid: "cal_uid_rescheduled_456",
          meetingUrl: "https://cal.com/meeting/456",
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const result = await rescheduleAppointment(
    {
      phone_number: "+919876543210",
      slot_date: "05-11-2026",
      slot_time: "03:00 PM",
    },
    {
      db: mockDb as any,
      now: simulatedNow,
      env: VALID_CAL_ENV,
      fetchFn: mockFetcher,
      organizationId: "org-test-1",
    },
  );

  assert.equal(result.status, "confirmed");
  assert.equal(result.booking_id, "appt-resched-1");
  assert.equal(result.booking_uid, "cal_uid_rescheduled_456");
  assert.equal(capturedUrl, "https://api.cal.com/v2/bookings/cal_uid_initial_123/reschedule");
  assert.equal(capturedBody.reschedulingReason, "Rescheduled via Boomi Solutions AI Voice Assistant");

  // Verify database record was updated in place and preserved existing customer/service details
  const updated = mockDb._state.appointments.find((a) => a.id === "appt-resched-1");
  assert.equal(updated.calcomEventId, "cal_uid_rescheduled_456");
  assert.equal(updated.metadata.calcomBookingUid, "cal_uid_rescheduled_456");
  assert.equal(updated.metadata.bookingUid, "cal_uid_rescheduled_456");
  assert.equal(updated.metadata.customerName, "Kiran Kumar");
  assert.equal(updated.metadata.serviceType, "AC Inspection");
  assert.equal(updated.metadata.location, "Banjara Hills");
  assert.equal(mockDb._state.appointments.length, 1);
});

test("rescheduleAppointment: Option A with multiple upcoming appointments asks customer to clarify", async () => {
  const simulatedNow = new Date("2026-11-01T06:00:00.000Z");
  const mockDb = createMockDb({
    appointments: [
      {
        id: "appt-1",
        organizationId: "org-test-1",
        status: "confirmed",
        startsAt: new Date("2026-11-03T04:30:00.000Z"),
        endsAt: new Date("2026-11-03T05:30:00.000Z"),
        serviceName: "AC Inspection",
        calcomEventId: "uid-1",
        metadata: { phoneNumber: "+919876543210" },
      },
      {
        id: "appt-2",
        organizationId: "org-test-1",
        status: "confirmed",
        startsAt: new Date("2026-11-06T04:30:00.000Z"),
        endsAt: new Date("2026-11-06T05:30:00.000Z"),
        serviceName: "Filter Replacement",
        calcomEventId: "uid-2",
        metadata: { phoneNumber: "+919876543210" },
      },
    ],
  });

  let fetcherCalled = false;
  const mockFetcher: typeof fetch = async () => {
    fetcherCalled = true;
    return new Response(JSON.stringify({ status: "success" }), { status: 200 });
  };

  const result = await rescheduleAppointment(
    {
      phone_number: "+919876543210",
      slot_date: "07-11-2026",
      slot_time: "10:00 AM",
    },
    {
      db: mockDb as any,
      now: simulatedNow,
      env: VALID_CAL_ENV,
      fetchFn: mockFetcher,
      organizationId: "org-test-1",
    },
  );

  assert.equal(result.status, "error");
  assert.equal(result.statusCode, 400);
  assert.match(result.message, /multiple upcoming appointments.*clarify/i);
  assert.equal(fetcherCalled, false);
});

test("rescheduleAppointment: Option A with no upcoming appointments returns 404", async () => {
  const simulatedNow = new Date("2026-11-01T06:00:00.000Z");
  const mockDb = createMockDb({
    appointments: [
      {
        id: "past-appt",
        organizationId: "org-test-1",
        status: "confirmed",
        startsAt: new Date("2026-10-15T04:30:00.000Z"),
        endsAt: new Date("2026-10-15T05:30:00.000Z"),
        calcomEventId: "uid-past",
        metadata: { phoneNumber: "+919876543210" },
      },
      {
        id: "cancelled-appt",
        organizationId: "org-test-1",
        status: "cancelled",
        startsAt: new Date("2026-11-05T04:30:00.000Z"),
        endsAt: new Date("2026-11-05T05:30:00.000Z"),
        calcomEventId: "uid-cancelled",
        metadata: { phoneNumber: "+919876543210" },
      },
    ],
  });

  const result = await rescheduleAppointment(
    {
      phone_number: "+919876543210",
      slot_date: "08-11-2026",
      slot_time: "11:00 AM",
    },
    {
      db: mockDb as any,
      now: simulatedNow,
      env: VALID_CAL_ENV,
      organizationId: "org-test-1",
    },
  );

  assert.equal(result.status, "error");
  assert.equal(result.statusCode, 404);
  assert.match(result.message, /No upcoming appointments found for phone number/i);
});

test("rescheduleAppointment: Tenant isolation prevents cross-tenant access", async () => {
  const simulatedNow = new Date("2026-11-01T06:00:00.000Z");
  const mockDb = createMockDb({
    appointments: [
      {
        id: "org2-appt",
        organizationId: "org-test-2",
        status: "confirmed",
        startsAt: new Date("2026-11-04T04:30:00.000Z"),
        endsAt: new Date("2026-11-04T05:30:00.000Z"),
        calcomEventId: "cal_uid_org2",
        metadata: { phoneNumber: "+919876543210" },
      },
    ],
  });

  // 1. Phone number search across tenant boundary returns 404
  const resPhone = await rescheduleAppointment(
    {
      phone_number: "+919876543210",
      slot_date: "08-11-2026",
      slot_time: "11:00 AM",
    },
    {
      db: mockDb as any,
      now: simulatedNow,
      env: VALID_CAL_ENV,
      organizationId: "org-test-1",
    },
  );
  assert.equal(resPhone.status, "error");
  assert.equal(resPhone.statusCode, 404);

  // 2. Direct UID access across tenant boundary returns 403 Forbidden
  const resUid = await rescheduleAppointment(
    {
      booking_uid: "cal_uid_org2",
      slot_date: "08-11-2026",
      slot_time: "11:00 AM",
    },
    {
      db: mockDb as any,
      now: simulatedNow,
      env: VALID_CAL_ENV,
      organizationId: "org-test-1",
    },
  );
  assert.equal(resUid.status, "error");
  assert.equal(resUid.statusCode, 403);
  assert.match(resUid.message, /permission to reschedule appointments from another organization/i);
});

test("rescheduleAppointment: Default and custom rescheduling reasons", async () => {
  const simulatedNow = new Date("2026-11-01T06:00:00.000Z");
  const mockDb = createMockDb({
    appointments: [
      {
        id: "appt-reason-test",
        organizationId: "org-test-1",
        status: "confirmed",
        startsAt: new Date("2026-11-04T04:30:00.000Z"),
        endsAt: new Date("2026-11-04T05:30:00.000Z"),
        calcomEventId: "uid-reason",
        metadata: { phoneNumber: "+919876543210" },
      },
    ],
  });

  let capturedBody: any = null;
  const mockFetcher: typeof fetch = async (_url, init) => {
    capturedBody = JSON.parse(String(init?.body || "{}"));
    return new Response(
      JSON.stringify({ status: "success", data: { uid: "uid-reason-updated" } }),
      { status: 200 },
    );
  };

  const result = await rescheduleAppointment(
    {
      phone_number: "+919876543210",
      slot_date: "09-11-2026",
      slot_time: "04:00 PM",
      rescheduling_reason: "Customer has doctor appointment",
    },
    {
      db: mockDb as any,
      now: simulatedNow,
      env: VALID_CAL_ENV,
      fetchFn: mockFetcher,
      organizationId: "org-test-1",
    },
  );

  assert.equal(result.status, "confirmed");
  assert.equal(capturedBody.reschedulingReason, "Customer has doctor appointment");
  const updated = mockDb._state.appointments.find((a) => a.id === "appt-reason-test");
  assert.equal(updated.metadata.reschedulingReason, "Customer has doctor appointment");
});

test("rescheduleAppointment: Cal.com new booking UID updates existing appointment and does not retain outdated UID", async () => {
  const simulatedNow = new Date("2026-11-01T06:00:00.000Z");
  const mockDb = createMockDb({
    appointments: [
      {
        id: "appt-uid-replacement",
        organizationId: "org-test-1",
        status: "confirmed",
        startsAt: new Date("2026-11-04T04:30:00.000Z"),
        endsAt: new Date("2026-11-04T05:30:00.000Z"),
        calcomEventId: "outdated_cal_uid_001",
        metadata: {
          calcomBookingUid: "outdated_cal_uid_001",
          bookingUid: "outdated_cal_uid_001",
          phoneNumber: "+919876543210",
        },
      },
    ],
  });

  const mockFetcher: typeof fetch = async () => {
    return new Response(
      JSON.stringify({
        status: "success",
        data: {
          uid: "brand_new_cal_uid_777",
        },
      }),
      { status: 200 },
    );
  };

  const result = await rescheduleAppointment(
    {
      phone_number: "+919876543210",
      slot_date: "06-11-2026",
      slot_time: "11:00 AM",
    },
    {
      db: mockDb as any,
      now: simulatedNow,
      env: VALID_CAL_ENV,
      fetchFn: mockFetcher,
      organizationId: "org-test-1",
    },
  );

  assert.equal(result.status, "confirmed");
  assert.equal(result.booking_uid, "brand_new_cal_uid_777");

  const appt = mockDb._state.appointments.find((a) => a.id === "appt-uid-replacement");
  assert.equal(appt.calcomEventId, "brand_new_cal_uid_777");
  assert.equal(appt.metadata.calcomBookingUid, "brand_new_cal_uid_777");
  assert.equal(appt.metadata.bookingUid, "brand_new_cal_uid_777");
  assert.notEqual(appt.calcomEventId, "outdated_cal_uid_001");
  assert.notEqual(appt.metadata.calcomBookingUid, "outdated_cal_uid_001");
});

test("rescheduleAppointment: Range overlap conflict check excludes self and detects overlapping ranges", async () => {
  const simulatedNow = new Date("2026-11-01T06:00:00.000Z");

  const apptConflictStart = new Date("2026-11-05T04:30:00.000Z"); // 10:00 AM IST
  const apptConflictEnd = new Date("2026-11-05T05:30:00.000Z");   // 11:00 AM IST

  const mockDb = createMockDb({
    appointments: [
      {
        id: "appt-to-reschedule",
        organizationId: "org-test-1",
        status: "confirmed",
        startsAt: new Date("2026-11-04T04:30:00.000Z"),
        endsAt: new Date("2026-11-04T05:30:00.000Z"),
        calcomEventId: "uid-my-appt",
        metadata: { phoneNumber: "+919876543210" },
      },
      {
        id: "appt-other-booking",
        organizationId: "org-test-1",
        status: "confirmed",
        startsAt: apptConflictStart,
        endsAt: apptConflictEnd,
        calcomEventId: "uid-other-appt",
        metadata: { phoneNumber: "+919999999999" },
      },
    ],
  });

  let fetcherCalled = false;
  const mockFetcher: typeof fetch = async () => {
    fetcherCalled = true;
    return new Response(JSON.stringify({ status: "success" }), { status: 200 });
  };

  // Attempt 1: Overlapping with appt-other-booking (10:30 AM IST overlaps 10:00-11:00)
  const conflictResult = await rescheduleAppointment(
    {
      phone_number: "+919876543210",
      slot_date: "05-11-2026",
      slot_time: "10:30 AM",
    },
    {
      db: mockDb as any,
      now: simulatedNow,
      env: VALID_CAL_ENV,
      fetchFn: mockFetcher,
      organizationId: "org-test-1",
    },
  );

  assert.equal(conflictResult.status, "unavailable");
  assert.equal(conflictResult.statusCode, 409);
  assert.match(conflictResult.message, /overlaps with an existing appointment/i);
  assert.equal(fetcherCalled, false);

  // Attempt 2: Self-overlap (rescheduling appt-to-reschedule by 30 mins within its own previous range)
  const selfOverlapResult = await rescheduleAppointment(
    {
      phone_number: "+919876543210",
      slot_date: "04-11-2026",
      slot_time: "10:30 AM",
    },
    {
      db: mockDb as any,
      now: simulatedNow,
      env: VALID_CAL_ENV,
      fetchFn: mockFetcher,
      organizationId: "org-test-1",
    },
  );

  assert.equal(selfOverlapResult.status, "confirmed");
  assert.equal(fetcherCalled, true);
});

test("rescheduleAppointment: Cal.com failure does not modify local appointment", async () => {
  const simulatedNow = new Date("2026-11-01T06:00:00.000Z");
  const origStartsAt = new Date("2026-11-03T04:30:00.000Z");

  const mockDb = createMockDb({
    appointments: [
      {
        id: "appt-calcom-fail",
        organizationId: "org-test-1",
        status: "confirmed",
        startsAt: origStartsAt,
        endsAt: new Date("2026-11-03T05:30:00.000Z"),
        calcomEventId: "uid-fail-test",
        metadata: { phoneNumber: "+919876543210" },
      },
    ],
  });

  // 1. Cal.com 409 Conflict
  const fetcher409: typeof fetch = async () => {
    return new Response(JSON.stringify({ message: "Slot already booked on calendar" }), { status: 409 });
  };
  const res409 = await rescheduleAppointment(
    {
      phone_number: "+919876543210",
      slot_date: "06-11-2026",
      slot_time: "02:00 PM",
    },
    {
      db: mockDb as any,
      now: simulatedNow,
      env: VALID_CAL_ENV,
      fetchFn: fetcher409,
      organizationId: "org-test-1",
    },
  );
  assert.equal(res409.status, "unavailable");
  assert.equal(res409.statusCode, 409);
  let appt = mockDb._state.appointments.find((a) => a.id === "appt-calcom-fail");
  assert.equal(appt.startsAt.getTime(), origStartsAt.getTime());
  assert.equal(appt.calcomEventId, "uid-fail-test");

  // 2. Cal.com 500 error
  const fetcher500: typeof fetch = async () => {
    return new Response("Internal Server Error", { status: 500 });
  };
  const res500 = await rescheduleAppointment(
    {
      phone_number: "+919876543210",
      slot_date: "06-11-2026",
      slot_time: "02:00 PM",
    },
    {
      db: mockDb as any,
      now: simulatedNow,
      env: VALID_CAL_ENV,
      fetchFn: fetcher500,
      organizationId: "org-test-1",
    },
  );
  assert.equal(res500.status, "error");
  assert.equal(res500.statusCode, 502);
  appt = mockDb._state.appointments.find((a) => a.id === "appt-calcom-fail");
  assert.equal(appt.startsAt.getTime(), origStartsAt.getTime());
  assert.equal(appt.calcomEventId, "uid-fail-test");

  // 3. Cal.com network timeout
  const fetcherTimeout: typeof fetch = async () => {
    const err: any = new Error("The operation was aborted due to timeout");
    err.name = "AbortError";
    throw err;
  };
  const resTimeout = await rescheduleAppointment(
    {
      phone_number: "+919876543210",
      slot_date: "06-11-2026",
      slot_time: "02:00 PM",
    },
    {
      db: mockDb as any,
      now: simulatedNow,
      env: VALID_CAL_ENV,
      fetchFn: fetcherTimeout,
      organizationId: "org-test-1",
    },
  );
  assert.equal(resTimeout.status, "error");
  assert.equal(resTimeout.statusCode, 504);
  appt = mockDb._state.appointments.find((a) => a.id === "appt-calcom-fail");
  assert.equal(appt.startsAt.getTime(), origStartsAt.getTime());
  assert.equal(appt.calcomEventId, "uid-fail-test");
});

test("/api/reschedule-appointment route validates authentication, oversized body, and invalid JSON", async () => {
  const origSecret = process.env.RETELL_TOOL_SECRET;
  process.env.RETELL_TOOL_SECRET = "test-retell-secret-xyz";

  try {
    // 1. Missing secret header returns 401
    const reqNoAuth = new NextRequest(new URL("https://api.example.test/api/reschedule-appointment"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone_number: "+919876543210", slot_date: "05-11-2026", slot_time: "10:00 AM" }),
    });
    const resNoAuth = await rescheduleAppointmentRoute(reqNoAuth);
    assert.equal(resNoAuth.status, 401);

    // 2. Invalid secret header returns 401
    const reqBadAuth = new NextRequest(new URL("https://api.example.test/api/reschedule-appointment"), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-retell-secret": "wrong-secret" },
      body: JSON.stringify({ phone_number: "+919876543210", slot_date: "05-11-2026", slot_time: "10:00 AM" }),
    });
    const resBadAuth = await rescheduleAppointmentRoute(reqBadAuth);
    assert.equal(resBadAuth.status, 401);

    // 3. Oversized payload returns 413
    const reqOversized = new NextRequest(new URL("https://api.example.test/api/reschedule-appointment"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "70000",
        "x-retell-secret": "test-retell-secret-xyz",
      },
      body: JSON.stringify({ data: "a".repeat(70000) }),
    });
    const resOversized = await rescheduleAppointmentRoute(reqOversized);
    assert.equal(resOversized.status, 413);

    // 4. Malformed JSON returns 400
    const reqBadJson = new NextRequest(new URL("https://api.example.test/api/reschedule-appointment"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-retell-secret": "test-retell-secret-xyz",
      },
      body: "{ not valid json ",
    });
    const resBadJson = await rescheduleAppointmentRoute(reqBadJson);
    assert.equal(resBadJson.status, 400);
  } finally {
    process.env.RETELL_TOOL_SECRET = origSecret;
  }
});

test("phoneNumbersMatch accurately compares Indian (+91), US (+1), formatted, and distinct numbers", () => {
  // Matching pairs
  assert.equal(phoneNumbersMatch("+919876543210", "9876543210"), true);
  assert.equal(phoneNumbersMatch("9876543210", "+919876543210"), true);
  assert.equal(phoneNumbersMatch("+91 98765 43210", "+91-98765-43210"), true);
  assert.equal(phoneNumbersMatch("+91 98765 43210", "09876543210"), true);
  assert.equal(phoneNumbersMatch("+1 (555) 123-4567", "5551234567"), true);
  assert.equal(phoneNumbersMatch("0401234567", "1234567"), true);

  // Non-matching pairs
  assert.equal(phoneNumbersMatch("+919876543210", "+919876543211"), false);
  assert.equal(phoneNumbersMatch("+914012345678", "+918012345678"), false);
  assert.equal(phoneNumbersMatch("+919876543210", "1234567890"), false);
  assert.equal(phoneNumbersMatch(null, "+919876543210"), false);
  assert.equal(phoneNumbersMatch("+919876543210", undefined), false);
  assert.equal(phoneNumbersMatch("", "   "), false);
});

test("rescheduleAppointment: Safe formatting of multiple appointments list with invalid or missing timezone", async () => {
  const simulatedNow = new Date("2026-11-01T06:00:00.000Z");
  const mockDb = createMockDb({
    appointments: [
      {
        id: "appt-bad-tz-1",
        organizationId: "org-test-1",
        status: "confirmed",
        startsAt: new Date("2026-11-03T04:30:00.000Z"),
        endsAt: new Date("2026-11-03T05:30:00.000Z"),
        timezone: "Invalid/Not_A_Real_Timezone", // Invalid timezone
        serviceName: "AC Inspection",
        calcomEventId: "uid-1",
        metadata: { phoneNumber: "+919876543210" },
      },
      {
        id: "appt-bad-tz-2",
        organizationId: "org-test-1",
        status: "confirmed",
        startsAt: new Date("2026-11-06T04:30:00.000Z"),
        endsAt: new Date("2026-11-06T05:30:00.000Z"),
        timezone: null, // Null timezone
        serviceName: "Filter Replacement",
        calcomEventId: "uid-2",
        metadata: { phoneNumber: "+919876543210" },
      },
    ],
  });

  const result = await rescheduleAppointment(
    {
      phone_number: "+919876543210",
      slot_date: "07-11-2026",
      slot_time: "10:00 AM",
    },
    {
      db: mockDb as any,
      now: simulatedNow,
      env: VALID_CAL_ENV,
      organizationId: "org-test-1",
    },
  );

  assert.equal(result.status, "error");
  assert.equal(result.statusCode, 400);
  assert.match(result.message, /multiple upcoming appointments.*clarify/i);
});

test("rescheduleAppointment: Cal.com HTTP 200 with status: 'error' is safely handled without local update", async () => {
  const simulatedNow = new Date("2026-11-01T06:00:00.000Z");
  const origStartsAt = new Date("2026-11-03T04:30:00.000Z");

  const mockDb = createMockDb({
    appointments: [
      {
        id: "appt-status-error",
        organizationId: "org-test-1",
        status: "confirmed",
        startsAt: origStartsAt,
        endsAt: new Date("2026-11-03T05:30:00.000Z"),
        calcomEventId: "uid-status-err",
        metadata: { phoneNumber: "+919876543210" },
      },
    ],
  });

  const mockFetcher: typeof fetch = async () => {
    return new Response(
      JSON.stringify({
        status: "error",
        message: "Booking cannot be rescheduled at this stage",
      }),
      { status: 200 },
    );
  };

  const result = await rescheduleAppointment(
    {
      phone_number: "+919876543210",
      slot_date: "06-11-2026",
      slot_time: "02:00 PM",
    },
    {
      db: mockDb as any,
      now: simulatedNow,
      env: VALID_CAL_ENV,
      fetchFn: mockFetcher,
      organizationId: "org-test-1",
    },
  );

  assert.equal(result.status, "error");
  assert.equal(result.statusCode, 400);
  assert.match(result.message, /cannot be rescheduled/i);

  // Local appointment remains untouched
  const appt = mockDb._state.appointments.find((a) => a.id === "appt-status-error");
  assert.equal(appt.startsAt.getTime(), origStartsAt.getTime());
  assert.equal(appt.calcomEventId, "uid-status-err");
});


