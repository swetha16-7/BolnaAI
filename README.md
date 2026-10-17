# AI Voice Agent

## Getting started

```bash
npm install
if (!(Test-Path .env)) { Copy-Item .env.example .env }
npm run dev
```

Open http://localhost:5000

## Database setup (PostgreSQL)

For local development, install and start Docker Desktop, then run:

```bash
docker compose up -d postgres
```

Copy `.env.example` to `.env` if it does not already exist (otherwise preserve
and update the existing file), then set
`DATABASE_URL` and a random `SESSION_SECRET` of at least 32 characters. Keep
production values in the deployment secret manager. The compose database
credentials are local-development-only and must not be exposed to the network.

Example:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@127.0.0.1:5432/bolnaai?schema=public"
SESSION_SECRET="generate-a-random-secret-of-at-least-32-characters"
RETELL_API_KEY="replace-with-retell-api-key"
RETELL_FROM_NUMBER="replace-with-retell-provisioned-e164-number"
RETELL_WEBHOOK_URL="https://your-public-host.example/api/webhooks/retell"
TWILIO_ACCOUNT_SID="ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
TWILIO_AUTH_TOKEN="replace-with-twilio-auth-token"
TWILIO_WEBHOOK_URL="https://your-public-host.example/api/webhooks/twilio"
CALCOM_API_KEY="replace-with-cal-com-api-key"
CALCOM_WEBHOOK_SECRET="replace-with-cal-com-webhook-secret"
OUTBOUND_CALLS_ENABLED="false"
OUTBOUND_CALLING_POLICY_APPROVED="false"
OUTBOUND_ALLOWED_COUNTRIES=""
OUTBOUND_MAX_CALLS_PER_DAY="5"
NEXT_PUBLIC_APP_URL="http://localhost:5000"
```

Validate and generate the Prisma client:

```bash
npx prisma validate
npx prisma generate
```

For a new, empty development database, create and apply the first migration:

```bash
npx prisma migrate dev --name init
npx prisma migrate status
```

Do not accept a Prisma reset prompt on a database containing data. Back up and
review any existing database before applying schema changes. Production
deployments should apply committed migrations with `npx prisma migrate deploy`.

Production deployments should use a managed Postgres service and set the same environment variables in the deployment environment.
The Prisma CLI is a development dependency; run `npx prisma migrate deploy` in
the build or migration job with development dependencies installed, before
deploying the production runtime. Keep `@prisma/client` installed in the
runtime application.

## Team invitations

Team invitations are organization-scoped, expire after seven days, and can be
used only once by the account matching the invited email address. Only token
hashes are stored. Configure `RESEND_API_KEY`, a verified
`INVITATION_FROM_EMAIL`, and the public `NEXT_PUBLIC_APP_URL` to send invitation
emails. The invitation link carries its token in the URL fragment and the
acceptance page submits it directly to the server; tokens are not returned by
the team API. Email delivery has not been verified for a live Resend account.

Only owners can invite administrators or grant administrator roles. Owners and
administrators can manage ordinary members, but only owners can modify
administrator/owner memberships. Self-removal is blocked and an organization
must retain at least one owner.

## Provider configuration status

The Settings page reads provider configuration status from an authenticated,
owner/admin-only endpoint. It reports only configured/missing state and missing
environment variable names; it does not call provider APIs or return credential
values. Supply credentials through the server environment or deployment secret
manager, never through browser settings. No provider credentials are stored in
Prisma.

Retell status requires `RETELL_API_KEY`, `RETELL_FROM_NUMBER`, and
`RETELL_WEBHOOK_URL`. Twilio status requires `TWILIO_ACCOUNT_SID`,
`TWILIO_AUTH_TOKEN`, and `TWILIO_WEBHOOK_URL`. Cal.com status requires
`CALCOM_API_KEY` and `CALCOM_WEBHOOK_SECRET`; this status check does not yet
verify a Cal.com connection or implement Cal.com API operations.

The Agents page can read the configured Retell account's existing agent list.
The Retell key remains server-side; only agent IDs, names, and channels are
returned to the browser. Organization owners and administrators can link a
listed Retell agent to an unlinked application agent. This saves a local
`ProviderLink` mapping only; it does not create, edit, publish, or delete
Retell agents. Each Retell agent may be linked to only one application agent
across this installation.

Call History offers a read-only **Retell account** view in addition to stored
application records. It uses Retell's paginated call-list and call-detail APIs.
A provider call is shown only when its Retell agent has exactly one mapping
across this installation and that mapping belongs to an agent in the current
organization; calls without a provable organization owner are omitted. Provider
credentials remain server-side. Transcript, summary, timestamps, duration, and
an HTTPS recording link are displayed only when Retell supplies them. This
view does not synchronize records or configure webhook delivery.

### Connect a Twilio number to a Retell agent

The supported application call path is Retell's `createPhoneCall` API using
the saved Retell agent mapping and `RETELL_FROM_NUMBER`. There is no direct
Twilio Calls API path in this application.

For an existing Twilio number, follow Retell's current
[Twilio Elastic SIP Trunking guide](https://docs.retellai.com/deploy/twilio)
and [custom telephony guide](https://docs.retellai.com/deploy/custom-telephony):

1. In Twilio Console, create an Elastic SIP Trunk.
2. Configure its **Termination** SIP URI using the localized URI shown in the
   Twilio Console. Configure the required IP access control or SIP credentials
   according to your security policy and the Retell guide.
3. Configure **Origination** with Retell's SIP server URI,
   `sip:sip.retellai.com`, and associate the existing number with the trunk.
4. In Retell's Phone Numbers dashboard, import the number through SIP trunking.
   Enter the Twilio termination URI and, if using credential authentication,
   the SIP credentials. Use Retell's **Test SIP Connection** action, then save
   the import and assign the number to the intended Retell agent.

The exact Twilio termination host, region/edge, and authentication values are
specific to your Twilio account. Do not paste SIP passwords into this app; the
import flow stores/configures telephony in Retell. This application does not
change dashboard settings or phone-number routing.

Configure the Retell call-event webhook as
`https://<public-host>/api/webhooks/retell`; set `RETELL_WEBHOOK_URL` to that
exact public HTTPS URL. For the current supported Retell events, configure
the corresponding webhook events in Retell. Configure
`https://<public-host>/api/webhooks/twilio` only as a Twilio **status callback**
where a Call Status Callback is supported, and set `TWILIO_WEBHOOK_URL` to
that exact URL (including any query string). This route expects Twilio's
signed form-encoded `CallSid` and `CallStatus` callback fields; it is **not**
a TwiML endpoint and must not be configured as a Twilio inbound Voice URL or
as the SIP trunk's Origination URI. Retell's Origination URI above is for SIP
signaling and is unrelated to this application's callback route.

