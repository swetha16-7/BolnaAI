import crypto from "node:crypto";
import { prisma as defaultPrisma } from "../db.ts";
import { createRetellClient } from "../calls/retell.ts";

export type CheckAvailabilityInput = {
  appointment_type?: string | null;
  service_type?: string | null;
  preferred_date?: string | null;
  date?: string | null;
  location?: string | null;
  service_address?: string | null;
  property_type?: string | null;
  timezone?: string | null;
  agent_id?: string | null;
  call?: { agent_id?: string | null; call_id?: string | null } | null;
};

export type CheckAvailabilityResult =
  | {
      status: "available";
      statusCode?: number;
      available_slots: string[];
      total_slots: number;
      date: string;
      timezone: string;
      message: string;
    }
  | {
      status: "unavailable";
      statusCode?: number;
      available_slots: string[];
      total_slots: 0;
      date: string;
      timezone: string;
      message: string;
    }
  | {
      status: "error";
      statusCode?: number;
      available_slots: string[];
      total_slots: 0;
      message: string;
    };

export type BookAppointmentInput = {
  name?: string | null;
  customer_name?: string | null;
  caller_name?: string | null;
  phone_number?: string | null;
  phoneNumber?: string | null;
  phone?: string | null;
  email?: string | null;
  appointment_type?: string | null;
  property_type?: string | null;
  location?: string | null;
  city?: string | null;
  slot_date?: string | null;
  slot_time?: string | null;
  date?: string | null;
  time?: string | null;
  preferred_date?: string | null;
  preferred_time?: string | null;
  service_type?: string | null;
  service_address?: string | null;
  address?: string | null;
  issue_description?: string | null;
  description?: string | null;
  problem_description?: string | null;
  customer_issue?: string | null;
  problem?: string | null;
  bookingFieldsResponses?: Record<string, any> | null;
  responses?: Record<string, any> | null;
  timezone?: string | null;
  agent_id?: string | null;
  agent_role?: string | null;
  call?: {
    agent_id?: string | null;
    call_id?: string | null;
    from_number?: string | null;
    customer_number?: string | null;
  } | null;
};

export type BookAppointmentResult =
  | {
      status: "confirmed";
      statusCode?: number;
      booking_status: "confirmed";
      booking_id: string;
      booking_uid: string;
      booking_reference?: string;
      warning?: string;
      start_time: string;
      end_time: string;
      duration_minutes: number;
      title: string;
      location: string;
      meeting_url: string;
      message: string;
    }
  | {
      status: "unavailable";
      statusCode?: number;
      booking_status: "failed";
      message: string;
    }
  | {
      status: "error";
      statusCode?: number;
      booking_status: "failed";
      message: string;
    };

export type RescheduleAppointmentInput = {
  booking_uid?: string | null;
  calcom_event_id?: string | null;
  calcomEventId?: string | null;
  booking_id?: string | null;
  booking_reference?: string | null;
  appointment_id?: string | null;
  phone_number?: string | null;
  phoneNumber?: string | null;
  phone?: string | null;
  caller_number?: string | null;
  slot_date?: string | null;
  slot_time?: string | null;
  date?: string | null;
  time?: string | null;
  new_date?: string | null;
  new_time?: string | null;
  preferred_date?: string | null;
  preferred_time?: string | null;
  timezone?: string | null;
  rescheduling_reason?: string | null;
  reason?: string | null;
  agent_id?: string | null;
  call?: {
    agent_id?: string | null;
    call_id?: string | null;
    from_number?: string | null;
    customer_number?: string | null;
  } | null;
};

export type RescheduleAppointmentResult =
  | {
      status: "confirmed";
      statusCode?: number;
      booking_status: "confirmed";
      booking_id: string;
      booking_uid: string;
      booking_reference?: string;
      warning?: string;
      start_time: string;
      end_time: string;
      duration_minutes: number;
      title: string;
      location: string;
      meeting_url: string;
      message: string;
    }
  | {
      status: "unavailable";
      statusCode?: number;
      booking_status: "failed";
      message: string;
    }
  | {
      status: "error";
      statusCode?: number;
      booking_status: "failed";
      message: string;
    };

export type TakeMessageInput = {
  name?: string | null;
  phone_number?: string | null;
  email?: string | null;
  message?: string | null;
  reason?: string | null;
  agent_id?: string | null;
  call?: { agent_id?: string | null; call_id?: string | null } | null;
};

export type TakeMessageResult =
  | {
      success: true;
      statusCode?: number;
      message: string;
      name: string;
      phone_number: string;
    }
  | {
      success: false;
      statusCode?: number;
      message: string;
      name?: string;
      phone_number?: string;
    };

export const STANDARD_DAILY_SLOTS = [
  "09:00 AM",
  "10:00 AM",
  "11:00 AM",
  "12:00 PM",
  "02:00 PM",
  "03:00 PM",
  "04:00 PM",
  "05:00 PM",
] as const;

export function timingSafeSecretEqual(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a.trim());
  const bufB = Buffer.from(b.trim());
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyCalcomSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret?: string | null,
): boolean {
  if (!secret || !secret.trim()) return true; // If no secret configured, allow (e.g. dev/test)
  if (!signatureHeader || !signatureHeader.trim()) return false;

  const cleanHeader = signatureHeader.replace(/^sha256=/i, "").replace(/^v1=/i, "").trim();

  // Header may be raw secret or HMAC sha256
  if (
    timingSafeSecretEqual(cleanHeader, secret.trim()) ||
    timingSafeSecretEqual(signatureHeader.trim(), secret.trim())
  ) {
    return true;
  }

  try {
    const hmac = crypto.createHmac("sha256", secret.trim());
    const expected = hmac.update(rawBody).digest("hex");
    return (
      timingSafeSecretEqual(cleanHeader.toLowerCase(), expected.toLowerCase()) ||
      timingSafeSecretEqual(signatureHeader.trim().toLowerCase(), expected.toLowerCase())
    );
  } catch {
    return false;
  }
}

export function parseDateString(
  dateStr: string | null | undefined,
  referenceNow?: Date,
): { year: number; month: number; day: number } | null {
  if (!dateStr || typeof dateStr !== "string") return null;
  const trimmed = dateStr.trim();
  const lower = trimmed.toLowerCase();

  // Natural language relative dates
  if (lower === "today" || lower === "now") {
    const base = referenceNow ?? new Date();
    return { year: base.getFullYear(), month: base.getMonth() + 1, day: base.getDate() };
  }
  if (lower === "tomorrow") {
    const base = referenceNow ?? new Date();
    const tom = new Date(base.getTime() + 24 * 60 * 60 * 1000);
    return { year: tom.getFullYear(), month: tom.getMonth() + 1, day: tom.getDate() };
  }

  // Try DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10);
    const year = parseInt(dmyMatch[3], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (day > daysInMonth) return null;
    return { year, month, day };
  }

  // Try YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10);
    const day = parseInt(ymdMatch[3], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (day > daysInMonth) return null;
    return { year, month, day };
  }

  // Fallback: Date parse for ISO or standard strings
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return {
      year: parsed.getFullYear(),
      month: parsed.getMonth() + 1,
      day: parsed.getDate(),
    };
  }

  return null;
}

export function parseTimeString(timeStr: string | null | undefined): { hours: number; minutes: number } | null {
  if (!timeStr || typeof timeStr !== "string") return null;
  let cleaned = timeStr.trim();
  // If ISO string like "2026-11-01T10:00:00Z", extract time part
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}T/i.test(cleaned)) {
    cleaned = cleaned.split(/T/i)[1];
  }
  // Strip trailing timezone abbreviations like IST, EST, EDT, CST, CDT, MST, MDT, PST, PDT, UTC, GMT
  cleaned = cleaned.replace(/\b(IST|EST|EDT|CST|CDT|MST|MDT|PST|PDT|UTC|GMT)\b/gi, "").trim();
  // Strip trailing timezone offset like +05:30, -04:00, +0530, Z
  cleaned = cleaned.replace(/(?:[+-]\d{2}:?\d{2}|Z)$/i, "").trim();
  // Strip parentheses e.g. (IST)
  cleaned = cleaned.replace(/\([^\)]*\)/g, "").trim();

  const match = cleaned.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const ampm = match[3]?.toUpperCase();

  if (minutes < 0 || minutes > 59) return null;

  if (ampm) {
    if (hours < 1 || hours > 12) return null;
    if (ampm === "AM" && hours === 12) hours = 0;
    if (ampm === "PM" && hours < 12) hours += 12;
  } else {
    if (hours < 0 || hours > 23) return null;
  }

  return { hours, minutes };
}

export function resolveLocationTimezone(location?: string | null, explicitTimezone?: string | null): string {
  if (explicitTimezone?.trim()) {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: explicitTimezone.trim() });
      return explicitTimezone.trim();
    } catch {
      // Invalid timezone, fall back
    }
  }

  if (location && typeof location === "string") {
    const loc = location.toLowerCase();
    if (
      loc.includes("hyderabad") ||
      loc.includes("bangalore") ||
      loc.includes("bengaluru") ||
      loc.includes("mumbai") ||
      loc.includes("delhi") ||
      loc.includes("chennai") ||
      loc.includes("kolkata") ||
      loc.includes("pune") ||
      loc.includes("india")
    ) {
      return "Asia/Kolkata";
    }
    if (loc.includes("new york") || loc.includes("boston") || loc.includes("miami") || loc.includes("est") || loc.includes("edt")) {
      return "America/New_York";
    }
    if (loc.includes("chicago") || loc.includes("dallas") || loc.includes("houston") || loc.includes("cst") || loc.includes("cdt")) {
      return "America/Chicago";
    }
    if (loc.includes("denver") || loc.includes("mst") || loc.includes("mdt")) {
      return "America/Denver";
    }
    if (loc.includes("california") || loc.includes("los angeles") || loc.includes("san francisco") || loc.includes("seattle") || loc.includes("pst") || loc.includes("pdt")) {
      return "America/Los_Angeles";
    }
    if (loc.includes("london") || loc.includes("uk") || loc.includes("united kingdom")) {
      return "Europe/London";
    }
    if (loc.includes("dubai") || loc.includes("uae")) {
      return "Asia/Dubai";
    }
  }

  return "Asia/Kolkata";
}

function getTimezoneOffsetMs(timeZone: string, date: Date): number {
  try {
    const utcDate = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
    const tzDate = new Date(date.toLocaleString("en-US", { timeZone }));
    return tzDate.getTime() - utcDate.getTime();
  } catch {
    return 0;
  }
}

