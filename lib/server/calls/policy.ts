import { phoneSchema } from "../validation/schemas.ts";
import { parsePhoneNumberFromString } from "libphonenumber-js";

export const OUTBOUND_CALL_ALLOWED_ROLES = ["OWNER", "ADMIN", "MANAGER"] as const;

export function canCreateOutboundCall(role: string): boolean {
  return OUTBOUND_CALL_ALLOWED_ROLES.some((allowedRole) => allowedRole === role);
}

export function isOutboundCallingEnabled(
  environment: Record<string, string | undefined> = process.env,
): boolean {
  return environment.OUTBOUND_CALLS_ENABLED === "true" &&
    environment.OUTBOUND_CALLING_POLICY_APPROVED === "true";
}

export function getConfiguredDailyLimit(
  environment: Record<string, string | undefined> = process.env,
  defaultLimit = 5,
): number {
  const configured = environment.OUTBOUND_MAX_CALLS_PER_DAY;
  if (!configured) return defaultLimit;
  const parsed = Number.parseInt(configured, 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 100 ? parsed : 0;
}

export function parseAllowedCountries(
  environment: Record<string, string | undefined> = process.env,
): string[] {
  return (environment.OUTBOUND_ALLOWED_COUNTRIES ?? "")
    .split(",")
    .map((country) => country.trim().toUpperCase())
    .filter(Boolean);
}

export type OutboundPolicyGateParams = {
  isPolicyEnabled: boolean;
  hasApiKey: boolean;
  hasProviderLink: boolean;
  isUniquelyOwned: boolean;
  allowedCountriesCount: number;
  dailyLimit: number;
};

export type OutboundPolicyGateResult = {
  allowed: boolean;
  blockers: string[];
};

export function evaluateOutboundPolicyGate(
  params: OutboundPolicyGateParams,
): OutboundPolicyGateResult {
  const blockers: string[] = [];
  if (!params.isPolicyEnabled) {
    blockers.push("OUTBOUND_CALLING_POLICY_NOT_ENABLED");
  }
  if (!params.hasApiKey) {
    blockers.push("MISSING_RETELL_API_KEY");
  }
  if (!params.hasProviderLink) {
    blockers.push("MISSING_RETELL_PROVIDER_LINK");
  } else if (!params.isUniquelyOwned) {
    blockers.push("NON_UNIQUE_PROVIDER_LINK_OWNERSHIP");
  }
  if (params.allowedCountriesCount === 0) {
    blockers.push("NO_ALLOWED_DESTINATION_COUNTRIES");
  }
  if (params.dailyLimit <= 0) {
    blockers.push("INVALID_DAILY_CALL_LIMIT");
  }

  return {
    allowed: blockers.length === 0,
    blockers,
  };
}

export function isMatchingCallReplay(
  existingCall: {
    agentId: string | null;
    contactId: string | null;
    destination: string | null;
  },
  input: { agentId: string; contactId?: string | null; destination: string },
): boolean {
  return existingCall.agentId === input.agentId &&
    (existingCall.contactId ?? null) === (input.contactId ?? null) &&
    existingCall.destination === input.destination;
}

export type CallConsentState = {
  phone: string | null;
  voiceConsentAt: Date | null;
  voiceConsentRevokedAt: Date | null;
  doNotCall: boolean;
};

export function getCallEligibilityError(contact: CallConsentState): string | null {
  if (!contact.phone || !phoneSchema.safeParse(contact.phone).success) {
    return "The contact does not have a valid E.164 phone number.";
  }
  if (contact.doNotCall) {
    return "This contact is marked do not call.";
  }
  if (
    !contact.voiceConsentAt ||
    (contact.voiceConsentRevokedAt && contact.voiceConsentRevokedAt >= contact.voiceConsentAt)
  ) {
    return "Recorded consent for AI voice calls is required.";
  }
  return null;
}

export function mapRetellCallStatus(
  event: string,
  callStatus: string,
  disconnectionReason?: string | null,
): string | null {
  if (event === "create") {
    if (callStatus === "ongoing") return "in_progress";
    if (callStatus === "error" || callStatus === "not_connected") return "failed";
    return "initiated";
  }
  if (event === "call_started") return "in_progress";
  if (event === "call_ended") {
    if (
      callStatus === "error" ||
      callStatus === "not_connected" ||
      ["dial_failed", "dial_no_answer", "dial_busy"].includes(disconnectionReason ?? "")
    ) {
      return "failed";
    }
    return "completed";
  }
  if (callStatus === "ongoing") return "in_progress";
  if (callStatus === "registered") return "initiated";
  if (callStatus === "error" || callStatus === "not_connected") return "failed";
  if (callStatus === "ended") {
    if (
      ["dial_failed", "dial_no_answer", "dial_busy"].includes(disconnectionReason ?? "")
    ) {
      return "failed";
    }
    return "completed";
  }
  return null;
}

export function mapTwilioCallStatus(status: string): string | null {
  switch (status.toLowerCase()) {
    case "queued":
    case "initiated":
      return "initiated";
    case "ringing":
      return "ringing";
    case "in-progress":
    case "in_progress":
      return "in_progress";
    case "completed":
      return "completed";
    case "busy":
    case "no-answer":
    case "canceled":
    case "failed":
      return "failed";
    default:
      return null;
  }
}

export function isTerminalCallStatus(status: string): boolean {
  return ["completed", "failed", "canceled"].includes(status);
}

export const ACTIVE_CALL_STATUSES = [
  "pending",
  "initiating",
  "initiated",
  "registered",
  "ringing",
  "in_progress",
  "ongoing",
  "submission_unknown",
] as const;

export function isActiveCallStatus(status: string): boolean {
  return ACTIVE_CALL_STATUSES.includes(status as typeof ACTIVE_CALL_STATUSES[number]);
}

export function isDestinationAllowed(phone: string, allowedCountries: string[]): boolean {
  const parsed = parsePhoneNumberFromString(phone);
  return Boolean(parsed?.isValid() && parsed.country && allowedCountries.includes(parsed.country));
}
