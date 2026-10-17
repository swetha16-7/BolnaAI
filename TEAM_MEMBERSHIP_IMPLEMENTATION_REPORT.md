# Team Membership and Invitations — Implementation Report

**Date:** 2026-10-14  
**Scope:** Phase 1 team membership and invitation functionality only.

## Summary

Replaced the Team page's sample roster with organization-backed membership and
invitation data. Added APIs to list members/invitations, create and email
invitations, accept or revoke invitations, change member roles, and remove
members. Invitation tokens are random 256-bit values; only SHA-256 hashes are
persisted, and the raw token is never returned by an API.

## Changes

- Added `Invitation` and `InvitationStatus` to [schema.prisma](./prisma/schema.prisma)
  and the additive migration
  [20261014100000_team_invitations](./prisma/migrations/20261014100000_team_invitations/migration.sql).
- Added team APIs:
  - [GET/POST /api/team](./app/api/team/route.ts): organization member and
    invitation list; create invitation.
  - [PATCH/DELETE /api/team/members/[membershipId]](./app/api/team/members/[membershipId]/route.ts):
    guarded role changes and membership removal.
  - [DELETE /api/team/invitations/[invitationId]](./app/api/team/invitations/[invitationId]/route.ts):
    revoke a pending invitation.
  - [POST /api/team/invitations/accept](./app/api/team/invitations/accept/route.ts):
    accept an invitation and create a user account if needed.
- Added [team security helpers](./lib/server/team.ts), the server-side Resend
  email adapter, typed client API methods, and an
  [invitation acceptance page](./app/accept-invitation/page.tsx).
- Replaced mock Team data with API-backed members, roles, invitation statuses,
  loading/error/empty/success states, and permission-aware actions in
  [TeamPage](./app/(admin)/team/page.tsx).
- Added Resend configuration placeholders to [.env.example](./.env.example)
  and setup/security notes to [README.md](./README.md). The existing `.env` was
  not edited.

## Authorization and security rules

- Every team management/list route resolves the caller using the existing
  session and membership helper. Resource mutations include both the active
  organization ID and the requested resource ID; an ID in another organization
  is not addressable through these endpoints.
- The active organization cookie is only a preference. The server still
  requires a matching user membership before granting access. Invitation
  acceptance sets this preference so users joining another organization land
  in the organization they accepted.
- Any organization member may view the roster. Only `OWNER` and `ADMIN`
  memberships can invite, change roles, remove members, or revoke invitations.
- Owners may invite `ADMIN`, `MANAGER`, or `MEMBER`; administrators may invite
  only `MANAGER` or `MEMBER`. Only an owner may grant or change an `ADMIN` or
  `OWNER` membership role. `OWNER` invitations are not allowed.
- A user cannot change or remove their own membership. Administrators cannot
  remove owners or administrators. The final owner cannot be demoted or removed.
  Role changes and removals re-check actor and target state inside serializable
  transactions, and write audit events without invitation tokens or email
  addresses.
- Invitations are limited to five per inviter per organization per hour, expire
  after seven days, and can only be claimed while pending and unexpired. The
  acceptance transaction claims the invitation and creates the membership
  atomically. Replayed, revoked, expired, wrong-email, and invalid tokens use
  generic rejection messages.
- Acceptance requires the invited email's existing account password, or
  creates a new account using the invited email and supplied password. Account
  existence is not disclosed by the invitation-creation response.
- The token is carried in the email link fragment and submitted to the server
  from the acceptance page. It is absent from API responses and database
  records. Provider secrets remain server-side.

## Invitation email delivery

The implementation sends through the Resend HTTP API using server-only
`RESEND_API_KEY`, `INVITATION_FROM_EMAIL`, and `NEXT_PUBLIC_APP_URL` settings.
The request has a timeout, configuration is validated, provider response
details are not exposed, and a failed send revokes the newly created pending
invitation. No invitation is claimed as sent on a provider error.

The send helper was exercised against a mocked fetch response only. No live
Resend API request was made, and no live API key, verified sender domain, or
delivery receipt was checked. **Live invitation email delivery is therefore
implemented but not verified.** Production use requires configuring and
verifying the Resend account and sender domain.

## Migration requirements

The schema requires the new additive invitation table and enum; no existing
migration was modified, and no database reset or migration application was
performed. Before deploying the code, apply the new migration using the normal
reviewed deployment workflow (for example `npx prisma migrate deploy`) against
the intended database.

`npx prisma migrate status` could not connect to the configured local
PostgreSQL server at `127.0.0.1:5432` (`P1001`). Migration state in that
database is unknown. No database changes were made.

## Tests and validation

- `npm test`: **29 passed, 0 failed**.
- Added unit coverage for organization/resource scoping, invitation schema and
  role policy, admin escalation prevention, self/last-owner protection,
  random-token hashing, invalid/expired/revoked/reused invitation acceptance,
  expiry presentation, roster projection, client request shape, and mocked
  Resend submission.
- `npx tsc --noEmit`: **passed**.
- `npx prisma validate`: **passed**.
- `npm run lint`: **passed with 4 warnings, 0 errors**. Warnings remain in
  unrelated [agents-view.tsx](./components/views/agents-view.tsx) (2 internal
  navigation warnings), [profile-view.tsx](./components/views/profile-view.tsx)
  (`img` warning), and [settings-view.tsx](./components/views/settings-view.tsx)
  (unused value).
- `npm run build`: **passed**; includes the new team APIs and invitation page.
- `npx prisma migrate status`: **blocked** by unavailable local PostgreSQL
  (`P1001`); the migration was not applied.

Tests exercise security policies and the mocked email boundary. They do not
exercise the route handlers against a real database, prove PostgreSQL
serializable behavior, or verify live email delivery. Database-backed
authorization and concurrency tests remain necessary before production
deployment.

## Remaining limitations

- Invitation and member lists show at most the 100 most recent invitations;
  invitations are not paginated.
- Expiry is computed for display and enforced during acceptance/revocation; an
  expired invitation's persisted status remains `PENDING` until superseded or
  otherwise acted on.
- An invitee with an account must provide that account's password when
  accepting without an existing session. There is no separate SSO or password
  recovery acceptance flow in this phase.
- Invitation delivery failure revokes the attempted invitation. An ambiguous
  network failure could occur after the email provider accepted a message; in
  that case its link may no longer work and the owner must issue a fresh
  invitation.
- The team role model uses organization `MembershipRole`; the older global
  `UserRole` remains unchanged and is not used for these authorization checks.
