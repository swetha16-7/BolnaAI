-- Add persisted safeguards and provider identifiers for outbound calling.
ALTER TABLE "Call"
ADD COLUMN "failureCode" TEXT,
ADD COLUMN "failureMessage" TEXT,
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "transcript" TEXT,
ADD COLUMN "twilioCallSid" TEXT;

ALTER TABLE "CallEvent"
ADD COLUMN "externalEventId" TEXT;

ALTER TABLE "Contact"
ADD COLUMN "doNotCall" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "doNotCallAt" TIMESTAMP(3),
ADD COLUMN "voiceConsentAt" TIMESTAMP(3),
ADD COLUMN "voiceConsentEvidence" TEXT,
ADD COLUMN "voiceConsentRevokedAt" TIMESTAMP(3),
ADD COLUMN "voiceConsentSource" TEXT;

CREATE TABLE "DailyCallUsage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "callCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyCallUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyCallUsage_organizationId_dayKey_key"
ON "DailyCallUsage"("organizationId", "dayKey");

CREATE UNIQUE INDEX "Call_twilioCallSid_key" ON "Call"("twilioCallSid");
CREATE INDEX "Call_organizationId_createdAt_idx" ON "Call"("organizationId", "createdAt");
CREATE UNIQUE INDEX "Call_organizationId_idempotencyKey_key"
ON "Call"("organizationId", "idempotencyKey");
CREATE UNIQUE INDEX "Call_provider_externalCallId_key" ON "Call"("provider", "externalCallId");
CREATE INDEX "CallEvent_callId_createdAt_idx" ON "CallEvent"("callId", "createdAt");
CREATE UNIQUE INDEX "CallEvent_source_externalEventId_key"
ON "CallEvent"("source", "externalEventId");

ALTER TABLE "DailyCallUsage"
ADD CONSTRAINT "DailyCallUsage_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
