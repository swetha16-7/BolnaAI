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

export function isMatchingCallReplay(
  existingCall: {
    agentId: string | null;
    contactId: string | null;
    destination: string | null;
  },
  input: { agentId: string; contactId: string; destination: string },
): boolean {
  return existingCall.agentId === input.agentId &&
    existingCall.contactId === input.contactId &&
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
  if (callStatus === "ended") return "completed";
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

export function isDestinationAllowed(phone: string, allowedCountries: string[]): boolean {
  const parsed = parsePhoneNumberFromString(phone);
  return Boolean(parsed?.isValid() && parsed.country && allowedCountries.includes(parsed.country));
}
