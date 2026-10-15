export const PROVIDER_SETTINGS_ROLES = ["OWNER", "ADMIN"] as const;

const providerRequirements = {
  retell: ["RETELL_API_KEY", "RETELL_FROM_NUMBER", "RETELL_WEBHOOK_URL"],
  twilio: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_WEBHOOK_URL"],
  calcom: ["CALCOM_API_KEY", "CALCOM_WEBHOOK_SECRET"],
} as const;

export type ProviderConfiguration = {
  status: "configured" | "missing_configuration" | "invalid_configuration";
  missing: string[];
  invalid: string[];
};

export type ProviderConfigurationStatus = {
  providers: Record<keyof typeof providerRequirements, ProviderConfiguration>;
};

function isPublicHttpsRoute(value: string | undefined, routePath: string) {
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.pathname === routePath &&
      url.username === "" &&
      url.password === "";
  } catch {
    return false;
  }
}

function isValidE164(value: string | undefined) {
  return Boolean(value && /^\+[1-9]\d{7,14}$/.test(value));
}

export function canViewProviderSettings(role: string) {
  return PROVIDER_SETTINGS_ROLES.some((allowedRole) => allowedRole === role);
}

export function getRetellApiKey(
  environment: Record<string, string | undefined> = process.env,
) {
  const apiKey = environment.RETELL_API_KEY?.trim();
  return apiKey || null;
}

export function getProviderConfigurationStatus(
  environment: Record<string, string | undefined> = process.env,
): ProviderConfigurationStatus {
  const check = (
    requiredVariables: readonly string[],
    validators: Record<string, (value: string | undefined) => boolean> = {},
  ): ProviderConfiguration => {
    const missing = requiredVariables.filter((name) => !environment[name]?.trim());
    const invalid = requiredVariables.filter(
      (name) => !missing.includes(name) && validators[name] && !validators[name](environment[name]),
    );
    return {
      status: missing.length > 0
        ? "missing_configuration"
        : invalid.length > 0
          ? "invalid_configuration"
          : "configured",
      missing,
      invalid,
    };
  };

  return {
    providers: {
      retell: check(providerRequirements.retell, {
        RETELL_FROM_NUMBER: isValidE164,
        RETELL_WEBHOOK_URL: (value) => isPublicHttpsRoute(value, "/api/webhooks/retell"),
      }),
      twilio: check(providerRequirements.twilio, {
        TWILIO_WEBHOOK_URL: (value) => isPublicHttpsRoute(value, "/api/webhooks/twilio"),
      }),
      calcom: check(providerRequirements.calcom),
    },
  };
}
