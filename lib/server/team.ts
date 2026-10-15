import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

export const membershipRoleSchema = z.enum(["OWNER", "ADMIN", "MANAGER", "MEMBER"]);
export const invitationRoleSchema = z.enum(["ADMIN", "MANAGER", "MEMBER"]);

export const invitationCreateSchema = z.object({
  email: z.string().trim().email().max(254),
  role: invitationRoleSchema,
});

export const invitationAcceptSchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  name: z.string().trim().min(2).max(100),
  password: z.string().min(8).max(128).optional(),
});

export const membershipRoleUpdateSchema = z.object({
  role: membershipRoleSchema,
});

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const INVITATIONS_PER_HOUR = 5;

export type MembershipRole = z.infer<typeof membershipRoleSchema>;
export type InvitationRole = z.infer<typeof invitationRoleSchema>;

export function teamResourceScope(organizationId: string, resourceId: string) {
  return { id: resourceId, organizationId };
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function createInvitationToken() {
  return randomBytes(32).toString("base64url");
}

export function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function invitationStatus(
  status: "PENDING" | "ACCEPTED" | "REVOKED",
  expiresAt: Date,
  now = new Date(),
) {
  if (status === "PENDING" && expiresAt <= now) return "EXPIRED";
  return status;
}

export function presentTeamListing({
  members,
  invitations,
  currentRole,
  currentUserId,
  now = new Date(),
}: {
  members: Array<{
    id: string;
    role: MembershipRole;
    createdAt: Date;
    user: { id: string; name: string; email: string };
  }>;
  invitations: Array<{
    id: string;
    email: string;
    role: MembershipRole;
    status: "PENDING" | "ACCEPTED" | "REVOKED";
    createdAt: Date;
    expiresAt: Date;
  }>;
  currentRole: MembershipRole;
  currentUserId: string;
  now?: Date;
}) {
  return {
    members,
    invitations: invitations.map((invitation) => ({
      ...invitation,
      status: invitationStatus(invitation.status, invitation.expiresAt, now),
    })),
    currentRole,
    currentUserId,
    canManage: currentRole === "OWNER" || currentRole === "ADMIN",
  };
}

export function canInviteRole(actorRole: string, role: InvitationRole) {
  if (actorRole !== "OWNER" && actorRole !== "ADMIN") return false;
  return actorRole === "OWNER" || role !== "ADMIN";
}

export function roleChangeFailure({
  actorId,
  actorRole,
  targetId,
  currentRole,
  nextRole,
  ownerCount,
}: {
  actorId: string;
  actorRole: string;
  targetId: string;
  currentRole: MembershipRole;
  nextRole: MembershipRole;
  ownerCount: number;
}) {
  if (actorId === targetId) return "self";
  if (actorRole !== "OWNER" && actorRole !== "ADMIN") return "forbidden";
  if (
    actorRole !== "OWNER" &&
    (currentRole === "OWNER" || currentRole === "ADMIN" || nextRole === "OWNER" || nextRole === "ADMIN")
  ) {
    return "forbidden";
  }
  if (currentRole === "OWNER" && nextRole !== "OWNER" && ownerCount <= 1) return "last_owner";
  return null;
}

export function memberRemovalFailure({
  actorId,
  actorRole,
  targetId,
  targetRole,
  ownerCount,
}: {
  actorId: string;
  actorRole: string;
  targetId: string;
  targetRole: MembershipRole;
  ownerCount: number;
}) {
  if (actorId === targetId) return "self";
  if (actorRole !== "OWNER" && actorRole !== "ADMIN") return "forbidden";
  if (actorRole !== "OWNER" && (targetRole === "OWNER" || targetRole === "ADMIN")) return "forbidden";
  if (targetRole === "OWNER" && ownerCount <= 1) return "last_owner";
  return null;
}

export function validInvitationAcceptance({
  storedTokenHash,
  token,
  status,
  expiresAt,
  invitedEmail,
  accountEmail,
  now = new Date(),
}: {
  storedTokenHash: string;
  token: string;
  status: "PENDING" | "ACCEPTED" | "REVOKED";
  expiresAt: Date;
  invitedEmail: string;
  accountEmail: string;
  now?: Date;
}) {
  return (
    status === "PENDING" &&
    expiresAt > now &&
    storedTokenHash === hashInvitationToken(token) &&
    normalizeEmail(invitedEmail) === normalizeEmail(accountEmail)
  );
}

export class InvitationDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvitationDeliveryError";
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

export async function sendInvitationEmail({
  email,
  organizationName,
  role,
  token,
  fetcher = fetch,
}: {
  email: string;
  organizationName: string;
  role: InvitationRole;
  token: string;
  fetcher?: typeof fetch;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.INVITATION_FROM_EMAIL;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!apiKey || !from || !appUrl) {
    throw new InvitationDeliveryError("Invitation email delivery is not configured.");
  }

  let inviteUrl: URL;
  try {
    const baseUrl = new URL(appUrl);
    const isLocalHttp = baseUrl.protocol === "http:" && baseUrl.hostname === "localhost";
    if (
      (!isLocalHttp && baseUrl.protocol !== "https:") ||
      baseUrl.username ||
      baseUrl.password
    ) {
      throw new Error("Invalid invitation origin.");
    }
    inviteUrl = new URL("/accept-invitation", baseUrl.origin);
  } catch {
    throw new InvitationDeliveryError("Invitation email delivery is not configured.");
  }
  inviteUrl.hash = `token=${token}`;

  const safeOrganizationName = escapeHtml(organizationName);
  const safeRole = escapeHtml(role.toLowerCase());
  const safeInviteUrl = escapeHtml(inviteUrl.toString());
  const response = await fetcher("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: `Invitation to join ${organizationName}`,
      text: `You have been invited to join ${organizationName} as ${role.toLowerCase()}. Accept the invitation: ${inviteUrl.toString()}`,
      html: `<p>You have been invited to join ${safeOrganizationName} as ${safeRole}.</p><p><a href="${safeInviteUrl}">Accept invitation</a></p><p>This link expires in 7 days and can only be used once.</p>`,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new InvitationDeliveryError("Invitation email could not be delivered.");
  }
}
