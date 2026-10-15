const REDACTED = "[REDACTED]";
const REDACTED_PHONE = "[REDACTED_PHONE]";

const SENSITIVE_KEYWORDS = [
  "authorization",
  "apiKey",
  "api_key",
  "secret",
  "token",
  "password",
  "DATABASE_URL",
  "CRON_SECRET",
  "RETELL_API_KEY",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "CALCOM_API_KEY",
  "CALCOM_WEBHOOK_SECRET",
  "SESSION_SECRET",
  "NEXTAUTH_SECRET",
  "connectionString",
  "webhookSecret",
  "recording_url",
  "scrubbed_recording_url",
  "transcript",
  "call_summary",
  "from_number",
  "to_number",
  "callerNumber",
  "destination",
];

export function redactSensitiveData(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactSensitiveData(value.message),
      stack: redactSensitiveData(value.stack),
    };
  }

  if (typeof value === "string") {
    let redacted = value;
    redacted = redacted.replace(/(Bearer\s+)[A-Za-z0-9._~+\-/=]+/gi, `$1${REDACTED}`);
    redacted = redacted.replace(/(https?:\/\/)([^\s:@/]+):([^@\s/]+)@/gi, `$1[REDACTED]:[REDACTED]@`);
    redacted = redacted.replace(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, REDACTED);
    redacted = redacted.replace(/(\+?[1-9]\d{7,14})/g, REDACTED_PHONE);
    for (const keyword of SENSITIVE_KEYWORDS) {
      redacted = redacted.replace(
        new RegExp(`(${keyword})([:=\\s]+)([^\\s,;"']+)`, "gi"),
        `$1$2${REDACTED}`,
      );
    }
    redacted = redacted.replace(/("(?:transcript|call_summary|summary|recording_url|scrubbed_recording_url|from_number|to_number|callerNumber|destination|phone|text|message)"\s*:\s*")([^"]*)"/gi, `$1${REDACTED}"`);
    redacted = redacted.replace(/('(?:transcript|call_summary|summary|recording_url|scrubbed_recording_url|from_number|to_number|callerNumber|destination|phone|text|message)'\s*:\s*')([^']*)'/gi, `$1${REDACTED}'`);
    return redacted;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => redactSensitiveData(entry));
  }

  if (typeof value === "object") {
    const redactedObject: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = SENSITIVE_KEYWORDS.some((keyword) =>
        lowerKey.includes(keyword.toLowerCase()) || key.toLowerCase().includes("secret")
      );
      redactedObject[key] = isSensitive ? REDACTED : redactSensitiveData(nestedValue);
    }
    return redactedObject;
  }

  return value;
}
