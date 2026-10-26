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

// Helper to mock Prisma transactions and operations
function createMockDb(overrides: {
  appointments?: any[];
  contacts?: any[];
  organization?: any;
  providerLink?: any;
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
      create: async ({ data }: any) => {
        auditLogs.push(data);
        return data;
      },
    },
  };

  const mockDb = {
    ...tx,
    $transaction: async (cb: any) => cb(tx),
    _state: { appointments, contacts, auditLogs },
  };

  return mockDb;
}

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

test("checkAvailability succeeds and returns available slots for a future date", async () => {
  const mockDb = createMockDb();
  const simulatedNow = new Date("2026-10-26T06:00:00.000Z"); // Oct 26 2026, 11:30 AM IST

  const result = await checkAvailability(
    {
      preferred_date: "28-10-2026",
      location: "Hyderabad",
      appointment_type: "property viewing",
    },
    { db: mockDb as any, now: simulatedNow }
  );

  assert.equal(result.status, "available");
  assert.equal(result.total_slots > 0, true);
  assert.equal(result.available_slots.includes("10:00 AM"), true);
  assert.equal(result.timezone, "Asia/Kolkata");
});

test("checkAvailability returns unavailable when all slots are taken", async () => {
  const simulatedNow = new Date("2026-10-26T06:00:00.000Z");
  const tz = "Asia/Kolkata";
  const preferredDate = "28-10-2026";
  const parsedDate = parseDateString(preferredDate)!;

  // Fill all slots
  const standardSlots = [
    { hours: 9, minutes: 0 },
    { hours: 10, minutes: 0 },
    { hours: 11, minutes: 0 },
    { hours: 12, minutes: 0 },
    { hours: 14, minutes: 0 },
    { hours: 15, minutes: 0 },
    { hours: 16, minutes: 0 },
    { hours: 17, minutes: 0 },
  ];

  const fullAppointments = standardSlots.map((slot, index) => ({
    id: `appt-${index}`,
    organizationId: "org-test-1",
    startsAt: createDateInTimezone(parsedDate, slot, tz),
    status: "confirmed",
  }));

  const mockDb = createMockDb({ appointments: fullAppointments });

  const result = await checkAvailability(
    {
      preferred_date: preferredDate,
      location: "Hyderabad",
    },
    { db: mockDb as any, now: simulatedNow }
  );

  assert.equal(result.status, "unavailable");
  assert.equal(result.total_slots, 0);
  assert.equal(result.available_slots.length, 0);
  assert.match(result.message, /No.*slots are available/i);
});

test("checkAvailability returns unavailable with friendly message for past dates", async () => {
  const simulatedNow = new Date("2026-10-26T06:00:00.000Z"); // Oct 26 2026
  const mockDb = createMockDb();

  const result = await checkAvailability(
    {
      preferred_date: "20-10-2026", // past date
      location: "Hyderabad",
    },
    { db: mockDb as any, now: simulatedNow }
  );

  assert.equal(result.status, "unavailable");
  assert.equal(result.total_slots, 0);
  assert.match(result.message, /in the past/i);
});

test("checkAvailability handles invalid date format gracefully", async () => {
  const mockDb = createMockDb();

  const result = await checkAvailability(
    {
      preferred_date: "not-a-real-date",
      location: "Hyderabad",
    },
    { db: mockDb as any }
  );

  assert.equal(result.status, "error");
  assert.match(result.message, /Invalid date format/i);
});

test("checkAvailability handles Cal.com provider error without throwing", async () => {
  const mockDb = createMockDb();
  const simulatedNow = new Date("2026-10-26T06:00:00.000Z");

  const mockCalFetch: typeof fetch = async () => {
    return new Response(JSON.stringify({ message: "Cal.com API key expired" }), {
      status: 401,
      statusText: "Unauthorized",
    });
  };

  const result = await checkAvailability(
    {
      preferred_date: "28-10-2026",
      location: "Hyderabad",
    },
    {
      db: mockDb as any,
      now: simulatedNow,
      env: { CALCOM_API_KEY: "invalid-cal-key", CALCOM_EVENT_TYPE_ID: "123" },
      fetchFn: mockCalFetch,
    }
  );

  assert.equal(result.status, "error");
  assert.equal(result.total_slots, 0);
  assert.match(result.message, /Booking provider returned an error/i);
});

