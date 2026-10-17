export type OutboundCallContact = {
  id: string;
  phone: string | null;
  voiceConsentAt: string | null;
  voiceConsentRevokedAt: string | null;
  doNotCall: boolean;
};

export function validateOutboundCallForm(input: {
  agentId: string;
  destination: string;
  contact?: OutboundCallContact | null;
  consentConfirmed: boolean;
}): string | null {
  if (!input.agentId) return "Select an active Retell-mapped agent.";

  const destination = input.destination.trim();
  if (!/^\+[1-9]\d{7,14}$/.test(destination)) {
    return "Enter a valid destination number in E.164 format.";
  }
  if (input.contact && input.contact.phone === destination) {
    const consentAt = input.contact.voiceConsentAt
      ? Date.parse(input.contact.voiceConsentAt)
      : Number.NaN;
    const revokedAt = input.contact.voiceConsentRevokedAt
      ? Date.parse(input.contact.voiceConsentRevokedAt)
      : Number.NaN;
    if (
      input.contact.doNotCall ||
      !Number.isFinite(consentAt) ||
      (Number.isFinite(revokedAt) && revokedAt >= consentAt)
    ) {
      return "This contact must have current, unrevoked consent and must not be marked do not call.";
    }
  }
  if (!input.consentConfirmed) {
    return "Confirm that consent has been obtained before requesting a call.";
  }

  return null;
}

export async function runOutboundCallOnce<T>(
  pending: { current: boolean },
  submit: () => Promise<T>,
): Promise<T | null> {
  if (pending.current) return null;
  pending.current = true;
  try {
    return await submit();
  } finally {
    pending.current = false;
  }
}
