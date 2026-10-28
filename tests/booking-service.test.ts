import test from "node:test";
import assert from "node:assert/strict";

import {
  checkAvailability,
  bookAppointment,
  takeMessage,
  extractToolPayload,
  verifyToolAuthorization,
  parseDateString,
  parseTimeString,
  resolveLocationTimezone,
  createDateInTimezone,
  type CheckAvailabilityInput,
  type BookAppointmentInput,
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
          if (args?.where?.startsAt?.gte && a.startsAt < args.where.startsAt.gte) return false;
          if (args?.where?.startsAt?.lte && a.startsAt > args.where.startsAt.lte) return false;
          return true;
        });
      },
      findFirst: async (args: any) => {
        return appointments.find((a) => {
          if (args?.where?.startsAt && a.startsAt.getTime() === args.where.startsAt.getTime()) {
            if (args?.where?.organizationId && a.organizationId !== args.where.organizationId) {
              return false;
            }
            return true;
          }
          return false;
        }) ?? null;
      },
      create: async ({ data }: any) => {
        const created = { id: `appt-${appointments.length + 1}`, ...data };
        appointments.push(created);
        return created;
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
    { name: "John", slot_date: "28-10-2026", slot_time: "10:00 AM" },
    { db: mockDb as any, env: VALID_CAL_ENV }
  );
  assert.equal(r3.status, "error");
  assert.match(r3.message, /phone number is required/i);

  // Invalid email format in booking
  const r4 = await bookAppointment(
    {
      name: "John",
      phone_number: "+919876543210",
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