test("bookAppointment succeeds and creates appointment and contact records", async () => {
  const mockDb = createMockDb();
  const simulatedNow = new Date("2026-10-26T06:00:00.000Z");

  const input: BookAppointmentInput = {
    name: "Rajesh Kumar",
    phone_number: "+919876543210",
    email: "rajesh@example.com",
    appointment_type: "site visit",
    property_type: "3BHK Luxury",
    location: "Hyderabad",
    slot_date: "28-10-2026",
    slot_time: "10:00 AM",
  };

  const result = await bookAppointment(input, {
    db: mockDb as any,
    now: simulatedNow,
  });

  assert.equal(result.status, "confirmed");
  assert.equal(result.booking_status, "confirmed");
  assert.equal(result.duration_minutes, 60);
  assert.match(result.title, /Rajesh Kumar/);
  assert.match(result.message, /successfully booked/i);

  // Check persisted state in mock database
  const contacts = mockDb._state.contacts;
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].phone, "+919876543210");
  assert.equal(contacts[0].firstName, "Rajesh");

  const appointments = mockDb._state.appointments;
  assert.equal(appointments.length, 1);
  assert.equal(appointments[0].status, "confirmed");
  assert.equal(appointments[0].contactId, contacts[0].id);
});

test("bookAppointment fails when slot is already booked without falsely reporting success", async () => {
  const simulatedNow = new Date("2026-10-26T06:00:00.000Z");
  const tz = "Asia/Kolkata";
  const slotDate = "28-10-2026";
  const slotTime = "10:00 AM";

  const parsedDate = parseDateString(slotDate)!;
  const parsedTime = parseTimeString(slotTime)!;
  const startsAt = createDateInTimezone(parsedDate, parsedTime, tz);

  // Existing conflicting appointment
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

  const input: BookAppointmentInput = {
    name: "Pooja Reddy",
    phone_number: "+919123456789",
    appointment_type: "consultation",
    location: "Hyderabad",
    slot_date: slotDate,
    slot_time: slotTime,
  };

  const result = await bookAppointment(input, {
    db: mockDb as any,
    now: simulatedNow,
  });

  assert.equal(result.status, "unavailable");
  assert.equal(result.booking_status, "failed");
  assert.match(result.message, /already booked/i);
  // Ensure no new appointment was created
  assert.equal(mockDb._state.appointments.length, 1);
});

test("bookAppointment validates missing required fields", async () => {
  const mockDb = createMockDb();

  const resultMissingPhone = await bookAppointment(
    {
      name: "Test User",
      slot_date: "28-10-2026",
      slot_time: "10:00 AM",
    },
    { db: mockDb as any }
  );

  assert.equal(resultMissingPhone.status, "error");
  assert.equal(resultMissingPhone.booking_status, "failed");
  assert.match(resultMissingPhone.message, /phone number is required/i);

  const resultMissingDate = await bookAppointment(
    {
      name: "Test User",
      phone_number: "+919876543210",
      slot_time: "10:00 AM",
    },
    { db: mockDb as any }
  );

  assert.equal(resultMissingDate.status, "error");
  assert.equal(resultMissingDate.booking_status, "failed");
  assert.match(resultMissingDate.message, /slot date is required/i);
});

test("bookAppointment handles Cal.com booking failure safely without reporting success", async () => {
  const mockDb = createMockDb();
  const simulatedNow = new Date("2026-10-26T06:00:00.000Z");

  const mockFailingCalFetch: typeof fetch = async () => {
    return new Response(JSON.stringify({ message: "Time slot unavailable on Cal.com" }), {
      status: 400,
    });
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
    env: { CALCOM_API_KEY: "cal_test_key", CALCOM_EVENT_TYPE_ID: "456" },
    fetchFn: mockFailingCalFetch,
  });

  assert.equal(result.status, "error");
  assert.equal(result.booking_status, "failed");
  assert.match(result.message, /Booking provider returned an error/i);
  // Database appointment must NOT be created on provider failure
  assert.equal(mockDb._state.appointments.length, 0);
});

test("extractToolPayload correctly extracts top-level and nested args from Retell request", () => {
  // Case 1: Direct arguments
  const payload1 = extractToolPayload({
    preferred_date: "28-10-2026",
    location: "Hyderabad",
    call: { call_id: "c1", agent_id: "a1" },
  });
  assert.equal(payload1.preferred_date, "28-10-2026");
  assert.equal(payload1.location, "Hyderabad");
  assert.equal(payload1.call?.call_id, "c1");

  // Case 2: Nested inside args
  const payload2 = extractToolPayload({
    args: {
      slot_date: "28-10-2026",
      slot_time: "10:00 AM",
      name: "Suresh",
    },
    call: { call_id: "c2", agent_id: "a2" },
  });
  assert.equal(payload2.slot_date, "28-10-2026");
  assert.equal(payload2.slot_time, "10:00 AM");
  assert.equal(payload2.name, "Suresh");
  assert.equal(payload2.call?.call_id, "c2");

  // Case 3: Empty / malformed body
  const payload3 = extractToolPayload(null);
  assert.deepEqual(payload3, {});
});

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

test("bookAppointment rejects invalid email format safely", async () => {
  const mockDb = createMockDb();

  const result = await bookAppointment(
    {
      name: "Test User",
      phone_number: "+919876543210",
      email: "not-an-email",
      slot_date: "28-10-2026",
      slot_time: "10:00 AM",
    },
    { db: mockDb as any }
  );

  assert.equal(result.status, "error");
  assert.equal(result.booking_status, "failed");
  assert.match(result.message, /invalid/i);
});

