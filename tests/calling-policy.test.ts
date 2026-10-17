import test from "node:test";
import assert from "node:assert/strict";

import {
  ACTIVE_CALL_STATUSES,
  evaluateOutboundPolicyGate,
  getCallEligibilityError,
  getConfiguredDailyLimit,
  isActiveCallStatus,
  isDestinationAllowed,
  isTerminalCallStatus,
  mapRetellCallStatus,
  mapTwilioCallStatus,
  parseAllowedCountries,
} from "../lib/server/calls/policy.ts";

const validConsent = {
  phone: "+14155552671",
  voiceConsentAt: new Date("2026-10-01T00:00:00.000Z"),
  voiceConsentRevokedAt: null,
  doNotCall: false,
};

test("call eligibility requires a valid phone and current explicit consent", () => {
  assert.equal(getCallEligibilityError(validConsent), null);
  assert.match(getCallEligibilityError({ ...validConsent, phone: "4155552671" }) ?? "", /E.164/);
  assert.match(getCallEligibilityError({ ...validConsent, voiceConsentAt: null }) ?? "", /consent/i);
  assert.match(getCallEligibilityError({
    ...validConsent,
    voiceConsentRevokedAt: new Date("2026-10-02T00:00:00.000Z"),
  }) ?? "", /consent/i);
  assert.match(getCallEligibilityError({ ...validConsent, doNotCall: true }) ?? "", /do not call/i);
});

test("destination checks require a parsed country in the explicit allowlist", () => {
  assert.equal(isDestinationAllowed("+14155552671", ["US"]), true);
  assert.equal(isDestinationAllowed("+14155552671", []), false);
  assert.equal(isDestinationAllowed("+918374605389", ["IN"]), true);
  assert.equal(isDestinationAllowed("+918374605389", ["US", "IN"]), true);
  assert.equal(isDestinationAllowed("+918374605389", ["US"]), false);
  assert.equal(isDestinationAllowed("+442079460000", ["US"]), false);
  assert.equal(isDestinationAllowed("not-a-number", ["US"]), false);
});

test("Retell and Twilio statuses map to persisted lifecycle states", () => {
  assert.equal(mapRetellCallStatus("call_started", "ongoing"), "in_progress");
  assert.equal(mapRetellCallStatus("call_ended", "ended", "dial_no_answer"), "failed");
  assert.equal(mapRetellCallStatus("call_ended", "ended", "user_hangup"), "completed");
  assert.equal(mapRetellCallStatus("poll", "ended", "user_hangup"), "completed");
  assert.equal(mapRetellCallStatus("poll", "ongoing"), "in_progress");
  assert.equal(mapTwilioCallStatus("ringing"), "ringing");
  assert.equal(mapTwilioCallStatus("no-answer"), "failed");
  assert.equal(isTerminalCallStatus("completed"), true);
  assert.equal(isTerminalCallStatus("failed"), true);
  assert.equal(isTerminalCallStatus("canceled"), true);
  assert.equal(isTerminalCallStatus("submission_unknown"), false);
  assert.equal(isTerminalCallStatus("in_progress"), false);
});

test("ACTIVE_CALL_STATUSES accurately identifies non-terminal call states", () => {
  const activeExpected = [
    "pending",
    "initiating",
    "initiated",
    "registered",
    "ringing",
    "in_progress",
    "ongoing",
    "submission_unknown",
  ];
  for (const status of activeExpected) {
    assert.equal(isActiveCallStatus(status), true, `Expected ${status} to be active`);
  }
  const terminalExpected = ["completed", "failed", "canceled", "ended", "unknown_status"];
  for (const status of terminalExpected) {
    assert.equal(isActiveCallStatus(status), false, `Expected ${status} not to be active`);
  }
});