export function createDateInTimezone(
  yearOrDateObj: number | { year: number; month: number; day: number },
  monthOrTimeObj?: number | { hours: number; minutes: number },
  dayOrTz?: number | string,
  hours = 0,
  minutes = 0,
  timezone = "Asia/Kolkata",
): Date {
  let y: number;
  let m: number;
  let d: number;
  let h = hours;
  let min = minutes;
  let tz = timezone;

  if (typeof yearOrDateObj === "object" && yearOrDateObj !== null) {
    y = yearOrDateObj.year;
    m = yearOrDateObj.month;
    d = yearOrDateObj.day;
    if (typeof monthOrTimeObj === "object" && monthOrTimeObj !== null) {
      h = monthOrTimeObj.hours;
      min = monthOrTimeObj.minutes;
    }
    if (typeof dayOrTz === "string") {
      tz = dayOrTz;
    }
  } else {
    y = yearOrDateObj;
    m = typeof monthOrTimeObj === "number" ? monthOrTimeObj : 1;
    d = typeof dayOrTz === "number" ? dayOrTz : 1;
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  const isoLocal = `${y}-${pad(m)}-${pad(d)}T${pad(h)}:${pad(min)}:00Z`;
  const baseUtc = new Date(isoLocal);
  const offset = getTimezoneOffsetMs(tz, baseUtc);
  return new Date(baseUtc.getTime() - offset);
}

export function formatTimeSlot(hours: number, minutes = 0): string {
  const ampm = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 === 0 ? 12 : hours % 12;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(displayHours)}:${pad(minutes)} ${ampm}`;
}

export type BookingServiceOptions = {
  db?: any;
  calcomFetcher?: typeof fetch;
  fetchFn?: typeof fetch;
  environment?: Record<string, string | undefined>;
  env?: Record<string, string | undefined>;
  retellClient?: any;
  now?: Date;
  organizationId?: string;
};

export type ToolAuthorizationResult =
  | { authorized: true; organizationId?: string }
  | { authorized: false; status: 401 | 403; error: string };

export async function verifyToolAuthorization(
  headers: Headers | Record<string, string | null | undefined>,
  payload: { agent_id?: string | null; call?: { agent_id?: string | null; call_id?: string | null } | null },
  options: BookingServiceOptions = {},
): Promise<ToolAuthorizationResult> {
  const env = options.environment ?? options.env ?? process.env;
  const configuredSecret = env.RETELL_TOOL_SECRET?.trim() || env.RETELL_WEBHOOK_SECRET?.trim();

  // 1. A shared secret MUST be configured on the server. Reject all tool calls if secret is missing.
  if (!configuredSecret) {
    console.warn("[Retell Tool Auth Diagnostic] status=401 reason=\"RETELL_TOOL_SECRET is not configured on server\"");
    return {
      authorized: false,
      status: 401,
      error: "Unauthorized: RETELL_TOOL_SECRET is not configured on server. Custom tool requests must be authenticated with a configured secret.",
    };
  }

  const getHeader = (name: string): string | null => {
    if (headers && typeof (headers as any).get === "function") {
      return (headers as any).get(name) || (headers as any).get(name.toLowerCase());
    }
    if (headers && typeof headers === "object") {
      const target = name.toLowerCase();
      for (const [k, v] of Object.entries(headers)) {
        if (k.toLowerCase() === target && typeof v === "string") return v;
      }
    }
    return null;
  };

  // 2. Validate that the request supplies the matching secret header.
  // Body fields (agent_id, call_id, organizationId) are never trusted as proof of authentication.
  const providedSecret =
    getHeader("x-retell-secret") ||
    getHeader("x-api-key") ||
    getHeader("authorization")?.replace(/^Bearer\s+/i, "");

  if (!providedSecret || !timingSafeSecretEqual(providedSecret, configuredSecret)) {
    console.warn(
      `[Retell Tool Auth Diagnostic] status=401 reason="Invalid or missing tool secret header" hasHeader=${Boolean(providedSecret)}`
    );
    return { authorized: false, status: 401, error: "Unauthorized: Invalid or missing tool secret header." };
  }

  // 3. Once secret header is verified, validate call and agent linkage for multi-tenant isolation
  const retellAgentId = payload?.agent_id || payload?.call?.agent_id;
  const callId = payload?.call?.call_id;
  const db = options.db ?? defaultPrisma;

  // 3a. If call_id is supplied, verify authenticity with Retell API when retell client/key is available
  const retellApiKey = env.RETELL_API_KEY?.trim();
  if (callId && retellApiKey && retellApiKey !== "replace-with-retell-api-key") {
    try {
      const client = options.retellClient ?? createRetellClient(retellApiKey, options.fetchFn ?? fetch);
      const retellCall = await client.call.retrieve(callId);
      if (!retellCall) {
        return { authorized: false, status: 403, error: "Forbidden: Call ID not found in Retell." };
      }
      if (retellAgentId && retellCall.agent_id && retellCall.agent_id !== retellAgentId) {
        return { authorized: false, status: 403, error: "Forbidden: Call does not match specified Retell agent." };
      }
    } catch {
      return { authorized: false, status: 403, error: "Forbidden: Unable to verify Retell call authenticity." };
    }
  }

  // 3b. If agent_id is supplied, verify it is mapped to an authorized organization in database
  if (retellAgentId) {
    if (db?.providerLink?.findFirst) {
      try {
        const link = await db.providerLink.findFirst({
          where: { provider: "retell", providerId: retellAgentId },
          include: { agent: true },
        });
        if (!link || !link.agent?.organizationId) {
          return { authorized: false, status: 403, error: "Forbidden: Unrecognized or unlinked Retell agent." };
        }
        return { authorized: true, organizationId: link.agent.organizationId };
      } catch {
        return { authorized: false, status: 403, error: "Forbidden: Error validating Retell agent link." };
      }
    }
  }

  return { authorized: true };
}

export function extractCalcomSlots(
  data: any,
  timezone: string,
  now?: Date,
  isToday = false,
): string[] {
  if (!data || typeof data !== "object") return [];

  const allSlots: string[] = [];
  const seen = new Set<string>();

  const processItem = (item: any) => {
    let isoStr: string | null = null;
    if (typeof item === "string") {
      isoStr = item;
    } else if (item && typeof item === "object") {
      isoStr = item.start || item.time || item.slot || item.startTime || null;
    }

    if (isoStr) {
      const slotDate = new Date(isoStr);
      if (!isNaN(slotDate.getTime())) {
        if (isToday && now && slotDate.getTime() <= now.getTime()) {
          return;
        }
        const parts = new Intl.DateTimeFormat("en-US", {
          timeZone: timezone,
          hour: "numeric",
          minute: "numeric",
          hour12: false,
        }).formatToParts(slotDate);
        const hStr = parts.find((p) => p.type === "hour")?.value ?? "0";
        const mStr = parts.find((p) => p.type === "minute")?.value ?? "0";
        const formatted = formatTimeSlot(parseInt(hStr, 10), parseInt(mStr, 10));
        if (!seen.has(formatted)) {
          seen.add(formatted);
          allSlots.push(formatted);
        }
      }
    }
  };

  // 1. Direct array of slots (e.g., data = [...], data.data = [...], data.slots = [...], data.data.slots = [...])
  const directList = Array.isArray(data)
    ? data
    : Array.isArray(data.data)
    ? data.data
    : Array.isArray(data.slots)
    ? data.slots
    : Array.isArray(data.data?.slots)
    ? data.data.slots
    : null;

  if (directList) {
    for (const item of directList) {
      processItem(item);
    }
    return allSlots;
  }

  // 2. Map of date strings -> array of slots (e.g. data.data.slots, data.slots, data.data, or data itself)
  const slotsMap =
    data.data?.slots && typeof data.data.slots === "object" && !Array.isArray(data.data.slots)
      ? data.data.slots
      : data.slots && typeof data.slots === "object" && !Array.isArray(data.slots)
      ? data.slots
      : data.data && typeof data.data === "object" && !Array.isArray(data.data)
      ? data.data
      : typeof data === "object" && !Array.isArray(data)
      ? data
      : {};

  for (const dayKey of Object.keys(slotsMap)) {
    const daySlots = Array.isArray(slotsMap[dayKey]) ? slotsMap[dayKey] : [];
    for (const item of daySlots) {
      processItem(item);
    }
  }

  return allSlots;
}

export async function checkAvailability(
  input: CheckAvailabilityInput,
  options: BookingServiceOptions = {},
): Promise<CheckAvailabilityResult> {
  const preferred_date = input.preferred_date || (input as any).date;
  const location =
    input.location ||
    (input as any).city ||
    (input as any).service_address ||
    (input as any).address;
  const explicitTimezone = input.timezone;

  if (!preferred_date || typeof preferred_date !== "string" || !preferred_date.trim()) {
    return {
      status: "error",
      statusCode: 400,
      available_slots: [],
      total_slots: 0,
      message: "Missing preferred_date parameter. Expected format: DD-MM-YYYY.",
    };
  }

  const now = options.now ?? new Date();
  const parsedDate = parseDateString(preferred_date, now);
  if (!parsedDate) {
    return {
      status: "error",
      statusCode: 400,
      available_slots: [],
      total_slots: 0,
      message: `Invalid date format: '${preferred_date}'. Please provide date in DD-MM-YYYY format (e.g. 01-11-2026).`,
    };
  }

  const timezone = resolveLocationTimezone(location, explicitTimezone);

  // Validate that the entire day is not in the past
  const startOfDay = createDateInTimezone(parsedDate.year, parsedDate.month, parsedDate.day, 0, 0, timezone);
  const nextDay = new Date(Date.UTC(parsedDate.year, parsedDate.month - 1, parsedDate.day + 1));
  const endOfDay = createDateInTimezone(
    nextDay.getUTCFullYear(),
    nextDay.getUTCMonth() + 1,
    nextDay.getUTCDate(),
    0,
    0,
    timezone,
  );

  if (endOfDay.getTime() <= now.getTime()) {
    return {
      status: "unavailable",
      statusCode: 200,
      available_slots: [],
      total_slots: 0,
      date: preferred_date.trim(),
      timezone,
      message: `The requested date ${preferred_date.trim()} is in the past. Please suggest a future date to the caller.`,
    };
  }

  const env = options.environment ?? options.env ?? process.env;
  const calcomApiKey = env.CALCOM_API_KEY?.trim();
  const calcomEventTypeId = env.CALCOM_EVENT_TYPE_ID?.trim();

  // Validate Cal.com runtime configuration
  if (!calcomApiKey || calcomApiKey === "replace-with-cal-com-api-key" || calcomApiKey.includes("replace-")) {
    return {
      status: "error",
      statusCode: 500,
      available_slots: [],
      total_slots: 0,
      message: "Scheduling provider is not configured. Missing or invalid CALCOM_API_KEY.",
    };
  }

  if (!calcomEventTypeId) {
    return {
      status: "error",
      statusCode: 500,
      available_slots: [],
      total_slots: 0,
      message: "Scheduling provider is not configured. Missing CALCOM_EVENT_TYPE_ID.",
    };
  }

  const numericEventTypeId = parseInt(calcomEventTypeId, 10);
  if (isNaN(numericEventTypeId) || numericEventTypeId <= 0) {
    return {
      status: "error",
      statusCode: 500,
      available_slots: [],
      total_slots: 0,
      message: `Invalid CALCOM_EVENT_TYPE_ID: '${calcomEventTypeId}' is not a valid numeric event type ID.`,
    };
  }

  const fetcher = options.calcomFetcher ?? options.fetchFn ?? fetch;
  const startIso = startOfDay.toISOString();
  const endIso = endOfDay.toISOString();

  const isToday = now.getTime() >= startOfDay.getTime() && now.getTime() <= endOfDay.getTime();

  // Primary: Cal.com API v2 slots query
  // Official Cal.com v2 slots endpoint uses version header 'cal-api-version: 2024-09-04'
  const slotsApiVersion = env.CALCOM_SLOTS_API_VERSION?.trim() || env.CALCOM_API_VERSION?.trim() || "2024-09-04";
  const v2Url = `https://api.cal.com/v2/slots?eventTypeId=${encodeURIComponent(numericEventTypeId)}&start=${encodeURIComponent(startIso)}&end=${encodeURIComponent(endIso)}&timeZone=${encodeURIComponent(timezone)}`;

  try {
    const response = await fetcher(v2Url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${calcomApiKey}`,
        "cal-api-version": slotsApiVersion,
        "Content-Type": "application/json",
      },
    });

    if (response.status === 401) {
      console.warn(
        `[Cal.com Availability Diagnostic] upstream_status=401 eventTypeId=${numericEventTypeId} date=${preferred_date.trim()} tz=${timezone}`
      );
      return {
        status: "error",
        statusCode: 502,
        available_slots: [],
        total_slots: 0,
        message: "Cal.com authentication failed. Please verify CALCOM_API_KEY.",
      };
    }

    if (response.status === 404) {
      let isExplicitEventTypeNotFound = false;
      let errorDetail = "";
      try {
        const errJson = await response.clone().json();
        const msg = String(errJson?.message || errJson?.error?.message || errJson?.error || "");
        errorDetail = msg;
        // Verify if upstream explicitly identified the event type as missing
        if (
          (/event\s*type/i.test(msg) || /not\s*found/i.test(msg)) &&
          !/cannot\s*get/i.test(msg) &&
          !/route/i.test(msg)
        ) {
          isExplicitEventTypeNotFound = true;
        }
      } catch {}

      console.warn(
        `[Cal.com Availability Diagnostic] upstream_status=404 eventTypeId=${numericEventTypeId} date=${preferred_date.trim()} tz=${timezone}${errorDetail ? ` detail="${errorDetail.slice(0, 150)}"` : ""}`
      );

      if (isExplicitEventTypeNotFound) {
        return {
          status: "error",
          statusCode: 502,
          available_slots: [],
          total_slots: 0,
          message: `Cal.com event type '${numericEventTypeId}' was not found. Please verify CALCOM_EVENT_TYPE_ID.`,
        };
      }

      return {
        status: "error",
        statusCode: 502,
        available_slots: [],
        total_slots: 0,
        message: `Booking provider availability endpoint returned 404 Not Found.${errorDetail ? ` ${errorDetail.slice(0, 120)}` : ""}`,
      };
    }

    if (response.status === 429) {
      console.warn(
        `[Cal.com Availability Diagnostic] upstream_status=429 eventTypeId=${numericEventTypeId} date=${preferred_date.trim()} tz=${timezone}`
      );
      return {
        status: "error",
        statusCode: 429,
        available_slots: [],
        total_slots: 0,
        message: "Cal.com rate limit reached. Please try again shortly.",
      };
    }

    if (!response.ok) {
      let errorDetail = "";
      try {
        const errJson = await response.clone().json();
        if (errJson?.message) errorDetail = String(errJson.message).slice(0, 150);
        else if (errJson?.error?.message) errorDetail = String(errJson.error.message).slice(0, 150);
      } catch {}
      console.warn(
        `[Cal.com Availability Diagnostic] upstream_status=${response.status} eventTypeId=${numericEventTypeId} date=${preferred_date.trim()} tz=${timezone}${errorDetail ? ` detail="${errorDetail}"` : ""}`
      );
      return {
        status: "error",
        statusCode: 502,
        available_slots: [],
        total_slots: 0,
        message: `Booking provider returned an error (HTTP ${response.status}).${errorDetail ? ` ${errorDetail}` : ""}`,
      };
    }

    const data = await response.json();
    const allSlots = extractCalcomSlots(data, timezone, now, isToday);

    if (allSlots.length === 0) {
      return {
        status: "unavailable",
        statusCode: 200,
        available_slots: [],
        total_slots: 0,
        date: preferred_date.trim(),
        timezone,
        message: `No available slots on ${preferred_date.trim()}. Please suggest an alternative date to the caller.`,
      };
    }

    return {
      status: "available",
      statusCode: 200,
      available_slots: allSlots,
      total_slots: allSlots.length,
      date: preferred_date.trim(),
      timezone,
      message: `Slots are available on ${preferred_date.trim()}: ${allSlots.join(", ")}.`,
    };
  } catch (calcomError: any) {
    console.error(
      `[Cal.com Availability Error] eventTypeId=${numericEventTypeId} date=${preferred_date.trim()} tz=${timezone} error="${calcomError?.message || "Unknown error"}"`
    );
    if (calcomError?.name === "AbortError" || /timeout/i.test(calcomError?.message)) {
      return {
        status: "error",
        statusCode: 504,
        available_slots: [],
        total_slots: 0,
        message: "Scheduling provider request timed out.",
      };
    }
    return {
      status: "error",
      statusCode: 502,
      available_slots: [],
      total_slots: 0,
      message: `Booking provider error: ${calcomError?.message || "Connection refused"}.`,
    };
  }
}

export async function bookAppointment(
  input: BookAppointmentInput,
  options: BookingServiceOptions = {},
): Promise<BookAppointmentResult> {
  const name =
    input.name ||
    (input as any).customer_name ||
    (input as any).caller_name ||
    (input as any).attendee_name ||
    (input as any).client_name;

  const phone_number =
    input.phone_number ||
    (input as any).phoneNumber ||
    (input as any).phone ||
    (input as any).caller_phone ||
    (input as any).caller_number ||
    (input as any).attendee_phone ||
    input.call?.from_number ||
    input.call?.customer_number;

  const email = input.email || (input as any).attendee_email || (input as any).customer_email;
  const rawServiceType =
    input.service_type ||
    (input as any).service ||
    input.appointment_type ||
    (input as any).type ||
    (input as any).bookingFieldsResponses?.service_type ||
    (input as any).responses?.service_type;

  const service_type =
    typeof rawServiceType === "string" && rawServiceType.trim()
      ? rawServiceType.trim()
      : null;

  const rawIssueDescription =
    input.issue_description ||
    (input as any).description ||
    (input as any).problem_description ||
    (input as any).customer_issue ||
    (input as any).problem ||
    (input as any).bookingFieldsResponses?.issue_description ||
    (input as any).responses?.issue_description;

  const issue_description =
    typeof rawIssueDescription === "string" && rawIssueDescription.trim()
      ? rawIssueDescription.trim()
      : null;

  const appointment_type = service_type || "Service Request";
  const property_type = input.property_type || (input as any).property || "Property";
  const rawLocation =
    input.location ||
    input.service_address ||
    (input as any).address ||
    input.city ||
    (input as any).bookingFieldsResponses?.location?.optionValue ||
    (input as any).bookingFieldsResponses?.location?.address ||
    (input as any).responses?.location?.optionValue ||
    (input as any).responses?.location?.address;

  const location =
    typeof rawLocation === "string" && rawLocation.trim()
      ? rawLocation.trim()
      : typeof rawLocation === "object" && (rawLocation as any)?.optionValue
      ? String((rawLocation as any).optionValue).trim()
      : typeof rawLocation === "object" && (rawLocation as any)?.address
      ? String((rawLocation as any).address).trim()
      : null;

  let slot_date =
    input.slot_date ||
    (input as any).date ||
    (input as any).preferred_date ||
    (input as any).booking_date ||
    (input as any).appointment_date;

  let slot_time =
    input.slot_time ||
    (input as any).time ||
    (input as any).preferred_time ||
    (input as any).booking_time ||
    (input as any).appointment_time ||
    (input as any).start_time ||
    (input as any).startTime;

  // Handle combined datetime parameter if either date or time is missing
  const rawDateTime =
    (input as any).datetime ||
    (input as any).dateTime ||
    (input as any).start ||
    (input as any).slot;

  if (rawDateTime && typeof rawDateTime === "string") {
    const dtTrimmed = rawDateTime.trim();
    if (!slot_date && dtTrimmed.includes("T")) {
      slot_date = dtTrimmed.split("T")[0];
    } else if (!slot_date && dtTrimmed.includes(" ")) {
      slot_date = dtTrimmed.split(" ")[0];
    }
    if (!slot_time && dtTrimmed.includes("T")) {
      slot_time = dtTrimmed.split("T")[1];
    } else if (!slot_time && dtTrimmed.includes(" ")) {
      slot_time = dtTrimmed.substring(dtTrimmed.indexOf(" ") + 1);
    }
  }

  const explicitTimezone = input.timezone;

  // Validation
  if (!name?.trim()) {
    return { status: "error", statusCode: 400, booking_status: "failed", message: "Caller name is required for booking." };
  }
  if (!phone_number?.trim()) {
    return { status: "error", statusCode: 400, booking_status: "failed", message: "Phone number is required for booking." };
  }
  if (!service_type) {
    return {
      status: "error",
      statusCode: 400,
      booking_status: "failed",
      message: "Service type is required for booking (e.g. AC Repair or Plumbing).",
    };
  }
  if (!issue_description) {
    return {
      status: "error",
      statusCode: 400,
      booking_status: "failed",
      message: "Issue description is required for booking (e.g. AC is not cooling or leaking pipe).",
    };
  }
  if (!location) {
    return {
      status: "error",
      statusCode: 400,
      booking_status: "failed",
      message: "Location/address is required for booking (e.g. Hyderabad or 123 Main St).",
    };
  }
  if (!slot_date?.trim()) {
    return { status: "error", statusCode: 400, booking_status: "failed", message: "Appointment slot date is required (DD-MM-YYYY)." };
  }
  if (!slot_time?.trim()) {
    return { status: "error", statusCode: 400, booking_status: "failed", message: "Appointment slot time is required (e.g. 10:00 AM)." };
  }

  const sanitizedEmail = email?.trim() ? email.trim().slice(0, 150) : null;
  if (sanitizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitizedEmail)) {
    return { status: "error", statusCode: 400, booking_status: "failed", message: "The provided email address is invalid." };
  }

  const now = options.now ?? new Date();
  const parsedDate = parseDateString(slot_date, now);
  if (!parsedDate) {
    return {
      status: "error",
      statusCode: 400,
      booking_status: "failed",
      message: `Invalid slot_date: '${slot_date}'. Expected format is DD-MM-YYYY.`,
    };
  }

  const parsedTime = parseTimeString(slot_time);
  if (!parsedTime) {
    return {
      status: "error",
      statusCode: 400,
      booking_status: "failed",
      message: `Invalid slot_time: '${slot_time}'. Expected format like 10:00 AM or 04:00 PM.`,
    };
  }

  const timezone = resolveLocationTimezone(location, explicitTimezone);
  const startsAt = createDateInTimezone(
    parsedDate.year,
    parsedDate.month,
    parsedDate.day,
    parsedTime.hours,
    parsedTime.minutes,
    timezone,
  );
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000); // 60 minutes

  if (startsAt.getTime() < now.getTime()) {
    return {
      status: "unavailable",
      statusCode: 409,
      booking_status: "failed",
      message: `Cannot book a slot in the past (${slot_date} ${slot_time}). Please choose a future slot.`,
    };
  }

  const env = options.environment ?? options.env ?? process.env;
  const calcomApiKey = env.CALCOM_API_KEY?.trim();
  const calcomEventTypeId = env.CALCOM_EVENT_TYPE_ID?.trim();

  // Validate Cal.com runtime configuration
  if (!calcomApiKey || calcomApiKey === "replace-with-cal-com-api-key" || calcomApiKey.includes("replace-")) {
    return {
      status: "error",
      statusCode: 500,
      booking_status: "failed",
      message: "Scheduling provider is not configured. Missing or invalid CALCOM_API_KEY.",
    };
  }

  if (!calcomEventTypeId) {
    return {
      status: "error",
      statusCode: 500,
      booking_status: "failed",
      message: "Scheduling provider is not configured. Missing CALCOM_EVENT_TYPE_ID.",
    };
  }

  const numericEventTypeId = parseInt(calcomEventTypeId, 10);
  if (isNaN(numericEventTypeId) || numericEventTypeId <= 0) {
    return {
      status: "error",
      statusCode: 500,
      booking_status: "failed",
      message: `Invalid CALCOM_EVENT_TYPE_ID: '${calcomEventTypeId}' is not a valid numeric event type ID.`,
    };
  }

  // Resolve organization and check local DB for duplicate/conflict before calling Cal.com
  const db = options.db ?? defaultPrisma;
  let organizationId: string | null = options.organizationId ?? null;
  let resolvedAgentId: string | null = null;
  const retellAgentId = input.agent_id || input.call?.agent_id;

  if (retellAgentId && db?.providerLink?.findFirst) {
    try {
      const link = await db.providerLink.findFirst({
        where: { provider: "retell", providerId: retellAgentId },
        include: { agent: true },
      });
      if (link?.agent?.organizationId) {
        organizationId = link.agent.organizationId;
        resolvedAgentId = link.agent.id;
      }
    } catch {}
  }

  if (!resolvedAgentId && retellAgentId && db?.agent?.findFirst) {
    try {
      const localAgent = await db.agent.findFirst({
        where: { id: retellAgentId },
        select: { id: true, organizationId: true },
      });
      if (localAgent) {
        resolvedAgentId = localAgent.id;
        if (!organizationId) {
          organizationId = localAgent.organizationId;
        }
      }
    } catch {}
  }

  if (!organizationId && db?.organization?.findFirst) {
    try {
      const defaultOrg = await db.organization.findFirst({
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      organizationId = defaultOrg?.id ?? null;
    } catch {}
  }

  if (organizationId && db?.appointment?.findFirst) {
    try {
      const existingAppt = await db.appointment.findFirst({
        where: {
          organizationId,
          status: { in: ["confirmed", "pending"] },
          startsAt,
        },
      });
      if (existingAppt) {
        return {
          status: "unavailable",
          statusCode: 409,
          booking_status: "failed",
          message: `The slot at ${slot_time} on ${slot_date} is already booked. Please choose another time.`,
        };
      }
    } catch {}
  }

  // Call Cal.com booking API v2
  const fetcher = options.calcomFetcher ?? options.fetchFn ?? fetch;
  let calcomBookingUid: string | null = null;
  let meetingUrl = "";

  const cleanedDigits = phone_number.replace(/\D/g, "");
  const attendeeEmail = email?.trim() || `${cleanedDigits || "caller"}@customer.bolna.ai`;

  // Preserve existing custom booking field responses and ensure required service_type is populated
  const existingResponses =
    ((input as any).bookingFieldsResponses && typeof (input as any).bookingFieldsResponses === "object"
      ? (input as any).bookingFieldsResponses
      : (input as any).responses && typeof (input as any).responses === "object"
      ? (input as any).responses
      : {}) || {};

  const bookingFieldsResponses: Record<string, any> = {
    ...existingResponses,
    service_type: existingResponses.service_type || service_type,
    issue_description: existingResponses.issue_description || issue_description,
  };

  const bookingBody: Record<string, any> = {
    eventTypeId: numericEventTypeId,
    start: startsAt.toISOString(),
    attendee: {
      name: name.trim(),
      email: attendeeEmail,
      timeZone: timezone,
      phoneNumber: phone_number.trim(),
      language: "en",
    },
    location: {
      type: "attendeeAddress",
      address: location,
    },
    bookingFieldsResponses,
    metadata: {
      phoneNumber: phone_number.trim(),
      location,
      propertyType: property_type?.trim() || "Property",
      appointmentType: appointment_type,
      serviceType: service_type,
      issueDescription: issue_description,
    },
  };

  try {
    const bookingApiVersion = env.CALCOM_BOOKING_API_VERSION?.trim() || "2024-08-13";
    let response = await fetcher("https://api.cal.com/v2/bookings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${calcomApiKey}`,
        "cal-api-version": bookingApiVersion,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bookingBody),
    });

    let errorDetail = "";
    if (!response.ok) {
      try {
        const errJson = await response.clone().json();
        if (typeof errJson?.message === "string") {
          errorDetail = errJson.message.slice(0, 200);
        } else if (typeof errJson?.error?.message === "string") {
          errorDetail = errJson.error.message.slice(0, 200);
        } else if (typeof errJson?.error === "string") {
          errorDetail = errJson.error.slice(0, 200);
        } else if (Array.isArray(errJson?.error?.details)) {
          errorDetail = JSON.stringify(errJson.error.details).slice(0, 200);
        }
      } catch {
        try {
          errorDetail = (await response.clone().text()).slice(0, 200);
        } catch {}
      }
    }

    if (response.status === 409) {
      console.warn(
        `[Cal.com Booking Diagnostic] upstream_status=409 eventTypeId=${numericEventTypeId} date=${slot_date} time=${slot_time} tz=${timezone} reason="slot_conflict"${errorDetail ? ` detail="${errorDetail}"` : ""}`
      );
      return {
        status: "unavailable",
        statusCode: 409,
        booking_status: "failed",
        message: "The requested time slot is unavailable or has already been booked on Cal.com. Please choose another slot.",
      };
    }

    if (response.status === 400) {
      const isSlotUnavailable = /slot.*(unavailable|no longer available|already booked|not available)|time.*unavailable/i.test(
        errorDetail
      );
      if (isSlotUnavailable) {
        console.warn(
          `[Cal.com Booking Diagnostic] upstream_status=400 eventTypeId=${numericEventTypeId} date=${slot_date} time=${slot_time} tz=${timezone} reason="slot_unavailable"${errorDetail ? ` detail="${errorDetail}"` : ""}`
        );
        return {
          status: "unavailable",
          statusCode: 409,
          booking_status: "failed",
          message: "The requested time slot is unavailable or has already been booked on Cal.com. Please choose another slot.",
        };
      }

      console.warn(
        `[Cal.com Booking Diagnostic] upstream_status=400 eventTypeId=${numericEventTypeId} date=${slot_date} time=${slot_time} tz=${timezone} reason="bad_request"${errorDetail ? ` detail="${errorDetail}"` : ""}`
      );
      return {
        status: "error",
        statusCode: 400,
        booking_status: "failed",
        message: `Booking request was rejected by Cal.com: ${errorDetail || "Invalid request payload"}.`,
      };
    }

    if (response.status === 401) {
      console.warn(
        `[Cal.com Booking Diagnostic] upstream_status=401 eventTypeId=${numericEventTypeId} date=${slot_date} time=${slot_time} tz=${timezone}`
      );
      return {
        status: "error",
        statusCode: 502,
        booking_status: "failed",
        message: "Cal.com authentication failed. Please check CALCOM_API_KEY.",
      };
    }

    if (response.status === 404) {
      let isExplicitEventTypeNotFound = false;
      if (
        (/event\s*type/i.test(errorDetail) || /not\s*found/i.test(errorDetail)) &&
        !/cannot\s*(get|post)/i.test(errorDetail) &&
        !/route/i.test(errorDetail)
      ) {
        isExplicitEventTypeNotFound = true;
      }
      console.warn(
        `[Cal.com Booking Diagnostic] upstream_status=404 eventTypeId=${numericEventTypeId} date=${slot_date} time=${slot_time} tz=${timezone}${errorDetail ? ` detail="${errorDetail}"` : ""}`
      );
      return {
        status: "error",
        statusCode: 502,
        booking_status: "failed",
        message: isExplicitEventTypeNotFound
          ? `Cal.com event type '${numericEventTypeId}' was not found. Please check CALCOM_EVENT_TYPE_ID.`
          : `Booking provider endpoint returned 404 Not Found.${errorDetail ? ` ${errorDetail.slice(0, 120)}` : ""}`,
      };
    }

    if (response.status === 429) {
      console.warn(
        `[Cal.com Booking Diagnostic] upstream_status=429 eventTypeId=${numericEventTypeId} date=${slot_date} time=${slot_time} tz=${timezone}`
      );
      return {
        status: "error",
        statusCode: 429,
        booking_status: "failed",
        message: "Cal.com rate limit reached. Please try again shortly.",
      };
    }

    if (!response.ok) {
      console.warn(
        `[Cal.com Booking Diagnostic] upstream_status=${response.status} eventTypeId=${numericEventTypeId} date=${slot_date} time=${slot_time} tz=${timezone}${errorDetail ? ` detail="${errorDetail}"` : ""}`
      );
      return {
        status: "error",
        statusCode: 502,
        booking_status: "failed",
        message: `Booking provider returned an error (HTTP ${response.status}).${errorDetail ? ` ${errorDetail.slice(0, 120)}` : ""}`,
      };
    }

    const calcomData = await response.json();
    calcomBookingUid =
      calcomData?.data?.uid ||
      calcomData?.data?.id ||
      calcomData?.booking?.uid ||
      calcomData?.booking?.id ||
      calcomData?.uid ||
      calcomData?.id ||
      null;

    meetingUrl =
      calcomData?.data?.meetingUrl ||
      calcomData?.data?.location ||
      calcomData?.booking?.location ||
      "";

    if (!calcomBookingUid) {
      return {
        status: "error",
        statusCode: 502,
        booking_status: "failed",
        message: "Cal.com response was missing a valid booking confirmation identifier.",
      };
    }
  } catch (err: any) {
    console.error(
      `[Cal.com Booking Error] eventTypeId=${numericEventTypeId} date=${slot_date} time=${slot_time} tz=${timezone} error="${err?.message || "Unknown error"}"`
    );
    if (err?.name === "AbortError" || /timeout/i.test(err?.message)) {
      return {
        status: "error",
        statusCode: 504,
        booking_status: "failed",
        message: "Scheduling provider request timed out.",
      };
    }
    return {
      status: "error",
      statusCode: 502,
      booking_status: "failed",
      message: `Booking provider error: ${err?.message || "Failed to connect to Cal.com"}.`,
    };
  }

  // Persist confirmed Cal.com booking to database
  let bookingId = String(calcomBookingUid);
  const endFormatted = formatTimeSlot((parsedTime.hours + 1) % 24, parsedTime.minutes);
  const title = `${name.trim()} - ${appointment_type || "Property Viewing"} (${property_type || "Property"}) in ${location || "Hyderabad"}`;

  let dbWarning: string | undefined;
  try {
    if (db?.$transaction) {
      await db.$transaction(async (tx: any) => {
        if (!organizationId) {
          const defaultOrg = await tx.organization.findFirst({
            orderBy: { createdAt: "asc" },
            select: { id: true },
          });
          organizationId = defaultOrg?.id ?? null;
        }

        if (!organizationId) {
          throw new Error("No organization found to assign appointment.");
        }

        // Find or create Contact
        const rawPhone = phone_number.trim();
        let contact = await tx.contact.findFirst({
          where: {
            organizationId,
            OR: [
              { phone: rawPhone },
              ...(email?.trim() ? [{ email: email.trim() }] : []),
            ],
          },
        });

        if (contact) {
          contact = await tx.contact.update({
            where: { id: contact.id },
            data: {
              lastContactAt: now,
              ...(email?.trim() && !contact.email ? { email: email.trim() } : {}),
            },
          });
        } else {
          const nameParts = name.trim().split(" ");
          const firstName = nameParts[0] || "Customer";
          const lastName = nameParts.slice(1).join(" ") || null;
          contact = await tx.contact.create({
            data: {
              organizationId,
              firstName,
              lastName,
              phone: rawPhone,
              email: email?.trim() || null,
              source: "Voice Agent Booking",
              status: "qualified",
              lastContactAt: now,
            },
          });
        }

        // Create Appointment record
        const appt = await tx.appointment.create({
          data: {
            organizationId,
            contactId: contact.id,
            agentId: resolvedAgentId ?? null,
            status: "confirmed",
            startsAt,
            endsAt,
            timezone,
            serviceName: title,
            provider: "calcom",
            calcomEventId: String(calcomBookingUid),
            metadata: {
              customerName: name.trim(),
              phoneNumber: rawPhone,
              email: email?.trim() || null,
              appointmentType: appointment_type,
              serviceType: service_type,
              issueDescription: issue_description,
              propertyType: property_type,
              location,
              slotDate: slot_date,
              slotTime: slot_time,
              calcomBookingUid: String(calcomBookingUid),
              bookingUid: String(calcomBookingUid),
              callId: input.call?.call_id || null,
              retellAgentId: retellAgentId || null,
            },
          },
        });

        bookingId = appt.id;

        // Link with originating call if call_id is supplied
        const originatingCallId = input.call?.call_id;
        if (originatingCallId && tx.call?.findFirst && tx.callEvent?.create) {
          try {
            const matchedCall = await tx.call.findFirst({
              where: { externalCallId: originatingCallId, organizationId },
            });
            if (matchedCall) {
              await tx.callEvent.create({
                data: {
                  callId: matchedCall.id,
                  eventType: "appointment_booked",
                  source: "retell_custom_tool",
                  payload: {
                    appointmentId: appt.id,
                    calcomBookingUid: String(calcomBookingUid),
                    customerName: name.trim(),
                    phoneNumber: rawPhone,
                    startsAt: startsAt.toISOString(),
                    title,
                  },
                },
              });
            }
          } catch {}
        }

        await tx.auditLog.create({
          data: {
            organizationId,
            entity: "appointment",
            action: "create_booking",
            details: {
              appointmentId: appt.id,
              calcomBookingUid: String(calcomBookingUid),
              customerName: name.trim(),
              phoneNumber: rawPhone,
              startsAt: startsAt.toISOString(),
              serviceName: title,
              callId: originatingCallId || null,
            },
          },
        });
      });
    }
  } catch (dbError: any) {
    console.error("Database persistence error after Cal.com confirmed booking:", dbError?.message);
    dbWarning = "Appointment confirmed on calendar, but encountered a database recording issue.";
  }

  return {
    status: "confirmed",
    statusCode: 200,
    booking_status: "confirmed",
    booking_id: bookingId,
    booking_uid: String(calcomBookingUid),
    booking_reference: String(calcomBookingUid),
    ...(dbWarning ? { warning: dbWarning } : {}),
    start_time: slot_time.trim(),
    end_time: endFormatted,
    duration_minutes: 60,
    title,
    location: location?.trim() || "Hyderabad",
    meeting_url: meetingUrl,
    message: `Your ${appointment_type || "viewing"} has been successfully booked for ${slot_date.trim()} at ${slot_time.trim()} in ${location?.trim() || "Hyderabad"}.`,
  };
}