test("checkAvailability respects tenant isolation between organizations", async () => {
  const simulatedNow = new Date("2026-10-26T06:00:00.000Z");
  const tz = "Asia/Kolkata";
  const slotDate = "28-10-2026";
  const parsedDate = parseDateString(slotDate)!;

  // Fill all slots for Organization A
  const standardSlots = [
    { hours: 9, minutes: 0 },
    { hours: 10, minutes: 0 },
    { hours: 11, minutes: 0 },
    { hours: 12, minutes: 0 },
    { hours: 14, minutes: 0 },
    { hours: 15, minutes: 0 },
    { hours: 16, minutes: 0 },
    { hours: 17, minutes: 0 },
  ];

  const orgAAppointments = standardSlots.map((slot, index) => ({
    id: `appt-orgA-${index}`,
    organizationId: "org-A",
    startsAt: createDateInTimezone(parsedDate, slot, tz),
    status: "confirmed",
  }));

  // Create mock DB with agent linked to Organization B
  const mockDb = createMockDb({
    appointments: orgAAppointments,
    organization: { id: "org-B", name: "Org B" },
    providerLink: {
      id: "link-B",
      provider: "retell",
      providerId: "agent-org-B",
      agent: { organizationId: "org-B" },
    },
  });

  // When checking availability for Org B agent, Org A's appointments should NOT block Org B slots
  const result = await checkAvailability(
    {
      preferred_date: slotDate,
      location: "Hyderabad",
      agent_id: "agent-org-B",
    },
    { db: mockDb as any, now: simulatedNow }
  );

  assert.equal(result.status, "available");
  assert.equal(result.total_slots > 0, true);
  assert.equal(result.available_slots.includes("10:00 AM"), true);
});

test("verifyToolAuthorization rejects request without secret when RETELL_TOOL_SECRET is configured", async () => {
  const env = { RETELL_TOOL_SECRET: "secret-super-key-123" };
  const headers = {};
  const payload = { agent_id: "agent-1", call: null };

  const result = await verifyToolAuthorization(headers, payload, { env });
  assert.equal(result.authorized, false);
  if (!result.authorized) {
    assert.equal(result.status, 401);
    assert.match(result.error, /Unauthorized/i);
  }
});

test("verifyToolAuthorization accepts request with matching x-retell-secret header", async () => {
  const env = { RETELL_TOOL_SECRET: "secret-super-key-123" };
  const headers = { "x-retell-secret": "secret-super-key-123" };
  const payload = { agent_id: "agent-1", call: null };

  const result = await verifyToolAuthorization(headers, payload, { env });
  assert.equal(result.authorized, true);
});

test("verifyToolAuthorization rejects spoofed call_id when Retell client reports call not found", async () => {
  const env = { RETELL_API_KEY: "retell-key" };
  const headers = {};
  const payload = {
    agent_id: "agent-legit",
    call: { call_id: "fake-call-999", agent_id: "agent-legit" },
  };

  const mockRetellClient = {
    call: {
      retrieve: async () => null,
    },
  };

  const result = await verifyToolAuthorization(headers, payload, {
    env,
    retellClient: mockRetellClient,
  });

  assert.equal(result.authorized, false);
  if (!result.authorized) {
    assert.equal(result.status, 403);
    assert.match(result.error, /Call ID not found in Retell/i);
  }
});

test("verifyToolAuthorization accepts legitimate active call verified by Retell client", async () => {
  const env = { RETELL_API_KEY: "retell-key" };
  const headers = {};
  const payload = {
    agent_id: "agent-legit",
    call: { call_id: "call-live-123", agent_id: "agent-legit" },
  };

  const mockRetellClient = {
    call: {
      retrieve: async (id: string) => ({
        call_id: id,
        agent_id: "agent-legit",
        call_status: "ongoing",
      }),
    },
  };

  const mockDb = createMockDb({
    providerLink: {
      id: "link-legit",
      provider: "retell",
      providerId: "agent-legit",
      agent: { organizationId: "org-legit" },
    },
  });

  const result = await verifyToolAuthorization(headers, payload, {
    env,
    retellClient: mockRetellClient,
    db: mockDb as any,
  });

  assert.equal(result.authorized, true);
});

test("verifyToolAuthorization rejects unlinked agent_id in database", async () => {
  const env = {};
  const headers = {};
  const payload = { agent_id: "agent-attacker-random" };

  const mockDb = {
    providerLink: {
      findFirst: async () => null,
    },
  };

  const result = await verifyToolAuthorization(headers, payload, {
    env,
    db: mockDb as any,
  });

  assert.equal(result.authorized, false);
  if (!result.authorized) {
    assert.equal(result.status, 403);
    assert.match(result.error, /Unrecognized or unlinked Retell agent/i);
  }
});