The app's configuration diagnostic validates required environment-variable
presence, the E.164 caller-number shape, and callback URL protocol/path only.
It does not authenticate to either provider or verify that a SIP trunk, phone
number, webhook subscription, or agent assignment is live. Existing signed
webhook handlers validate incoming event signatures; no provider API is called
by the diagnostic.

Retell webhook events are verified against the raw request body before
processing. Events matching an existing call update its record and use the
`CallEvent` ledger for idempotency. Valid events that cannot be safely matched
to a local call are recorded in `AuditLog` as `retell_webhook` /
`pending_reconciliation`; no call is created. The entry contains only event and
provider identifiers, not transcript, phone, recording, or full payload data.
An organization is attached only when the Retell agent is uniquely linked; if
ownership is ambiguous, the entry remains unassigned. These pending entries are
durable for later reconciliation. A protected scheduled trigger at
`POST /api/cron/retell-reconciliation` processes a bounded batch of pending
entries. Configure an external scheduler to call the endpoint with
`Authorization: Bearer <CRON_SECRET>`; `CRON_SECRET` must be at least 32
characters and is read only on the server. No hosting-provider scheduler is
configured by the application.

The worker fetches each call directly from Retell and proceeds only if that
call's Retell agent has exactly one trusted local link, any queued organization
matches that link, and a matching local Retell call already exists. It never
creates a call. A match uses either the exact provider call ID or an existing
application call ID corroborated by the unique agent link. Call updates, the
`CallEvent` idempotency record, and the audit entry's reconciled state commit
atomically. Bounded batches use expiring database leases to prevent concurrent
workers from processing the same entry; provider failures, missing local calls,
invalid responses, and ambiguous ownership remain pending for retry. The worker
does not return call identifiers or call content in its response.

Outbound call submission remains separately gated. Keep both
`OUTBOUND_CALLS_ENABLED` and `OUTBOUND_CALLING_POLICY_APPROVED` set to `false`
until explicitly reviewed and enabled through the application's approved
safety process.

## Voice calling readiness

Outbound call submission is gated off by default. Do not turn on
`OUTBOUND_CALLS_ENABLED` or `OUTBOUND_CALLING_POLICY_APPROVED` until the provider
account, consent process, destination allowlist, public webhook endpoint,
idempotency, and usage limits have been reviewed and tested. Empty
`OUTBOUND_ALLOWED_COUNTRIES` denies every destination. The server applies a
five-call-per-organization-per-UTC-day limit by default (configurable from 1 to
100).

The app uses the official Retell Node SDK to submit `createPhoneCall` requests.
`RETELL_FROM_NUMBER` must be a number purchased by Retell or imported into
Retell. To use a Twilio number, configure that number/telephony connection in
Retell according to its current phone-number import or SIP-trunk requirements;
the app does not directly dial through Twilio's Calls REST API. The Retell
agent ID is mapped per application agent in Agent Builder and persisted as a
provider link. The Retell API key remains server-side and is also the key used
by Retell's documented webhook signature verifier.

