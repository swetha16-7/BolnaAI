import test from "node:test";
import assert from "node:assert/strict";

import {
  canInviteRole,
  createInvitationToken,
  hashInvitationToken,
  invitationCreateSchema,
  invitationStatus,
  memberRemovalFailure,
  presentTeamListing,
  roleChangeFailure,
  sendInvitationEmail,
  teamResourceScope,
  validInvitationAcceptance,
} from "../lib/server/team.ts";

const now = new Date("2026-10-14T10:00:00.000Z");
const token = createInvitationToken();
const invitation = {
  storedTokenHash: hashInvitationToken(token),
  token,
  status: "PENDING" as const,
  expiresAt: new Date("2026-10-21T10:00:00.000Z"),
  invitedEmail: "teammate@example.test",
  accountEmail: "TEAMMATE@example.test",
  now,
};

test("team resources are always addressed within an organization", () => {
  assert.deepEqual(teamResourceScope("org-a", "membership-a"), {
    id: "membership-a",
    organizationId: "org-a",
  });
  assert.notDeepEqual(
    teamResourceScope("org-a", "membership-a"),
    teamResourceScope("org-b", "membership-a"),
  );
});

test("invitation creation validates email and disallows owner invitations", () => {
  assert.equal(invitationCreateSchema.safeParse({ email: "USER@example.test", role: "MEMBER" }).success, true);
  assert.equal(invitationCreateSchema.safeParse({ email: "not-an-email", role: "MEMBER" }).success, false);
  assert.equal(invitationCreateSchema.safeParse({ email: "user@example.test", role: "OWNER" }).success, false);
});

test("only owners may invite administrators; admins can invite standard roles", () => {
  assert.equal(canInviteRole("OWNER", "ADMIN"), true);
  assert.equal(canInviteRole("ADMIN", "ADMIN"), false);
  assert.equal(canInviteRole("ADMIN", "MANAGER"), true);
  assert.equal(canInviteRole("MANAGER", "MEMBER"), false);
});

test("administrators cannot promote, modify privileged roles, or alter their own role", () => {
  const shared = {
    actorId: "admin-id",
    actorRole: "ADMIN",
    targetId: "member-id",
    currentRole: "MEMBER" as const,
    ownerCount: 1,
  };
  assert.equal(roleChangeFailure({ ...shared, nextRole: "MANAGER" }), null);
  assert.equal(roleChangeFailure({ ...shared, nextRole: "ADMIN" }), "forbidden");
  assert.equal(roleChangeFailure({
    ...shared,
    targetId: "other-admin",
    currentRole: "ADMIN",
    nextRole: "MEMBER",
  }), "forbidden");
  assert.equal(roleChangeFailure({
    ...shared,
    targetId: "admin-id",
    nextRole: "MEMBER",
  }), "self");
});

test("owner protections prevent self-removal and removal or demotion of the last owner", () => {
  assert.equal(memberRemovalFailure({
    actorId: "owner-1",
    actorRole: "OWNER",
    targetId: "owner-1",
    targetRole: "OWNER",
    ownerCount: 1,
  }), "self");
  assert.equal(memberRemovalFailure({
    actorId: "owner-1",
    actorRole: "OWNER",
    targetId: "owner-2",
    targetRole: "OWNER",
    ownerCount: 1,
  }), "last_owner");
  assert.equal(roleChangeFailure({
    actorId: "owner-1",
    actorRole: "OWNER",
    targetId: "owner-2",
    currentRole: "OWNER",
    nextRole: "ADMIN",
    ownerCount: 1,
  }), "last_owner");
  assert.equal(memberRemovalFailure({
    actorId: "admin-1",
    actorRole: "ADMIN",
    targetId: "owner-2",
    targetRole: "OWNER",
    ownerCount: 2,
  }), "forbidden");
});

test("invitation tokens are random opaque values and only their digest is persisted", () => {
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(hashInvitationToken(token), token);
  assert.equal(hashInvitationToken(token), invitation.storedTokenHash);
});

test("acceptance rejects invalid, mismatched, expired, revoked, and reused tokens", () => {
  assert.equal(validInvitationAcceptance(invitation), true);
  assert.equal(validInvitationAcceptance({ ...invitation, token: `${token}x` }), false);
  assert.equal(validInvitationAcceptance({ ...invitation, accountEmail: "other@example.test" }), false);
  assert.equal(validInvitationAcceptance({ ...invitation, expiresAt: now }), false);
  assert.equal(validInvitationAcceptance({ ...invitation, status: "REVOKED" }), false);
  assert.equal(validInvitationAcceptance({ ...invitation, status: "ACCEPTED" }), false);
});

test("expired pending invitations are presented as expired without changing persisted state", () => {
  assert.equal(invitationStatus("PENDING", new Date(now.getTime() - 1), now), "EXPIRED");
  assert.equal(invitationStatus("PENDING", new Date(now.getTime() + 1), now), "PENDING");
  assert.equal(invitationStatus("REVOKED", new Date(now.getTime() + 1), now), "REVOKED");
});

test("member listing returns only organization membership fields and pending invitation status", () => {
  const listing = presentTeamListing({
    members: [{
      id: "membership-1",
      role: "OWNER",
      createdAt: now,
      user: { id: "user-1", name: "Owner", email: "owner@example.test" },
    }],
    invitations: [{
      id: "invite-1",
      email: "pending@example.test",
      role: "MEMBER",
      status: "PENDING",
      createdAt: now,
      expiresAt: new Date("2026-10-21T10:00:00.000Z"),
    }],
    currentRole: "OWNER",
    currentUserId: "user-1",
    now,
  });
  assert.equal(listing.members.length, 1);
  assert.equal(listing.members[0].user.email, "owner@example.test");
  assert.equal(listing.invitations[0].status, "PENDING");
  assert.equal("tokenHash" in listing.invitations[0], false);
  assert.equal(listing.canManage, true);
});

test("invitation email sends token only to the configured provider and never returns it", async () => {
  const environment = {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    INVITATION_FROM_EMAIL: process.env.INVITATION_FROM_EMAIL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  };
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.INVITATION_FROM_EMAIL = "BoomiSolutions <invite@example.test>";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  let requestBody: Record<string, unknown> | undefined;
  let authorization: string | null = null;
  try {
    const result = await sendInvitationEmail({
      email: "new-member@example.test",
      organizationName: "Example Workspace",
      role: "MEMBER",
      token,
      fetcher: async (_input, init) => {
        authorization = new Headers(init?.headers).get("Authorization");
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(null, { status: 200 });
      },
    });
    assert.equal(result, undefined);
    assert.equal(authorization, "Bearer test-resend-key");
    assert.deepEqual(requestBody?.to, ["new-member@example.test"]);
    assert.equal(String(requestBody?.text).includes(token), true);
    assert.equal(String(requestBody?.html).includes(`#token=${token}`), true);
  } finally {
    if (environment.RESEND_API_KEY === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = environment.RESEND_API_KEY;
    if (environment.INVITATION_FROM_EMAIL === undefined) delete process.env.INVITATION_FROM_EMAIL;
    else process.env.INVITATION_FROM_EMAIL = environment.INVITATION_FROM_EMAIL;
    if (environment.NEXT_PUBLIC_APP_URL === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = environment.NEXT_PUBLIC_APP_URL;
  }
});
