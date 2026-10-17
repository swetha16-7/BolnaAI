import test from "node:test";
import assert from "node:assert/strict";

import {
  canViewProviderSettings,
  getProviderConfigurationStatus,
} from "../lib/server/providers/configuration.ts";

test("provider configuration reports missing environment variable names only", () => {
  const status = getProviderConfigurationStatus({});

  assert.deepEqual(status, {
    providers: {
      retell: {
        status: "missing_configuration",
        missing: ["RETELL_API_KEY", "RETELL_FROM_NUMBER", "RETELL_WEBHOOK_URL"],
        invalid: [],
      },
      twilio: {
        status: "missing_configuration",
        missing: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_WEBHOOK_URL"],
        invalid: [],
      },
      calcom: {
        status: "missing_configuration",
        missing: ["CALCOM_API_KEY", "CALCOM_WEBHOOK_SECRET"],
        invalid: [],
      },
    },
  });
});

test("configured provider status does not expose environment values", () => {
  const environment = {
    RETELL_API_KEY: "retell-secret-test-value",
    RETELL_FROM_NUMBER: "+14155552671",
    RETELL_WEBHOOK_URL: "https://example.test/api/webhooks/retell",
    TWILIO_ACCOUNT_SID: "twilio-sid-test-value",
    TWILIO_AUTH_TOKEN: "twilio-auth-test-value",
    TWILIO_WEBHOOK_URL: "https://example.test/api/webhooks/twilio",
    CALCOM_API_KEY: "calcom-secret-test-value",
    CALCOM_WEBHOOK_SECRET: "calcom-webhook-test-value",
  };
  const status = getProviderConfigurationStatus(environment);
  const serialized = JSON.stringify(status);

  assert.deepEqual(status, {
    providers: {
      retell: { status: "configured", missing: [], invalid: [] },
      twilio: { status: "configured", missing: [], invalid: [] },
      calcom: { status: "configured", missing: [], invalid: [] },
    },
  });
  for (const secret of [
    environment.RETELL_API_KEY,
    environment.TWILIO_ACCOUNT_SID,
    environment.TWILIO_AUTH_TOKEN,
    environment.CALCOM_API_KEY,
    environment.CALCOM_WEBHOOK_SECRET,
  ]) {
    assert.equal(serialized.includes(secret), false);
  }
});

test("provider status rejects invalid caller number and webhook route configuration", () => {
  const status = getProviderConfigurationStatus({
    RETELL_API_KEY: "retell-secret-test-value",
    RETELL_FROM_NUMBER: "not-a-phone-number",
    RETELL_WEBHOOK_URL: "http://example.test/not-the-retell-route",
    TWILIO_ACCOUNT_SID: "twilio-sid-test-value",
    TWILIO_AUTH_TOKEN: "twilio-auth-test-value",
    TWILIO_WEBHOOK_URL: "https://example.test/not-the-twilio-route",
    CALCOM_API_KEY: "calcom-secret-test-value",
    CALCOM_WEBHOOK_SECRET: "calcom-webhook-test-value",
  });

  assert.deepEqual(status.providers.retell, {
    status: "invalid_configuration",
    missing: [],
    invalid: ["RETELL_FROM_NUMBER", "RETELL_WEBHOOK_URL"],
  });
  assert.deepEqual(status.providers.twilio, {
    status: "invalid_configuration",
    missing: [],
    invalid: ["TWILIO_WEBHOOK_URL"],
  });
});

test("provider configuration status is restricted to organization owners and admins", () => {
  assert.equal(canViewProviderSettings("OWNER"), true);
  assert.equal(canViewProviderSettings("ADMIN"), true);
  assert.equal(canViewProviderSettings("MANAGER"), false);
  assert.equal(canViewProviderSettings("MEMBER"), false);
  assert.equal(canViewProviderSettings(""), false);
});