The local `/api/webhooks/retell` handler verifies the exact raw request body
with Retell's official SDK. It updates only an existing Retell call record:
either a record matched by its provider call ID, or an application call whose
metadata ID is corroborated by a unique Retell-agent link. Unknown and
unassociated calls are not imported. Duplicate events are ignored; status
progression cannot move a terminal call back to an earlier state. Available
timestamps, duration, direction, numbers, transcript, summary, and HTTPS
recording references are synchronized without retaining full webhook content
in the event ledger. The payload is size-limited and provider errors do not
include credentials or call content.

No webhook tunnel or callback registration is configured as part of local
development. Register a public HTTPS endpoint with Retell only after deployment
and callback readiness have been reviewed; Retell cannot reach localhost.

If Twilio status callbacks are configured separately, set
`TWILIO_WEBHOOK_URL` to the exact public HTTPS callback URL configured in
Twilio, including any query string. The server validates form requests with the
official Twilio SDK and `TWILIO_AUTH_TOKEN`; it does not trust forwarded host
headers. That callback can associate events only after Retell's response has
provided a Twilio Call SID. No Twilio credentials are currently configured in
this environment.

The CRM stores explicit consent source/evidence notes and revocation/do-not-call
state. This is an operational safeguard, not a determination of legal
compliance. Verify applicable consent rules, contact local-time calling windows,
number registration, emergency restrictions, and retention/privacy obligations
before enabling calls. Uncertain provider submissions are saved as
`submission_unknown`; do not retry them with a new idempotency key.

## Security notes

- Keep secrets server-side only.
- Never expose provider tokens to browser code.
- Verify Twilio and Retell webhook signatures before processing events.
- Protect every route behind session and organization membership checks.
- Never expose provider credentials to browser code or log provider responses.

## Prisma dependency advisory

As of 2026-10-14, `npm audit --omit=dev` reports the high-severity
`deepmerge-ts` recursive-object stack-exhaustion advisory
([GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx)).
The dependency path is
`@prisma/client@6.19.3` (optional `prisma` peer) ->
`prisma@6.19.3` -> `@prisma/config@6.19.3` ->
`deepmerge-ts@7.1.5`. npm includes the CLI path in the production-filtered
audit because it resolves the optional Prisma peer from the lockfile.
The Prisma CLI is not needed by the running application, but this project uses
it for the `db:generate`, `db:migrate`, `db:push`, `db:studio`, and
`db:validate` scripts and for deployment migrations. Removing it from the
installed toolchain would disrupt database development/deployment; invoking
the same CLI transiently would still execute the vulnerable dependency and
would only hide it from this project's dependency audit.

No safe vendor-published fix was available when checked: Prisma 6.19.3 was the
latest Prisma 6 release, and the published Prisma 7.10.0 config package also
pins `deepmerge-ts@7.1.5`. The npm-suggested Prisma 6.12.0 is a downgrade and
was not applied. Do not force an override or upgrade to Prisma 7 to suppress
this finding. Reassess when Prisma publishes a supported release whose
`@prisma/config` dependency uses `deepmerge-ts@8` or later; upgrade the Prisma
CLI and client in a compatible pair, then validate the schema, generated
client, migrations, and database status. For a Prisma 7 migration, follow
[Prisma's official upgrade guide](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7)
only after a fixed release is available.

## Development-tooling dependency advisory

The full `npm audit` also reports
[`braces` GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm),
a high-severity stack-exhaustion denial of service in `braces@3.0.3` (affected
through `<=3.0.3`). It is one distinct advisory, not a separate finding for
each of the affected parent packages. The paths include
`eslint-config-next@16.4.0` -> `@next/eslint-plugin-next@16.4.0` ->
`fast-glob@3.3.1` -> `micromatch@4.0.8` -> `braces@3.0.3`, and
`shadcn@4.11.0` -> `fast-glob@3.3.3` -> `micromatch@4.0.8` ->
`braces@3.0.3`. The related `ts-morph` / `@ts-morph/common` audit entries are
additional paths to the same vulnerable development tooling, not additional
advisories. These packages are development tools and are not required by the
runtime application. `eslint-config-next` and its plugin are needed by the
project's `npm run lint` workflow. `shadcn` is not referenced by application
code or an npm script; its CLI is available for occasional component
generation, and `ts-morph` is only present transitively beneath that CLI.
Removing `shadcn` and downloading the same CLI on demand would still execute
the same affected dependency chain during generation while merely removing it
from this project's installed-tree audit, so it is not an applied mitigation.

No compatible patched `braces` release was published when checked
(`3.0.3` remains the latest), and `@next/eslint-plugin-next@16.4.0` pins
`fast-glob@3.3.1`. npm's proposed `shadcn@1.0.0` remediation is a major
downgrade; it was not applied. The current same-major `shadcn@4.21.4` release
still allows `fast-glob@^3.3.3` and `ts-morph@^26.0.0`, so that update alone
does not establish a fix. Reassess when the Next lint plugin and the supported
shadcn CLI dependency trees resolve to a vendor-patched `braces` release, or
when a vendor-supported replacement for the affected matcher is verified
against both linting and component generation. Until then, retain the existing
tooling and do not use an override to hide the advisory.

## Validation

```bash
npm test
npx tsc --noEmit
npm run build
```