test("getConfiguredDailyLimit parses numbers and applies defaults and boundaries", () => {
  assert.equal(getConfiguredDailyLimit({}), 5);
  assert.equal(getConfiguredDailyLimit({ OUTBOUND_MAX_CALLS_PER_DAY: "10" }), 10);
  assert.equal(getConfiguredDailyLimit({ OUTBOUND_MAX_CALLS_PER_DAY: "0" }), 0);
  assert.equal(getConfiguredDailyLimit({ OUTBOUND_MAX_CALLS_PER_DAY: "-5" }), 0);
  assert.equal(getConfiguredDailyLimit({ OUTBOUND_MAX_CALLS_PER_DAY: "101" }), 0);
  assert.equal(getConfiguredDailyLimit({ OUTBOUND_MAX_CALLS_PER_DAY: "abc" }), 0);
});

test("parseAllowedCountries extracts trimmed, uppercase country codes", () => {
  assert.deepEqual(parseAllowedCountries({}), []);
  assert.deepEqual(parseAllowedCountries({ OUTBOUND_ALLOWED_COUNTRIES: "US,IN" }), ["US", "IN"]);
  assert.deepEqual(parseAllowedCountries({ OUTBOUND_ALLOWED_COUNTRIES: " us , in , " }), ["US", "IN"]);
});

test("evaluateOutboundPolicyGate identifies every failure condition individually and reports blockers", () => {
  const passingGate = {
    isPolicyEnabled: true,
    hasApiKey: true,
    hasProviderLink: true,
    isUniquelyOwned: true,
    allowedCountriesCount: 2,
    dailyLimit: 5,
  };

  // Successful path
  const successResult = evaluateOutboundPolicyGate(passingGate);
  assert.equal(successResult.allowed, true);
  assert.deepEqual(successResult.blockers, []);

  // Blocker: Policy disabled
  const disabledResult = evaluateOutboundPolicyGate({ ...passingGate, isPolicyEnabled: false });
  assert.equal(disabledResult.allowed, false);
  assert.deepEqual(disabledResult.blockers, ["OUTBOUND_CALLING_POLICY_NOT_ENABLED"]);

  // Blocker: Missing Retell API key
  const missingKeyResult = evaluateOutboundPolicyGate({ ...passingGate, hasApiKey: false });
  assert.equal(missingKeyResult.allowed, false);
  assert.deepEqual(missingKeyResult.blockers, ["MISSING_RETELL_API_KEY"]);

  // Blocker: Missing Retell provider link
  const missingLinkResult = evaluateOutboundPolicyGate({ ...passingGate, hasProviderLink: false });
  assert.equal(missingLinkResult.allowed, false);
  assert.deepEqual(missingLinkResult.blockers, ["MISSING_RETELL_PROVIDER_LINK"]);

  // Blocker: Non-unique provider link ownership
  const nonUniqueResult = evaluateOutboundPolicyGate({ ...passingGate, isUniquelyOwned: false });
  assert.equal(nonUniqueResult.allowed, false);
  assert.deepEqual(nonUniqueResult.blockers, ["NON_UNIQUE_PROVIDER_LINK_OWNERSHIP"]);

  // Blocker: No allowed destination countries
  const noCountriesResult = evaluateOutboundPolicyGate({ ...passingGate, allowedCountriesCount: 0 });
  assert.equal(noCountriesResult.allowed, false);
  assert.deepEqual(noCountriesResult.blockers, ["NO_ALLOWED_DESTINATION_COUNTRIES"]);

  // Blocker: Invalid or zero daily limit
  const zeroLimitResult = evaluateOutboundPolicyGate({ ...passingGate, dailyLimit: 0 });
  assert.equal(zeroLimitResult.allowed, false);
  assert.deepEqual(zeroLimitResult.blockers, ["INVALID_DAILY_CALL_LIMIT"]);

  // Multiple simultaneous blockers
  const multiBlockerResult = evaluateOutboundPolicyGate({
    ...passingGate,
    isPolicyEnabled: false,
    hasApiKey: false,
    dailyLimit: 0,
  });
  assert.equal(multiBlockerResult.allowed, false);
  assert.equal(multiBlockerResult.blockers.includes("OUTBOUND_CALLING_POLICY_NOT_ENABLED"), true);
  assert.equal(multiBlockerResult.blockers.includes("MISSING_RETELL_API_KEY"), true);
  assert.equal(multiBlockerResult.blockers.includes("INVALID_DAILY_CALL_LIMIT"), true);
});
