"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError, api, type ApiMembershipRole, type ApiTeam } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Mail, Plus, Search, Trash2, UserPlus } from "lucide-react";

const roles: ApiMembershipRole[] = ["OWNER", "ADMIN", "MANAGER", "MEMBER"];
const invitationRoles: Exclude<ApiMembershipRole, "OWNER">[] = ["ADMIN", "MANAGER", "MEMBER"];

function errorMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 401) {
    return "Your session expired. Sign in again to manage this organization.";
  }
  return error instanceof Error ? error.message : "The team request could not be completed.";
}

function roleLabel(role: ApiMembershipRole) {
  return role[0] + role.slice(1).toLowerCase();
}

function displayDate(value: string) {
  return new Date(value).toLocaleDateString();
}

export default function TeamPage() {
  const [team, setTeam] = useState<ApiTeam | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Exclude<ApiMembershipRole, "OWNER">>("MEMBER");
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const loadTeam = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTeam(await api.team.get());
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadTeam(), 0);
    return () => window.clearTimeout(timer);
  }, [loadTeam]);

  const members = useMemo(() => {
    if (!team) return [];
    const query = search.trim().toLowerCase();
    return team.members.filter((member) =>
      (!roleFilter || member.role === roleFilter) &&
      (!query || `${member.user.name} ${member.user.email}`.toLowerCase().includes(query)),
    );
  }, [team, search, roleFilter]);

  const runAction = async (key: string, action: () => Promise<unknown>, successMessage: string) => {
    setBusyAction(key);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(successMessage);
      await loadTeam();
    } catch (actionError) {
      setError(errorMessage(actionError));
    } finally {
      setBusyAction(null);
    }
  };

  const handleInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusyAction("invite");
    setError(null);
    setNotice(null);
    try {
      const result = await api.team.invite(inviteEmail, inviteRole);
      setNotice(result.message);
      setInviteEmail("");
      setInviteOpen(false);
      await loadTeam();
    } catch (inviteError) {
      setError(errorMessage(inviteError));
    } finally {
      setBusyAction(null);
    }
  };

  const canChangeTargetRole = (role: ApiMembershipRole, isSelf: boolean) =>
    Boolean(
      team?.canManage &&
      !isSelf &&
      (team.currentRole === "OWNER" || (
        role !== "OWNER" &&
        role !== "ADMIN"
      )),
    );

  const canRemoveTarget = (role: ApiMembershipRole, isSelf: boolean) =>
    Boolean(
      team?.canManage &&
      !isSelf &&
      (team.currentRole === "OWNER" || (role !== "OWNER" && role !== "ADMIN")),
    );

  const currentUserId = team?.currentUserId;
  const pendingCount = team?.invitations.filter((invite) => invite.status === "PENDING").length ?? 0;
  const summary = [
    { label: "Total Members", value: team?.members.length ?? 0, icon: "👥", tone: "primary" },
    { label: "Owners", value: team?.members.filter((member) => member.role === "OWNER").length ?? 0, icon: "🛡️", tone: "info" },
    { label: "Admins", value: team?.members.filter((member) => member.role === "ADMIN").length ?? 0, icon: "👑", tone: "success" },
    { label: "Pending Invites", value: pendingCount, icon: "✉️", tone: "warning" },
  ];

  return (
    <div className="team-page">
      <div className="team-header">
        <div>
          <h1 className="dashboard-title">Team Management</h1>
          <p className="dashboard-subtitle">Manage members, roles, and invitations for your organization.</p>
        </div>
        <div className="team-header-actions">
          <label className="search-bar">
            <Search className="search-icon" size={18} />
            <input
              aria-label="Search team members"
              className="search-input"
              placeholder="Search team members..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className="action-buttons">
            <Button
              className="invite-button"
              disabled={!team?.canManage || loading}
              onClick={() => setInviteOpen(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Invite Member
            </Button>
          </div>
        </div>
      </div>

      {!loading && team && !team.canManage && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="status">
          You can view this team, but only an organization owner or administrator can invite, change roles, or remove members.
        </div>
      )}
      {notice && <div className="mb-4 rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-900" role="status">{notice}</div>}
      {error && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900" role="alert">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => void loadTeam()}>Retry</Button>
        </div>
      )}

      <div className="kpi-grid">
        {summary.map((card) => (
          <div key={card.label} className="kpi-card">
            <div className={`kpi-icon ${card.tone}`}>{card.icon}</div>
            <div className="kpi-value">{loading ? "—" : card.value}</div>
            <div className="kpi-label">{card.label}</div>
          </div>
        ))}
      </div>

      <Card className="team-card">
        <CardHeader>
          <div className="d-flex justify-between align-center">
            <CardTitle>Team Members</CardTitle>
            <div className="d-flex gap-2">
              <select
                className="form-control"
                aria-label="Filter roles"
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value)}
              >
                <option value="">All Roles</option>
                {roles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="table-container">
            <Table className="team-table">
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={5} className="py-8 text-center">Loading team members...</TableCell></TableRow>
                ) : error && !team ? (
                  <TableRow><TableCell colSpan={5} role="alert" className="py-8 text-center">{error}</TableCell></TableRow>
                ) : members.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    {team?.members.length ? "No members match your search or role filter." : "No team members are available."}
                  </TableCell></TableRow>
                ) : members.map((member) => {
                  const isSelf = member.user.id === currentUserId;
                  const canEditRole = canChangeTargetRole(member.role, isSelf);
                  const allowedRoles = team?.currentRole === "OWNER"
                    ? roles
                    : roles.filter((role) => role === "MANAGER" || role === "MEMBER");
                  return (
                    <TableRow key={member.id} className="table-row">
                      <TableCell>
                        <div className="d-flex align-center gap-3">
                          <div className="user-avatar">{member.user.name.split(" ").map((word) => word[0]).join("")}</div>
                          <div>
                            <div className="user-name">{member.user.name}{isSelf ? " (you)" : ""}</div>
                            <div className="text-muted user-email">{member.user.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {canEditRole ? (
                          <select
                            aria-label={`Role for ${member.user.name}`}
                            className="form-control"
                            value={member.role}
                            disabled={busyAction === member.id}
                            onChange={(event) => {
                              const role = allowedRoles.find((candidate) => candidate === event.target.value);
                              if (role) {
                                void runAction(member.id, () => api.team.updateMemberRole(member.id, role), "Member role updated.");
                              }
                            }}
                          >
                            {allowedRoles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
                          </select>
                        ) : (
                          <span className={`badge badge-role ${member.role.toLowerCase()}`}>{roleLabel(member.role)}</span>
                        )}
                      </TableCell>
                      <TableCell><span className="badge badge-status badge-success">Active</span></TableCell>
                      <TableCell>{displayDate(member.createdAt)}</TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!canRemoveTarget(member.role, isSelf) || busyAction === member.id}
                          title={isSelf ? "You cannot remove your own membership" : undefined}
                          onClick={() => {
                            if (window.confirm(`Remove ${member.user.name} from this organization?`)) {
                              void runAction(member.id, () => api.team.removeMember(member.id), "Member removed.");
                            }
                          }}
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="team-card mt-6">
        <CardHeader><CardTitle>Invitations</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading invitations...</p>
          ) : !team?.invitations.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No invitations have been created.</p>
          ) : (
            <div className="table-container">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {team.invitations.map((invitation) => (
                    <TableRow key={invitation.id}>
                      <TableCell><span className="inline-flex items-center gap-2"><Mail size={14} />{invitation.email}</span></TableCell>
                      <TableCell>{roleLabel(invitation.role)}</TableCell>
                      <TableCell><span className={`badge badge-status ${invitation.status === "PENDING" ? "badge-warning" : invitation.status === "ACCEPTED" ? "badge-success" : ""}`}>{invitation.status}</span></TableCell>
                      <TableCell>{displayDate(invitation.expiresAt)}</TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!team.canManage || invitation.status !== "PENDING" || busyAction === invitation.id}
                          onClick={() => void runAction(invitation.id, () => api.team.revokeInvitation(invitation.id), "Invitation revoked.")}
                        >
                          Revoke
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="invite-title" className="w-full max-w-lg rounded-xl border border-border bg-background p-6 shadow-xl">
            <div className="mb-5 flex items-center gap-3">
              <UserPlus className="h-5 w-5" />
              <h2 id="invite-title" className="text-lg font-semibold">Invite a team member</h2>
            </div>
            <form className="grid gap-4" onSubmit={(event) => void handleInvite(event)}>
              <label className="grid gap-1 text-sm">Email address
                <input
                  required
                  type="email"
                  maxLength={254}
                  className="rounded-md border border-border bg-background px-3 py-2"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                />
              </label>
              <label className="grid gap-1 text-sm">Organization role
                <select
                  className="rounded-md border border-border bg-background px-3 py-2"
                  value={inviteRole}
                  onChange={(event) => {
                    const role = invitationRoles.find((candidate) => candidate === event.target.value);
                    if (role) setInviteRole(role);
                  }}
                >
                  {invitationRoles
                    .filter((role) => team?.currentRole === "OWNER" || role !== "ADMIN")
                    .map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
                </select>
              </label>
              <p className="text-xs text-muted-foreground">
                Invitations expire after 7 days. Email delivery must be configured on the server; no invitation token is shown in this app.
              </p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={busyAction === "invite"}>
                  {busyAction === "invite" ? "Sending..." : "Send Invitation"}
                </Button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
