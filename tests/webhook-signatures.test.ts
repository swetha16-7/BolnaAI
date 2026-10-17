import test from "node:test";
import assert from "node:assert/strict";

import Retell from "retell-sdk";
import twilio from "twilio";
import {
  verifyRetellSignature,
  verifyTwilioSignature,
} from "../lib/server/calls/webhook-signatures.ts";

test("Retell signature verifier checks the unmodified raw request body", async () => {
  const body = '{"event":"call_started","call":{"call_id":"test-call"}}';
  const apiKey = "test-retell-api-key";
  const signature = await Retell.sign(body, apiKey);

  assert.equal(await verifyRetellSignature(body, apiKey, signature), true);
  assert.equal(await verifyRetellSignature(`${body} `, apiKey, signature), false);
  assert.equal(await verifyRetellSignature(body, apiKey, `${signature}invalid`), false);
});

test("Twilio validation uses the configured canonical URL and all form parameters", () => {
  const authToken = "test-twilio-auth-token";
  const canonicalUrl = "https://voice.example.test/api/webhooks/twilio?tenant=one";
  const parameters = { CallSid: "CA-test", CallStatus: "completed", CallDuration: "30" };
  const signature = twilio.getExpectedTwilioSignature(authToken, canonicalUrl, parameters);

  assert.equal(verifyTwilioSignature(authToken, canonicalUrl, parameters, signature), true);
  assert.equal(verifyTwilioSignature(authToken, `${canonicalUrl}/`, parameters, signature), false);
  assert.equal(verifyTwilioSignature(authToken, canonicalUrl, { ...parameters, CallStatus: "failed" }, signature), false);
  assert.equal(verifyTwilioSignature(authToken, canonicalUrl, parameters, `${signature}invalid`), false);
});
