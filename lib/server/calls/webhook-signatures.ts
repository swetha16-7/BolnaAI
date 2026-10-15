import { Retell } from "retell-sdk";
import twilio from "twilio";

export function verifyRetellSignature(
  rawBody: string,
  apiKey: string,
  signature: string,
): Promise<boolean> {
  return Retell.verify(rawBody, apiKey, signature);
}

export function verifyTwilioSignature(
  authToken: string,
  canonicalUrl: string,
  parameters: Record<string, string | string[]>,
  signature: string,
): boolean {
  return twilio.validateRequest(authToken, signature, canonicalUrl, parameters);
}
