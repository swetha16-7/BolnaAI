export class ApiError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(
    message: string,
    status: number,
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export interface ApiUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface ApiAgent {
  id: string;
  name: string;
  type: string;
  timezone: string;
  languages: string[];
  provider: string | null;
  voiceName: string | null;
  speed: number | null;
  greeting: string | null;
  systemPrompt: string | null;
  fallback: string | null;
  kbLinks: string | null;
  kbFiles: unknown;
  kbFaqs: unknown;
  workingDays: string[];
  hoursStart: string | null;
  hoursEnd: string | null;
  holidays: string | null;
  callsToday: number;
  status: string;
  createdAt: string;
  retellAgentId: string | null;
}

export interface ApiRetellAgent {
  retellAgentId: string;
  name: string;
  channel: "voice" | "chat";
}

export interface ApiContactCall {
  id: string;
  externalCallId: string | null;
  status: string;
  direction: string;
  outcome: string | null;
  durationSeconds: number | null;
  startedAt: string | null;
  createdAt: string;
  transcript: string | null;
}

export interface ApiContact {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  title: string | null;
  source: string | null;
  status: string;
  value: string | null;
  lastContactAt: string | null;
  voiceConsentAt: string | null;
  voiceConsentSource: string | null;
  voiceConsentEvidence: string | null;
  voiceConsentRevokedAt: string | null;
  doNotCall: boolean;
  doNotCallAt: string | null;
  createdAt: string;
  updatedAt: string;
  calls?: ApiContactCall[];
  latestCall?: ApiContactCall | null;
  lastConversationAt?: string | null;
}

export interface ApiContactPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiContactPage {
  contacts: ApiContact[];
  pagination: ApiContactPagination;
}

export interface ApiCall {
  id: string;
  externalCallId?: string | null;
  agentId: string | null;
  callerNumber: string | null;
  destination: string | null;
  status: string;
  direction: string;
  outcome: string | null;
  transcript?: string | null;
  recordingUrl: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  durationSeconds: number | null;
  createdAt: string;
  startedAt: string | null;
  provider: string | null;
  agent: { id: string; name: string; languages?: string[] } | null;
  transcripts?: Array<{ id: string; sender: string; text: string; createdAt: string }>;
}

export interface ApiCallPage {
  calls: ApiCall[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiRetellCall {
  callId: string;
  agentId: string;
  agentName: string;
  callType: "phone_call" | "web_call";
  direction: "inbound" | "outbound" | null;
  status: string;
  fromNumber: string | null;
  toNumber: string | null;
  startTimestamp: number | null;
  endTimestamp: number | null;
  durationSeconds: number | null;
  transcript: string | null;
  summary: string | null;
  recordingUrl: string | null;
}

export interface ApiRetellCallPage {
  calls: ApiRetellCall[];
  hasMore: boolean;
  nextCursor: string | null;
}

export interface ApiRetellContact {
  contactId: string;
  firstName: string | null;
  lastName: string | null;
  phoneNumber: string;
  createdTimestamp: number;
  lastConversationTimestamp: number | null;
  conversationCount: number | null;
  doNotCall: boolean | null;
  email?: string | null;
  company?: string | null;
  title?: string | null;
  status?: string;
  crmId?: string | null;
  voiceConsentAt?: string | null;
  voiceConsentSource?: string | null;
  voiceConsentEvidence?: string | null;
  calls?: ApiContactCall[];
  latestCall?: ApiContactCall | null;
}

export interface ApiRetellContactPage {
  contacts: ApiRetellContact[];
  hasMore: boolean;
  nextCursor: string | null;
}

export interface ApiDashboard {
  metrics: {
    callsToday: number;
    activeAgents: number;
    contacts: number;
    appointments: number;
    averageDurationSeconds: number | null;
    totalCalls: number;
  };
  callsByDay: Array<{ name: string; inbound: number; outbound: number; other: number }>;
  recentCalls: ApiCall[];
}

export interface ApiAppointment {
  id: string;
  startsAt: string;
  endsAt: string | null;
  timezone?: string | null;
  status: string;
  serviceName: string | null;
  calcomEventId?: string | null;
  metadata?: Record<string, any> | null;
  contact: {
    id: string;
    firstName: string;
    lastName: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
}

export interface ApiCallerMessage {
  id: string;
  callerName: string;
  phoneNumber: string;
  email: string | null;
  message: string;
  reason?: string | null;
  isDnc: boolean;
  status: "pending" | "handled" | "archived";
  contactId: string | null;
  callId: string | null;
  createdAt: string;
}

export type ApiMembershipRole = "OWNER" | "ADMIN" | "MANAGER" | "MEMBER";

export interface ApiTeamMember {
  id: string;
  role: ApiMembershipRole;
  createdAt: string;
  user: { id: string; name: string; email: string };
}

export interface ApiTeamInvitation {
  id: string;
  email: string;
  role: ApiMembershipRole;
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  createdAt: string;
  expiresAt: string;
}

export interface ApiTeam {
  members: ApiTeamMember[];
  invitations: ApiTeamInvitation[];
  currentRole: ApiMembershipRole;
  currentUserId: string;
  canManage: boolean;
}

export interface ApiProviderConfiguration {
  status: "configured" | "missing_configuration" | "invalid_configuration";
  missing: string[];
  invalid: string[];
}

export interface ApiProviderConfigurationStatus {
  providers: {
    retell: ApiProviderConfiguration;
    twilio: ApiProviderConfiguration;
    calcom: ApiProviderConfiguration;
  };
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  fetcher: typeof fetch = fetch,
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetcher(path, {
    ...init,
    headers,
    credentials: "same-origin",
    cache: "no-store",
  });
  const payload: unknown = response.status === 204 ? null : await response.json();

  if (!response.ok) {
    const body = payload && typeof payload === "object" ? payload : {};
    const errorValue = "error" in body ? body.error : null;
    const message = typeof errorValue === "string"
      ? errorValue
      : "The request could not be completed.";
    const details = "details" in body ? body.details : undefined;
    throw new ApiError(message, response.status, details);
  }

  return payload as T;
}

function jsonBody(value: unknown): string {
  return JSON.stringify(value);
}

export const api = {
  auth: {
    session: () => apiRequest<{ authenticated: boolean; user?: ApiUser }>("/api/auth/session"),
    login: (email: string, password: string) =>
      apiRequest<{ user: ApiUser }>("/api/auth/login", {
        method: "POST",
        body: jsonBody({ email, password }),
      }),
    register: (input: { name: string; organizationName?: string; email: string; password: string }) =>
      apiRequest<{ user: ApiUser }>("/api/auth/register", {
        method: "POST",
        body: jsonBody(input),
      }),
    logout: () => apiRequest<{ success: true }>("/api/auth/logout", { method: "POST" }),
  },
  agents: {
    list: () => apiRequest<{ agents: ApiAgent[] }>("/api/agents"),
    listRetell: () => apiRequest<{ agents: ApiRetellAgent[] }>("/api/agents/retell"),
    linkRetell: (agentId: string, retellAgentId: string) =>
      apiRequest<{ agent: ApiAgent }>(
        `/api/agents/${encodeURIComponent(agentId)}/retell-link`,
        { method: "POST", body: jsonBody({ retellAgentId }) },
      ),
    create: (agent: Record<string, unknown>) =>
      apiRequest<{ agent: ApiAgent }>("/api/agents", { method: "POST", body: jsonBody(agent) }),
    update: (id: string, agent: Record<string, unknown>) =>
      apiRequest<{ agent: ApiAgent }>(`/api/agents/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: jsonBody(agent),
      }),
    archive: (id: string) =>
      apiRequest<{ success: true; archived: true }>(`/api/agents/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
  },
  contacts: {
    list: (
      queryOrParams: string | URLSearchParams | { query?: string; status?: string; page?: number; pageSize?: number; dnc?: string } = "",
      status = "",
      page?: number,
      pageSize?: number,
      dnc = "",
      fetcher: typeof fetch = fetch,
    ) => {
      let params: URLSearchParams;
      if (typeof queryOrParams === "string") {
        params = new URLSearchParams();
        if (queryOrParams) params.set("q", queryOrParams);
        if (status) params.set("status", status);
        if (page !== undefined) params.set("page", String(page));
        if (pageSize !== undefined) params.set("pageSize", String(pageSize));
        if (dnc) params.set("dnc", dnc);
      } else if (queryOrParams instanceof URLSearchParams) {
        params = queryOrParams;
      } else {
        params = new URLSearchParams();
        if (queryOrParams.query) params.set("q", queryOrParams.query);
        if (queryOrParams.status) params.set("status", queryOrParams.status);
        if (queryOrParams.page !== undefined) params.set("page", String(queryOrParams.page));
        if (queryOrParams.pageSize !== undefined) params.set("pageSize", String(queryOrParams.pageSize));
        if (queryOrParams.dnc) params.set("dnc", queryOrParams.dnc);
      }
      const suffix = params.size ? `?${params.toString()}` : "";
      return apiRequest<ApiContactPage>(`/api/contacts${suffix}`, {}, fetcher);
    },
    create: (contact: Record<string, unknown>, fetcher: typeof fetch = fetch) =>
      apiRequest<{ contact: ApiContact }>("/api/contacts", {
        method: "POST",
        body: jsonBody(contact),
      }, fetcher),
    update: (id: string, contact: Record<string, unknown>, fetcher: typeof fetch = fetch) =>
      apiRequest<{ contact: ApiContact }>(`/api/contacts/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: jsonBody(contact),
      }, fetcher),
    delete: (id: string, fetcher: typeof fetch = fetch) =>
      apiRequest<{ success: true; archived: true }>(`/api/contacts/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }, fetcher),
  },
  calls: {
    list: (params: URLSearchParams) =>
      apiRequest<ApiCallPage>(`/api/calls${params.size ? `?${params.toString()}` : ""}`),
    active: () => apiRequest<ApiCallPage>("/api/calls?status=active&pageSize=50"),
    create: (
      input: {
        agentId: string;
        contactId?: string | null;
        destination: string;
        consentConfirmed: true;
        idempotencyKey: string;
      },
      fetcher: typeof fetch = fetch,
    ) =>
      apiRequest<{ call: ApiCall; status: string; replayed?: boolean; error?: string }>("/api/calls", {
        method: "POST",
        headers: { "Idempotency-Key": input.idempotencyKey },
        body: jsonBody({
          agentId: input.agentId,
          ...(input.contactId ? { contactId: input.contactId } : {}),
          destination: input.destination,
          consentConfirmed: input.consentConfirmed,
        }),
      }, fetcher),
    stop: (callId: string) =>
      apiRequest<{ success: boolean; status: string }>(`/api/calls/${encodeURIComponent(callId)}/stop`, {
        method: "POST",
      }),
    intervene: (callId: string, message: string) =>
      apiRequest<{ success: boolean }>(`/api/calls/${encodeURIComponent(callId)}/intervene`, {
        method: "POST",
        body: jsonBody({ message }),
      }),
    listen: (callId: string) =>
      apiRequest<{ success: boolean; accessToken?: string }>(`/api/calls/${encodeURIComponent(callId)}/listen`, {
        method: "POST",
      }),
  },
  retellCalls: {
    list: (params: URLSearchParams) =>
      apiRequest<ApiRetellCallPage>(`/api/retell/calls${params.size ? `?${params.toString()}` : ""}`),
    detail: (callId: string) =>
      apiRequest<{ call: ApiRetellCall }>(
        `/api/retell/calls/${encodeURIComponent(callId)}`,
      ),
  },
  retellContacts: {
    list: (params: URLSearchParams) =>
      apiRequest<ApiRetellContactPage>(
        `/api/retell/contacts${params.size ? `?${params.toString()}` : ""}`,
      ),
  },
  dashboard: {
    get: () => apiRequest<ApiDashboard>("/api/dashboard"),
  },
  appointments: {
    list: () => apiRequest<{ appointments: ApiAppointment[] }>("/api/appointments"),
  },
  messages: {
    list: (fetcher: typeof fetch = fetch) =>
      apiRequest<{ messages: ApiCallerMessage[] }>("/api/messages", {}, fetcher),
    updateStatus: (id: string, status: "pending" | "handled" | "archived", fetcher: typeof fetch = fetch) =>
      apiRequest<{ success: true; message: ApiCallerMessage }>(`/api/messages/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: jsonBody({ status }),
      }, fetcher),
  },
  providers: {
    configurationStatus: () =>
      apiRequest<ApiProviderConfigurationStatus>("/api/settings/providers"),
  },
  team: {
    get: () => apiRequest<ApiTeam>("/api/team"),
    invite: (email: string, role: Exclude<ApiMembershipRole, "OWNER">) =>
      apiRequest<{ message: string }>("/api/team", {
        method: "POST",
        body: jsonBody({ email, role }),
      }),
    updateMemberRole: (membershipId: string, role: ApiMembershipRole) =>
      apiRequest<{ member: ApiTeamMember }>(`/api/team/members/${encodeURIComponent(membershipId)}`, {
        method: "PATCH",
        body: jsonBody({ role }),
      }),
    removeMember: (membershipId: string) =>
      apiRequest<{ success: true }>(`/api/team/members/${encodeURIComponent(membershipId)}`, {
        method: "DELETE",
      }),
    revokeInvitation: (invitationId: string) =>
      apiRequest<{ success: true }>(`/api/team/invitations/${encodeURIComponent(invitationId)}`, {
        method: "DELETE",
      }),
    acceptInvitation: (input: { token: string; name?: string; password?: string }) =>
      apiRequest<{ success: true }>("/api/team/invitations/accept", {
        method: "POST",
        body: jsonBody(input),
      }),
  },
};
