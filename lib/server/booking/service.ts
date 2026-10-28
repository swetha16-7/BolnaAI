import crypto from "node:crypto";
import { prisma as defaultPrisma } from "../db.ts";
import { createRetellClient } from "../calls/retell.ts";

export type CheckAvailabilityInput = {
  appointment_type?: string | null;
  preferred_date?: string | null;
  date?: string | null;
  location?: string | null;
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
  phone_number?: string | null;
  email?: string | null;
  appointment_type?: string | null;
  property_type?: string | null;
  location?: string | null;
  slot_date?: string | null;
  slot_time?: string | null;
  date?: string | null;
  time?: string | null;
  timezone?: string | null;
  agent_id?: string | null;
  call?: { agent_id?: string | null; call_id?: string | null } | null;
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

export type TakeMessageInput = {
  name?: string | null;
  phone_number?: string | null;
  email?: string | null;
  message?: string | null;
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
  const match = timeStr.trim().match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(AM|PM)?$/i);
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
  const location = input.location;
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
  const name = input.name || (input as any).customer_name || (input as any).caller_name;
  const phone_number = input.phone_number || (input as any).phone || (input as any).caller_phone;
  const email = input.email;
  const appointment_type = input.appointment_type || (input as any).type || "Property Viewing";
  const property_type = input.property_type || "Property";
  const location = input.location || "Hyderabad";
  const slot_date = input.slot_date || (input as any).date;
  const slot_time = input.slot_time || (input as any).time;
  const explicitTimezone = input.timezone;

  // Validation
  if (!name?.trim()) {
    return { status: "error", statusCode: 400, booking_status: "failed", message: "Caller name is required for booking." };
  }
  if (!phone_number?.trim()) {
    return { status: "error", statusCode: 400, booking_status: "failed", message: "Phone number is required for booking." };
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
  const retellAgentId = input.agent_id || input.call?.agent_id;

  if (retellAgentId && db?.providerLink?.findFirst) {
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

  const attendeeEmail = email?.trim() || `${phone_number.replace(/\D/g, "")}@customer.bolna.ai`;
  const bookingBody = {
    eventTypeId: numericEventTypeId,
    start: startsAt.toISOString(),
    attendee: {
      name: name.trim(),
      email: attendeeEmail,
      timeZone: timezone,
      phoneNumber: phone_number.trim(),
      language: "en",
    },
    metadata: {
      phoneNumber: phone_number.trim(),
      location: location?.trim() || "Hyderabad",
      propertyType: property_type?.trim() || "Property",
      appointmentType: appointment_type?.trim() || "Property Viewing",
    },
  };

  try {
    const bookingApiVersion = env.CALCOM_BOOKING_API_VERSION?.trim() || env.CALCOM_API_VERSION?.trim() || "2024-08-13";
    let response = await fetcher("https://api.cal.com/v2/bookings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${calcomApiKey}`,
        "cal-api-version": bookingApiVersion,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bookingBody),
    });

    if (response.status === 400) {
      console.warn(
        `[Cal.com Booking Diagnostic] upstream_status=400 eventTypeId=${numericEventTypeId} date=${slot_date} time=${slot_time} tz=${timezone} reason="slot_unavailable"`
      );
      return {
        status: "unavailable",
        statusCode: 409,
        booking_status: "failed",
        message: "The requested time slot is unavailable or has already been booked on Cal.com. Please choose another slot.",
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
      console.warn(
        `[Cal.com Booking Diagnostic] upstream_status=404 eventTypeId=${numericEventTypeId} date=${slot_date} time=${slot_time} tz=${timezone}`
      );
      return {
        status: "error",
        statusCode: 502,
        booking_status: "failed",
        message: `Cal.com event type '${numericEventTypeId}' was not found. Please check CALCOM_EVENT_TYPE_ID.`,
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
      let errorDetail = "";
      try {
        const errJson = await response.clone().json();
        if (errJson?.message) errorDetail = String(errJson.message).slice(0, 150);
        else if (errJson?.error?.message) errorDetail = String(errJson.error.message).slice(0, 150);
      } catch {}
      console.warn(
        `[Cal.com Booking Diagnostic] upstream_status=${response.status} eventTypeId=${numericEventTypeId} date=${slot_date} time=${slot_time} tz=${timezone}${errorDetail ? ` detail="${errorDetail}"` : ""}`
      );
      return {
        status: "error",
        statusCode: 502,
        booking_status: "failed",
        message: `Booking provider returned an error (HTTP ${response.status}). Booking could not be confirmed.`,
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
            agentId: retellAgentId ?? null,
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
              propertyType: property_type,
              location,
              slotDate: slot_date,
              slotTime: slot_time,
              calcomBookingUid: String(calcomBookingUid),
            },
          },
        });

        bookingId = appt.id;

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
          await tx.contact.create({
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
              isDnc,
              recordedAt: now.toISOString(),
            },
          },
        });

        // Link with call record if call_id is supplied
        const callId = input.call?.call_id;
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

