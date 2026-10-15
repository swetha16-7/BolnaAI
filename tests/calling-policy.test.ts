import test from "node:test";
import assert from "node:assert/strict";

import {
  getCallEligibilityError,
  isDestinationAllowed,
  isTerminalCallStatus,
  mapRetellCallStatus,
  mapTwilioCallStatus,
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
  assert.equal(isDestinationAllowed("+442079460000", ["US"]), false);
  assert.equal(isDestinationAllowed("not-a-number", ["US"]), false);
});

test("Retell and Twilio statuses map to persisted lifecycle states", () => {
  assert.equal(mapRetellCallStatus("call_started", "ongoing"), "in_progress");
  assert.equal(mapRetellCallStatus("call_ended", "ended", "dial_no_answer"), "failed");
  assert.equal(mapRetellCallStatus("call_ended", "ended", "user_hangup"), "completed");
  assert.equal(mapTwilioCallStatus("ringing"), "ringing");
  assert.equal(mapTwilioCallStatus("no-answer"), "failed");
  assert.equal(isTerminalCallStatus("completed"), true);
  assert.equal(isTerminalCallStatus("submission_unknown"), false);
});