export function phoneNumbersMatch(p1?: string | null, p2?: string | null): boolean {
  if (!p1 || !p2) return false;
  const s1 = String(p1).trim();
  const s2 = String(p2).trim();
  if (!s1 || !s2) return false;
  if (s1 === s2) return true;
  const d1 = s1.replace(/\D/g, "");
  const d2 = s2.replace(/\D/g, "");
  if (!d1 || !d2) return false;
  if (d1 === d2) return true;
  if (d1.length >= 10 && d2.length >= 10) {
    return d1.slice(-10) === d2.slice(-10);
  }
  if (d1.length >= 7 && d2.length >= 7) {
    return d1.endsWith(d2) || d2.endsWith(d1);
  }
  return false;
}

export async function rescheduleAppointment(
  rawInput: RescheduleAppointmentInput,
  options: BookingServiceOptions = {},
): Promise<RescheduleAppointmentResult> {
  const input = (rawInput && typeof rawInput === "object" ? rawInput : {}) as RescheduleAppointmentInput;

  const rawBookingUid =
    input.booking_uid ||
    input.booking_reference ||
    input.calcom_event_id ||
    input.calcomEventId ||
    input.booking_id ||
    null;

  const rawPhone =
    input.phone_number ||
    input.phoneNumber ||
    input.phone ||
    input.caller_number ||
    input.call?.from_number ||
    input.call?.customer_number ||
    null;

  const slot_date =
    input.slot_date ||
    input.new_date ||
    input.date ||
    input.preferred_date ||
    null;

  const slot_time =
    input.slot_time ||
    input.new_time ||
    input.time ||
    input.preferred_time ||
    null;

  const reschedulingReason =
    input.rescheduling_reason?.trim() ||
    input.reason?.trim() ||
    "Rescheduled via Boomi Solutions AI Voice Assistant";

  if (!slot_date?.trim()) {
    return {
      status: "error",
      statusCode: 400,
      booking_status: "failed",
      message: "New appointment slot date is required (DD-MM-YYYY).",
    };
  }
  if (!slot_time?.trim()) {
    return {
      status: "error",
      statusCode: 400,
      booking_status: "failed",
      message: "New appointment slot time is required (e.g. 10:00 AM).",
    };
  }

  const now = options.now ?? new Date();
  const parsedDate = parseDateString(slot_date, now);
  if (!parsedDate) {
    return {
      status: "error",
      statusCode: 400,
      booking_status: "failed",
      message: `Invalid slot_date: '${slot_date}'. Expected format is DD-MM-YYYY.`,
    };
  }

  const parsedTime = parseTimeString(slot_time);
  if (!parsedTime) {
    return {
      status: "error",
      statusCode: 400,
      booking_status: "failed",
      message: `Invalid slot_time: '${slot_time}'. Expected format like 10:00 AM or 04:00 PM.`,
    };
  }

  const db = options.db ?? defaultPrisma;
  let organizationId: string | null = options.organizationId ?? null;
  const retellAgentId = input.agent_id || input.call?.agent_id;

  if (!organizationId && retellAgentId && db?.providerLink?.findFirst) {
    try {
      const link = await db.providerLink.findFirst({
        where: { provider: "retell", providerId: retellAgentId },
        include: { agent: true },
      });
      if (link?.agent?.organizationId) {
        organizationId = link.agent.organizationId;
      }
    } catch {}
  }

  if (!organizationId && db?.organization?.findFirst) {
    try {
      const defaultOrg = await db.organization.findFirst({
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      organizationId = defaultOrg?.id ?? null;
    } catch {}
  }

  if (!organizationId) {
    return {
      status: "error",
      statusCode: 500,
      booking_status: "failed",
      message: "Organization context is missing for appointment rescheduling.",
    };
  }

  // Find the appointment to reschedule
  let existingAppt: any = null;

  if (rawBookingUid?.trim()) {
    const trimmedUid = rawBookingUid.trim();
    if (db?.appointment?.findFirst) {
      existingAppt = await db.appointment.findFirst({
        where: {
          organizationId,
          OR: [
            { calcomEventId: trimmedUid },
            { id: trimmedUid },
            ...(input.appointment_id ? [{ id: input.appointment_id }] : []),
          ],
        },
        include: { contact: true },
      });

      if (!existingAppt) {
        // Tenant isolation: Check if it belongs to another organization
        const crossOrgAppt = await db.appointment.findFirst({
          where: {
            OR: [
              { calcomEventId: trimmedUid },
              { id: trimmedUid },
              ...(input.appointment_id ? [{ id: input.appointment_id }] : []),
            ],
          },
        });
        if (crossOrgAppt && crossOrgAppt.organizationId !== organizationId) {
          return {
            status: "error",
            statusCode: 403,
            booking_status: "failed",
            message: "Forbidden: You do not have permission to reschedule appointments from another organization.",
          };
        }

        return {
          status: "error",
          statusCode: 404,
          booking_status: "failed",
          message: `Appointment with reference '${trimmedUid}' was not found.`,
        };
      }

      // If caller phone is also provided, verify ownership
      if (existingAppt && rawPhone?.trim()) {
        const contactPhone = existingAppt.contact?.phone;
        const metaPhone =
          typeof existingAppt.metadata === "object" && existingAppt.metadata
            ? (existingAppt.metadata.phoneNumber || existingAppt.metadata.phone)
            : null;
        if (
          (contactPhone || metaPhone) &&
          !phoneNumbersMatch(contactPhone, rawPhone) &&
          !phoneNumbersMatch(metaPhone, rawPhone)
        ) {
          return {
            status: "error",
            statusCode: 403,
            booking_status: "failed",
            message: "Forbidden: The specified appointment does not belong to the caller's phone number.",
          };
        }
      }
    }
  } else if (rawPhone?.trim()) {
    // Option A: Caller identification via authenticated caller's phone number
    const rawClean = rawPhone.trim();

    let upcomingAppts: any[] = [];
    if (db?.appointment?.findMany) {
      upcomingAppts = await db.appointment.findMany({
        where: {
          organizationId,
          status: { in: ["confirmed", "pending"] },
          startsAt: { gte: now },
        },
        include: { contact: true },
        orderBy: { startsAt: "asc" },
      });
    }

    // Match appointments for this phone number within the authenticated organization
    const matchingAppts = upcomingAppts.filter((a: any) => {
      const contactPhone = a.contact?.phone;
      const metaPhone =
        typeof a.metadata === "object" && a.metadata
          ? (a.metadata.phoneNumber || a.metadata.phone || a.metadata.phone_number || a.metadata.callerPhone)
          : null;

      return phoneNumbersMatch(contactPhone, rawClean) || phoneNumbersMatch(metaPhone, rawClean);
    });

    if (matchingAppts.length === 0) {
      return {
        status: "error",
        statusCode: 404,
        booking_status: "failed",
        message: `No upcoming appointments found for phone number '${rawClean}'. Please provide your booking reference.`,
      };
    }

    if (matchingAppts.length > 1) {
      // Multiple appointments exist: do not guess; ask customer to clarify
      const appointmentListStr = matchingAppts
        .map((a: any) => {
          const startD = a.startsAt instanceof Date ? a.startsAt : new Date(a.startsAt);
          let validTz = "Asia/Kolkata";
          if (a.timezone?.trim()) {
            try {
              Intl.DateTimeFormat(undefined, { timeZone: a.timezone.trim() });
              validTz = a.timezone.trim();
            } catch {}
          }
          const dateStr = startD.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            timeZone: validTz,
          });
          const timeStr = startD.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
            timeZone: validTz,
          });
          return `${a.serviceName || "Appointment"} on ${dateStr} at ${timeStr} (Ref: ${a.calcomEventId || a.id})`;
        })
        .join("; ");

      return {
        status: "error",
        statusCode: 400,
        booking_status: "failed",
        message: `You have multiple upcoming appointments: ${appointmentListStr}. Please clarify which appointment you would like to reschedule by providing the booking reference or date.`,
      };
    }

    existingAppt = matchingAppts[0];
  } else {
    return {
      status: "error",
      statusCode: 400,
      booking_status: "failed",
      message: "Please provide either a booking reference (calcomEventId) or your phone number to identify the appointment.",
    };
  }

  if (!existingAppt) {
    return {
      status: "error",
      statusCode: 404,
      booking_status: "failed",
      message: "No appointment found to reschedule.",
    };
  }

  // Ensure appointment is reschedulable
  if (existingAppt.status === "cancelled" || existingAppt.status === "canceled") {
    return {
      status: "error",
      statusCode: 400,
      booking_status: "failed",
      message: "Cannot reschedule a cancelled appointment. Please book a new appointment instead.",
    };
  }

  if (!existingAppt.calcomEventId) {
    return {
      status: "error",
      statusCode: 400,
      booking_status: "failed",
      message: "Appointment record is missing a Cal.com booking reference.",
    };
  }

  // Determine timezone, start time, end time, and duration
  const timezone = input.timezone?.trim() || existingAppt.timezone || "Asia/Kolkata";
  const startsAt = createDateInTimezone(
    parsedDate.year,
    parsedDate.month,
    parsedDate.day,
    parsedTime.hours,
    parsedTime.minutes,
    timezone,
  );

  const apptStart = existingAppt.startsAt instanceof Date ? existingAppt.startsAt : new Date(existingAppt.startsAt);
  const apptEnd = existingAppt.endsAt instanceof Date ? existingAppt.endsAt : (existingAppt.endsAt ? new Date(existingAppt.endsAt) : null);
  const durationMs =
    apptEnd && apptEnd.getTime() > apptStart.getTime()
      ? apptEnd.getTime() - apptStart.getTime()
      : 60 * 60 * 1000;
  const endsAt = new Date(startsAt.getTime() + durationMs);
  const durationMinutes = Math.max(1, Math.round(durationMs / (60 * 1000)));

  if (startsAt.getTime() < now.getTime()) {
    return {
      status: "unavailable",
      statusCode: 409,
      booking_status: "failed",
      message: `Cannot reschedule to a slot in the past (${slot_date} ${slot_time}). Please choose a future slot.`,
    };
  }

  // Range overlap conflict check in local database (excluding the appointment being rescheduled)
  if (db?.appointment?.findFirst) {
    try {
      const conflictingAppt = await db.appointment.findFirst({
        where: {
          organizationId,
          status: { in: ["confirmed", "pending"] },
          id: { not: existingAppt.id },
          OR: [
            {
              startsAt: { lt: endsAt },
              endsAt: { gt: startsAt },
            },
            {
              endsAt: null,
              startsAt: {
                lt: endsAt,
                gt: new Date(startsAt.getTime() - 60 * 60 * 1000),
              },
            },
          ],
        },
      });
      if (conflictingAppt) {
        return {
          status: "unavailable",
          statusCode: 409,
          booking_status: "failed",
          message: `The requested time range (${slot_date} ${slot_time}) overlaps with an existing appointment. Please choose another time.`,
        };
      }
    } catch {}
  }

  // Validate Cal.com runtime configuration
  const env = options.environment ?? options.env ?? process.env;
  const calcomApiKey = env.CALCOM_API_KEY?.trim();

  if (!calcomApiKey || calcomApiKey === "replace-with-cal-com-api-key" || calcomApiKey.includes("replace-")) {
    return {
      status: "error",
      statusCode: 500,
      booking_status: "failed",
      message: "Scheduling provider is not configured. Missing or invalid CALCOM_API_KEY.",
    };
  }

  // Call Cal.com API v2 Reschedule endpoint
  const fetcher = options.calcomFetcher ?? options.fetchFn ?? fetch;
  const bookingApiVersion = env.CALCOM_BOOKING_API_VERSION?.trim() || "2024-08-13";
  const calcomBookingUid = existingAppt.calcomEventId.trim();
  const rescheduleUrl = `https://api.cal.com/v2/bookings/${encodeURIComponent(calcomBookingUid)}/reschedule`;

  const rescheduleBody = {
    start: startsAt.toISOString(),
    reschedulingReason,
  };

  let newBookingUid = calcomBookingUid;
  let meetingUrl = "";

  try {
    const response = await fetcher(rescheduleUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${calcomApiKey}`,
        "cal-api-version": bookingApiVersion,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(rescheduleBody),
    });

    let errorDetail = "";
    if (!response.ok) {
      try {
        const errJson = await response.clone().json();
        if (typeof errJson?.message === "string") {
          errorDetail = errJson.message.slice(0, 200);
        } else if (typeof errJson?.error?.message === "string") {
          errorDetail = errJson.error.message.slice(0, 200);
        } else if (typeof errJson?.error === "string") {
          errorDetail = errJson.error.slice(0, 200);
        } else if (Array.isArray(errJson?.error?.details)) {
          errorDetail = JSON.stringify(errJson.error.details).slice(0, 200);
        }
      } catch {
        try {
          errorDetail = (await response.clone().text()).slice(0, 200);
        } catch {}
      }
    }

    if (response.status === 409) {
      console.warn(
        `[Cal.com Reschedule Diagnostic] upstream_status=409 bookingUid=${calcomBookingUid} date=${slot_date} time=${slot_time} reason="slot_conflict"${errorDetail ? ` detail="${errorDetail}"` : ""}`
      );
      return {
        status: "unavailable",
        statusCode: 409,
        booking_status: "failed",
        message: "The requested time slot is unavailable or has already been booked on Cal.com. Please choose another slot.",
      };
    }

    if (response.status === 400) {
      const isSlotUnavailable = /slot.*(unavailable|no longer available|already booked|not available)|time.*unavailable/i.test(
        errorDetail
      );
      if (isSlotUnavailable) {
        console.warn(
          `[Cal.com Reschedule Diagnostic] upstream_status=400 bookingUid=${calcomBookingUid} date=${slot_date} time=${slot_time} reason="slot_unavailable"${errorDetail ? ` detail="${errorDetail}"` : ""}`
        );
        return {
          status: "unavailable",
          statusCode: 409,
          booking_status: "failed",
          message: "The requested time slot is unavailable or has already been booked on Cal.com. Please choose another slot.",
        };
      }

      console.warn(
        `[Cal.com Reschedule Diagnostic] upstream_status=400 bookingUid=${calcomBookingUid} date=${slot_date} time=${slot_time} reason="bad_request"${errorDetail ? ` detail="${errorDetail}"` : ""}`
      );
      return {
        status: "error",
        statusCode: 400,
        booking_status: "failed",
        message: `Reschedule request was rejected by Cal.com: ${errorDetail || "Invalid request"}.`,
      };
    }

    if (response.status === 401) {
      return {
        status: "error",
        statusCode: 502,
        booking_status: "failed",
        message: "Cal.com authentication failed. Please check CALCOM_API_KEY.",
      };
    }

    if (response.status === 404) {
      return {
        status: "error",
        statusCode: 404,
        booking_status: "failed",
        message: `Booking '${calcomBookingUid}' was not found on Cal.com.`,
      };
    }

    if (response.status === 429) {
      return {
        status: "error",
        statusCode: 429,
        booking_status: "failed",
        message: "Cal.com rate limit reached. Please try again shortly.",
      };
    }

    if (!response.ok) {
      return {
        status: "error",
        statusCode: 502,
        booking_status: "failed",
        message: `Booking provider returned an error (HTTP ${response.status}).${errorDetail ? ` ${errorDetail.slice(0, 120)}` : ""}`,
      };
    }

    const calcomData = await response.json();
    if (calcomData?.status === "error") {
      return {
        status: "error",
        statusCode: 400,
        booking_status: "failed",
        message: calcomData?.message || calcomData?.error || "Reschedule request was rejected by Cal.com.",
      };
    }

    // Cal.com may issue a new booking UID on reschedule. Capture it!
    const returnedUid =
      calcomData?.data?.uid ||
      calcomData?.data?.booking?.uid ||
      calcomData?.booking?.uid ||
      calcomData?.data?.id ||
      calcomData?.data?.booking?.id ||
      calcomData?.booking?.id ||
      calcomData?.uid ||
      calcomData?.id ||
      (Array.isArray(calcomData?.data) ? calcomData.data[0]?.uid || calcomData.data[0]?.id : null);

    if (returnedUid) {
      newBookingUid = String(returnedUid);
    }

    meetingUrl =
      calcomData?.data?.meetingUrl ||
      calcomData?.data?.booking?.meetingUrl ||
      calcomData?.booking?.meetingUrl ||
      calcomData?.data?.location ||
      calcomData?.booking?.location ||
      "";
  } catch (err: any) {
    console.error(`[Cal.com Reschedule Error] bookingUid=${calcomBookingUid} error="${err?.message || "Unknown error"}"`);
    if (err?.name === "AbortError" || /timeout/i.test(err?.message)) {
      return {
        status: "error",
        statusCode: 504,
        booking_status: "failed",
        message: "Scheduling provider request timed out.",
      };
    }
    return {
      status: "error",
      statusCode: 502,
      booking_status: "failed",
      message: `Booking provider error: ${err?.message || "Failed to connect to Cal.com"}.`,
    };
  }

  // Update existing local Appointment record in PostgreSQL
  const previousMetadata =
    (typeof existingAppt.metadata === "object" && existingAppt.metadata
      ? existingAppt.metadata
      : {}) as Record<string, any>;
  const originatingCallId = input.call?.call_id || null;

  const updatedMetadata: Record<string, any> = {
    ...previousMetadata,
    calcomBookingUid: String(newBookingUid),
    bookingUid: String(newBookingUid),
    calcomEventId: String(newBookingUid),
    slotDate: slot_date,
    slotTime: slot_time,
    rescheduledAt: now.toISOString(),
    previousStartsAt: apptStart.toISOString(),
    reschedulingReason,
    ...(originatingCallId ? { lastRescheduledCallId: originatingCallId } : {}),
  };

  try {
    if (db?.$transaction) {
      await db.$transaction(async (tx: any) => {
        await tx.appointment.update({
          where: { id: existingAppt.id },
          data: {
            calcomEventId: String(newBookingUid),
            startsAt,
            endsAt,
            timezone,
            status: "confirmed",
            metadata: updatedMetadata,
          },
        });

        if (tx.auditLog?.create) {
          await tx.auditLog.create({
            data: {
              organizationId,
              entity: "appointment",
              action: "reschedule",
              details: {
                appointmentId: existingAppt.id,
                calcomBookingUid: String(newBookingUid),
                previousCalcomBookingUid: calcomBookingUid,
                previousStartsAt: apptStart.toISOString(),
                newStartsAt: startsAt.toISOString(),
                reschedulingReason,
              },
            },
          });
        }

        if (originatingCallId && tx.call?.findFirst && tx.callEvent?.create) {
          try {
            const matchedCall = await tx.call.findFirst({
              where: { externalCallId: originatingCallId, organizationId },
            });
            if (matchedCall) {
              await tx.callEvent.create({
                data: {
                  callId: matchedCall.id,
                  eventType: "appointment_rescheduled",
                  source: "retell_custom_tool",
                  payload: {
                    appointmentId: existingAppt.id,
                    calcomBookingUid: String(newBookingUid),
                    startsAt: startsAt.toISOString(),
                    endsAt: endsAt.toISOString(),
                    reschedulingReason,
                  },
                },
              });
            }
          } catch {}
        }
      });
    } else if (db?.appointment?.update) {
      await db.appointment.update({
        where: { id: existingAppt.id },
        data: {
          calcomEventId: String(newBookingUid),
          startsAt,
          endsAt,
          timezone,
          status: "confirmed",
          metadata: updatedMetadata,
        },
      });
    }
  } catch (dbError: any) {
    console.error("Database error in rescheduleAppointment:", dbError?.message);
    return {
      status: "error",
      statusCode: 500,
      booking_status: "failed",
      message: "Appointment was rescheduled with Cal.com, but failed to update local records.",
    };
  }

  const location =
    (typeof existingAppt.metadata === "object" && existingAppt.metadata
      ? existingAppt.metadata.location || existingAppt.metadata.propertyType
      : null) || "Customer Location";

  const endFormatted = formatTimeSlot(
    (parsedTime.hours + Math.floor(durationMinutes / 60)) % 24,
    (parsedTime.minutes + (durationMinutes % 60)) % 60,
  );

  return {
    status: "confirmed",
    statusCode: 200,
    booking_status: "confirmed",
    booking_id: existingAppt.id,
    booking_uid: String(newBookingUid),
    booking_reference: String(newBookingUid),
    start_time: slot_time.trim(),
    end_time: endFormatted,
    duration_minutes: durationMinutes,
    title: existingAppt.serviceName || "Appointment",
    location: String(location),
    meeting_url: meetingUrl,
    message: `Appointment has been successfully rescheduled to ${slot_date.trim()} at ${slot_time.trim()}.`,
  };
}

export async function takeMessage(
  input: TakeMessageInput,
  options: BookingServiceOptions = {},
): Promise<TakeMessageResult> {
  const name = input.name || (input as any).caller_name || (input as any).customer_name;
  const phone_number = input.phone_number || (input as any).phone || (input as any).caller_phone;
  const email = input.email;
  const message = input.message || (input as any).caller_message || (input as any).notes;

  if (!name?.trim() || !phone_number?.trim() || !message?.trim()) {
    return {
      success: false,
      statusCode: 400,
      message: "Name, phone number, and message are required.",
    };
  }

  const db = options.db ?? defaultPrisma;
  const now = options.now ?? new Date();

  try {
    if (db?.$transaction) {
      await db.$transaction(async (tx: any) => {
        let organizationId: string | null = options.organizationId ?? null;
        const retellAgentId = input.agent_id || input.call?.agent_id;

        if (!organizationId && retellAgentId) {
          const providerLink = await tx.providerLink.findFirst({
            where: { provider: "retell", providerId: retellAgentId },
            include: { agent: true },
          });
          if (providerLink?.agent?.organizationId) {
            organizationId = providerLink.agent.organizationId;
          }
        }

        if (!organizationId) {
          const defaultOrg = await tx.organization.findFirst({
            orderBy: { createdAt: "asc" },
            select: { id: true },
          });
          organizationId = defaultOrg?.id ?? null;
        }

        if (!organizationId) return;

        const rawPhone = phone_number.trim();
        const trimmedMsg = message.trim();

        // Avoid duplicate records on rapid retries within 60 seconds
        if (tx.auditLog?.findFirst) {
          try {
            const recentAudit = await tx.auditLog.findFirst({
              where: {
                organizationId,
                entity: "caller_message",
                createdAt: { gte: new Date(now.getTime() - 60_000) },
              },
              orderBy: { createdAt: "desc" },
            });
            if (
              recentAudit?.details &&
              (recentAudit.details as any).phoneNumber === rawPhone &&
              (recentAudit.details as any).message === trimmedMsg
            ) {
              return;
            }
          } catch {}
        }

        // Check if message is a Do-Not-Call (DNC) request
        const lowerMsg = trimmedMsg.toLowerCase();
        const isDnc =
          lowerMsg.includes("stop calling") ||
          lowerMsg.includes("do not call") ||
          lowerMsg.includes("don't call") ||
          lowerMsg.includes("remove my number") ||
          lowerMsg.includes("remove me");

        let contact = await tx.contact.findFirst({
          where: {
            organizationId,
            OR: [
              { phone: rawPhone },
              ...(email?.trim() ? [{ email: email.trim() }] : []),
            ],
          },
        });

        if (contact) {
          contact = await tx.contact.update({
            where: { id: contact.id },
            data: {
              lastContactAt: now,
              ...(isDnc ? { doNotCall: true, doNotCallAt: now } : {}),
            },
          });
        } else {
          const nameParts = name.trim().split(" ");
          const firstName = nameParts[0] || "Caller";
          const lastName = nameParts.slice(1).join(" ") || null;
          contact = await tx.contact.create({
            data: {
              organizationId,
              firstName,
              lastName,
              phone: rawPhone,
              email: email?.trim() || null,
              source: "Caller Message",
              status: isDnc ? "inactive" : "new",
              doNotCall: isDnc,
              doNotCallAt: isDnc ? now : null,
              lastContactAt: now,
            },
          });
        }

        // Record message in audit log
        const callId = input.call?.call_id;
        await tx.auditLog.create({
          data: {
            organizationId,
            entity: "caller_message",
            action: isDnc ? "record_dnc_message" : "record_message",
            details: {
              callerName: name.trim(),
              phoneNumber: rawPhone,
              email: email?.trim() || null,
              message: trimmedMsg,
              reason: input.reason?.trim() || null,
              isDnc,
              status: "pending",
              contactId: contact?.id || null,
              callId: callId || null,
              recordedAt: now.toISOString(),
            },
          },
        });

        // Link with call record if call_id is supplied
        if (callId && tx.call?.findFirst && tx.callEvent?.create) {
          try {
            const matchedCall = await tx.call.findFirst({
              where: { externalCallId: callId, organizationId },
            });
            if (matchedCall) {
              await tx.callEvent.create({
                data: {
                  callId: matchedCall.id,
                  eventType: "caller_message",
                  source: "retell_custom_tool",
                  payload: {
                    name: name.trim(),
                    phoneNumber: rawPhone,
                    message: trimmedMsg,
                    isDnc,
                  },
                },
              });
            }
          } catch {}
        }
      });
    }
  } catch (dbError: any) {
    console.error("Database error in takeMessage:", dbError?.message);
    // Still return success to Retell so caller is acknowledged politely
  }

  return {
    success: true,
    statusCode: 200,
    message: "Your message has been successfully recorded.",
    name: name.trim(),
    phone_number: phone_number.trim(),
  };
}

export function extractToolPayload<T = Record<string, any>>(body: any): T {
  if (!body || typeof body !== "object") {
    return {} as T;
  }
  const args = body.args && typeof body.args === "object" ? body.args : {};
  return {
    ...body,
    ...args,
    call: body.call || args.call || null,
  } as T;
}

export type CalcomExtractedData = {
  primaryUid: string;
  candidateIds: string[];
  cancellationReason: string | null;
  cancelledBy: string | null;
  triggerEvent: string;
  isCancellation: boolean;
  isReschedule: boolean;
  isPing: boolean;
};

export function extractCalcomIdentifiers(payload: any): CalcomExtractedData {
  if (!payload || typeof payload !== "object") {
    return {
      primaryUid: "",
      candidateIds: [],
      cancellationReason: null,
      cancelledBy: null,
      triggerEvent: "",
      isCancellation: false,
      isReschedule: false,
      isPing: false,
    };
  }

  const booking = payload.payload || payload.data || payload.booking || payload;
  const nestedBooking = (booking.booking && typeof booking.booking === "object" ? booking.booking : {}) as Record<string, any>;
  const payloadData = (payload.data && typeof payload.data === "object" ? payload.data : {}) as Record<string, any>;
  const payloadPayload = (payload.payload && typeof payload.payload === "object" ? payload.payload : {}) as Record<string, any>;

  const triggerEvent = String(
    payload.triggerEvent ||
    payload.event ||
    payload.type ||
    payload.action ||
    ""
  ).trim();

  const status = String(
    booking.status ||
    payload.status ||
    nestedBooking.status ||
    payloadData.status ||
    payloadPayload.status ||
    ""
  ).trim().toUpperCase();

  const upperEvent = triggerEvent.toUpperCase();
  const isPing = upperEvent === "PING";
  const isReschedule = !isPing && upperEvent.includes("RESCHEDULE");
  const isCancellation =
    !isPing &&
    !isReschedule &&
    (upperEvent.includes("CANCEL") ||
      upperEvent.includes("REJECT") ||
      status === "CANCELLED" ||
      status === "CANCELED" ||
      status === "REJECTED");

  const rawCandidateIds = [
    booking.uid,
    booking.bookingUid,
    booking.booking_uid,
    booking.id,
    booking.bookingId,
    booking.booking_id,
    nestedBooking.uid,
    nestedBooking.id,
    nestedBooking.bookingId,
    payloadData.uid,
    payloadData.id,
    payloadData.bookingId,
    payloadPayload.uid,
    payloadPayload.id,
    payloadPayload.bookingId,
    payload.uid,
    payload.id,
    payload.bookingId,
    payload.bookingUid,
  ];

  const INVALID_CANDIDATE_STRINGS = new Set([
    "",
    "null",
    "undefined",
    "false",
    "true",
    "[object object]",
  ]);
  const candidateIds: string[] = [];
  for (const item of rawCandidateIds) {
    if (item !== undefined && item !== null) {
      const s = String(item).trim();
      if (s && !INVALID_CANDIDATE_STRINGS.has(s.toLowerCase()) && !candidateIds.includes(s)) {
        candidateIds.push(s);
      }
    }
  }

  const primaryUid = candidateIds[0] || "";

  const cancellationReason =
    booking.cancellationReason ||
    booking.rejectionReason ||
    nestedBooking.cancellationReason ||
    payloadPayload.cancellationReason ||
    payloadData.cancellationReason ||
    payload.cancellationReason ||
    payload.reason ||
    payload.rejectionReason ||
    null;

  const cancelledBy =
    booking.cancelledBy ||
    nestedBooking.cancelledBy ||
    payloadPayload.cancelledBy ||
    payloadData.cancelledBy ||
    payload.cancelledBy ||
    null;

  return {
    primaryUid,
    candidateIds,
    cancellationReason: cancellationReason ? String(cancellationReason).trim() : null,
    cancelledBy: cancelledBy ? String(cancelledBy).trim() : null,
    triggerEvent,
    isCancellation,
    isReschedule,
    isPing,
  };
}

export type ProcessCalcomCancellationInput = {
  rawBody?: string;
  payload?: any;
  headers?: Record<string, string | string[] | undefined> | Headers;
  secret?: string;
  bookingUid?: string;
  organizationId?: string;
};

export type ProcessCalcomCancellationResult =
  | {
      success: true;
      statusCode: 200;
      action: "cancelled" | "already_cancelled";
      appointmentId: string;
      bookingUid: string;
      cancellationReason?: string | null;
      cancelledAt?: string;
      message: string;
    }
  | {
      success: false;
      statusCode: 400 | 401 | 404 | 500;
      error: string;
      bookingUid?: string;
    };

export async function processCalcomCancellation(
  input: ProcessCalcomCancellationInput,
  options: BookingServiceOptions = {},
): Promise<ProcessCalcomCancellationResult> {
  const env = options.env ?? process.env;
  const configuredSecret = input.secret ?? env.CALCOM_WEBHOOK_SECRET?.trim();
  const db = options.db ?? defaultPrisma;

  // 1. Verify signature if secret configured
  if (configuredSecret && input.headers) {
    let sigHeader: string | null = null;
    if (typeof (input.headers as any)?.get === "function") {
      sigHeader =
        (input.headers as Headers).get("x-cal-signature-256") ||
        (input.headers as Headers).get("x-cal-secret") ||
        (input.headers as Headers).get("x-calcom-signature") ||
        (input.headers as Headers).get("cal-signature-256");
    } else {
      const h = input.headers as Record<string, any>;
      sigHeader =
        h["x-cal-signature-256"] ||
        h["X-Cal-Signature-256"] ||
        h["x-cal-secret"] ||
        h["X-Cal-Secret"] ||
        h["x-calcom-signature"] ||
        h["cal-signature-256"] ||
        h["authorization"]?.replace(/^Bearer\s+/i, "");
    }

    const isValid = verifyCalcomSignature(input.rawBody || "", sigHeader, configuredSecret);
    if (!isValid) {
      return {
        success: false,
        statusCode: 401,
        error: "Invalid webhook signature.",
      };
    }
  }

  // 2. Parse payload if needed
  let payload = input.payload;
  if (!payload && input.rawBody) {
    try {
      payload = JSON.parse(input.rawBody);
    } catch {
      return {
        success: false,
        statusCode: 400,
        error: "Invalid JSON body.",
      };
    }
  }

  // 3. Extract identifiers
  const extracted = extractCalcomIdentifiers(payload);
  const candidateIds = input.bookingUid
    ? [input.bookingUid.trim(), ...extracted.candidateIds.filter((c) => c !== input.bookingUid?.trim())]
    : extracted.candidateIds;
  const primaryUid = candidateIds[0] || "";

  if (!primaryUid) {
    return {
      success: false,
      statusCode: 400,
      error: "Missing Cal.com booking identifier in webhook payload.",
    };
  }

  // Reject reschedule events if accidentally invoked for cancellation
  if (extracted.isReschedule) {
    return {
      success: false,
      statusCode: 400,
      error: `Event '${extracted.triggerEvent}' is a rescheduling event, not a cancellation event.`,
      bookingUid: primaryUid,
    };
  }

  // 4. Find appointment in PostgreSQL by external booking identifier
  const targetOrgId = options.organizationId || input.organizationId;
  const orgFilter = targetOrgId ? { organizationId: targetOrgId } : {};

  let appt: any = null;
  try {
    appt = await db.appointment.findFirst({
      where: {
        ...orgFilter,
        OR: [
          { calcomEventId: { in: candidateIds } },
          { id: { in: candidateIds }, provider: "calcom" },
        ],
      },
      include: { contact: true },
    });

    if (!appt && db.appointment.findMany) {
      // Fallback check in JSON metadata for calcomBookingUid or bookingUid
      const potentialAppts = await db.appointment.findMany({
        where: {
          ...orgFilter,
          provider: "calcom",
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { contact: true },
      });
      for (const p of potentialAppts) {
        const m = (p.metadata || {}) as Record<string, any>;
        const mUid = String(m.calcomBookingUid || m.bookingUid || m.calcomEventId || "").trim();
        if (mUid && candidateIds.includes(mUid)) {
          appt = p;
          break;
        }
      }
    }
  } catch (findErr: any) {
    console.error(`[Cal.com Cancellation Lookup Error] bookingUid=${primaryUid} error="${findErr?.message}"`);
    return {
      success: false,
      statusCode: 500,
      error: `Failed to query appointment from database: ${findErr?.message || "Unknown error"}`,
      bookingUid: primaryUid,
    };
  }

  if (!appt) {
    return {
      success: false,
      statusCode: 404,
      error: `No appointment found matching Cal.com booking identifier '${primaryUid}'.`,
      bookingUid: primaryUid,
    };
  }

  // 5. Handle duplicate deliveries idempotently (already cancelled)
  const isAlreadyCancelled =
    appt.status?.toLowerCase() === "cancelled" || appt.status?.toLowerCase() === "canceled";

  if (isAlreadyCancelled) {
    return {
      success: true,
      statusCode: 200,
      action: "already_cancelled",
      appointmentId: appt.id,
      bookingUid: primaryUid,
      cancellationReason: extracted.cancellationReason,
      message: `Appointment '${appt.id}' is already marked as cancelled.`,
    };
  }

  // 6. Update appointment status and cancellation metadata in PostgreSQL
  const previousMetadata = (appt.metadata && typeof appt.metadata === "object"
    ? appt.metadata
    : {}) as Record<string, unknown>;

  const nowIso = (options.now ?? new Date()).toISOString();
  const updatedMetadata: Record<string, unknown> = {
    ...previousMetadata,
    cancelledAt: nowIso,
    cancellationReason: extracted.cancellationReason || previousMetadata.cancellationReason || "Cancelled via Cal.com",
    cancelledBy: extracted.cancelledBy || previousMetadata.cancelledBy || "calcom_webhook",
    calcomStatus: "CANCELLED",
    lastWebhookEvent: extracted.triggerEvent || "BOOKING_CANCELLED",
  };

  try {
    await db.appointment.update({
      where: { id: appt.id },
      data: {
        status: "cancelled",
        metadata: updatedMetadata,
      },
    });

    if (db.auditLog?.create) {
      try {
        await db.auditLog.create({
          data: {
            organizationId: appt.organizationId,
            entity: "appointment",
            action: "calcom_webhook_cancel",
            details: {
              appointmentId: appt.id,
              calcomBookingUid: primaryUid,
              triggerEvent: extracted.triggerEvent || "BOOKING_CANCELLED",
              cancellationReason: extracted.cancellationReason,
              cancelledAt: nowIso,
            },
          },
        });
      } catch {}
    }

    return {
      success: true,
      statusCode: 200,
      action: "cancelled",
      appointmentId: appt.id,
      bookingUid: primaryUid,
      cancellationReason: extracted.cancellationReason,
      cancelledAt: nowIso,
      message: `Appointment '${appt.id}' status successfully updated to cancelled.`,
    };
  } catch (updateErr: any) {
    console.error(`[Cal.com Cancellation DB Update Error] bookingUid=${primaryUid} error="${updateErr?.message}"`);
    return {
      success: false,
      statusCode: 500,
      error: `Failed to update appointment cancellation in database: ${updateErr?.message || "Unknown error"}`,
      bookingUid: primaryUid,
    };
  }
}

