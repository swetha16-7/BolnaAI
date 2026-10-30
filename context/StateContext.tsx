"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  ApiError,
  api,
  type ApiAgent,
  type ApiAppointment,
  type ApiCall,
  type ApiCallerMessage,
  type ApiContact,
  type ApiDashboard,
  type ApiRetellContact,
  type ApiUser,
} from "@/lib/api-client";

export interface FAQ {
  q: string;
  a: string;
}

export interface KBFile {
  name: string;
  size: string;
  progress: number;
}

export interface Agent {
  id: string;
  name: string;
  type: string;
  timezone: string;
  languages: string[];
  provider: string;
  retellAgentId: string;
  voiceName: string;
  speed: number;
  greeting: string;
  systemPrompt: string;
  fallback: string;
  kbFiles: KBFile[];
  kbFaqs: FAQ[];
  kbLinks: string;
  workingDays: string[];
  hoursStart: string;
  hoursEnd: string;
  holidays: string;
  callsToday: number;
  status: "active" | "paused";
  createdDate: string;
}

export interface TranscriptMessage {
  sender: "agent" | "customer" | "admin" | "transcript";
  text: string;
}

export interface Call {
  id: string;
  caller: string;
  direction: string;
  agentId: string;
  agentName: string;
  language: string;
  duration: string;
  outcome: string;
  recordingUrl: string | null;
  timestamp: string;
  sentiment: string;
  transcript: TranscriptMessage[];
  status: string;
  provider: string | null;
  failureMessage: string | null;
}

export interface ActiveCall {
  id: string;
  caller: string;
  agentId: string;
  agentName: string;
  language: string;
  durationSeconds: number;
  sentimentScore: number;
  transcriptIndex: number;
  interventionMode: boolean;
  transcript: TranscriptMessage[];
  status?: string;
}

export interface ContactRecord {
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
  calls?: import("@/lib/api-client").ApiContactCall[];
  latestCall?: import("@/lib/api-client").ApiContactCall | null;
  lastConversationAt?: string | null;
  conversationCount?: number | null;
}

export interface Settings {
  apiKokoro: string;
  apiQwen: string;
  webhookStatus: string;
  webhookStream: string;
  recordingFormat: string;
}

export interface Profile {
  username: string;
  email: string;
  role: string;
  mfa: string;
}

export interface ActivityLog {
  text: string;
  time: string;
}

export interface Notification {
  id: number;
  type: "info" | "warning" | "error";
  message: string;
  time: string;
  read: boolean;
}

export interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

interface CallPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ContactPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface StateContextType {
  user: ApiUser | null;
  authStatus: "loading" | "authenticated" | "unauthenticated" | "error";
  authError: string | null;
  signIn: (email: string, password: string) => Promise<boolean>;
  register: (input: { name: string; organizationName?: string; email: string; password: string }) => Promise<boolean>;
  logout: () => Promise<boolean>;
  checkSession: () => Promise<void>;
  agents: Agent[];
  agentsLoading: boolean;
  agentsError: string | null;
  refreshAgents: () => Promise<void>;
  calls: Call[];
  callsLoading: boolean;
  callsError: string | null;
  callPagination: CallPagination;
  loadCalls: (params?: URLSearchParams) => Promise<void>;
  createCall: (input: {
    agentId: string;
    contactId?: string | null;
    destination: string;
    consentConfirmed: true;
    idempotencyKey: string;
  }) => Promise<ApiCall | null>;
  activeCalls: ActiveCall[];
  activeCallsLoading: boolean;
  activeCallsError: string | null;
  loadActiveCalls: () => Promise<void>;
  contacts: ContactRecord[];
  contactsLoading: boolean;
  contactsError: string | null;
  contactsPagination: ContactPagination;
  loadContacts: (query?: string, status?: string, page?: number, pageSize?: number, dnc?: string) => Promise<void>;
  addContact: (contact: Record<string, unknown>) => Promise<boolean>;
  updateContact: (id: string, contact: Record<string, unknown>) => Promise<boolean>;
  deleteContact: (id: string) => Promise<boolean>;
  appointments: ApiAppointment[];
  appointmentsLoading: boolean;
  appointmentsError: string | null;
  loadAppointments: () => Promise<void>;
  messages: ApiCallerMessage[];
  messagesLoading: boolean;
  messagesError: string | null;
  loadMessages: () => Promise<void>;
  updateMessageStatus: (id: string, status: "pending" | "handled" | "archived") => Promise<boolean>;
  dashboard: ApiDashboard | null;
  dashboardLoading: boolean;
  dashboardError: string | null;
  refreshDashboard: () => Promise<void>;
  settings: Settings;
  profile: Profile;
  activityLogs: ActivityLog[];
  notifications: Notification[];
  selectedLiveCallId: string | null;
  setSelectedLiveCallId: (id: string | null) => void;
  toasts: Toast[];
  showToast: (message: string, type?: "success" | "error" | "info") => void;
  removeToast: (id: string) => void;
  addAgent: (agent: Agent) => Promise<boolean>;
  updateAgent: (agent: Agent) => Promise<boolean>;
  deleteAgent: (id: string) => Promise<boolean>;
  toggleAgentStatus: (id: string) => Promise<boolean>;
  duplicateAgent: (id: string) => Promise<boolean>;
  saveSettings: (settings: Settings) => void;
  saveProfile: (profile: Partial<Profile>) => void;
  addActivityLog: (text: string) => void;
  changePassword: () => void;
  markAllNotificationsRead: () => void;
  listenInCall: (id: string) => void;
  takeoverCall: (id: string) => void;
  cancelTakeoverCall: (id: string) => void;
  sendInterventionMsg: (id: string, text: string) => void;
  endCallManually: (id: string) => void;
  terminalLogs: string[];
  addTerminalLog: (message: string, type?: "success" | "warning" | "danger" | "info") => void;
}

const StateContext = createContext<StateContextType | undefined>(undefined);

function jsonArray<T>(value: unknown, isValue: (item: unknown) => item is T): T[] {
  return Array.isArray(value) ? value.filter(isValue) : [];
}

function isKBFile(value: unknown): value is KBFile {
  return Boolean(
    value &&
    typeof value === "object" &&
    "name" in value &&
    typeof value.name === "string" &&
    "size" in value &&
    typeof value.size === "string" &&
    "progress" in value &&
    typeof value.progress === "number",
  );
}

function isFAQ(value: unknown): value is FAQ {
  return Boolean(
    value &&
    typeof value === "object" &&
    "q" in value &&
    typeof value.q === "string" &&
    "a" in value &&
    typeof value.a === "string",
  );
}

function mapAgent(agent: ApiAgent): Agent {
  return {
    id: agent.id,
    name: agent.name,
    type: agent.type,
    timezone: agent.timezone,
    languages: agent.languages,
    provider: agent.provider ?? "Unconfigured",
    retellAgentId: agent.retellAgentId ?? "",
    voiceName: agent.voiceName ?? "Unconfigured",
    speed: agent.speed ?? 1,
    greeting: agent.greeting ?? "",
    systemPrompt: agent.systemPrompt ?? "",
    fallback: agent.fallback ?? "",
    kbFiles: jsonArray(agent.kbFiles, isKBFile),
    kbFaqs: jsonArray(agent.kbFaqs, isFAQ),
    kbLinks: agent.kbLinks ?? "",
    workingDays: agent.workingDays,
    hoursStart: agent.hoursStart ?? "",
    hoursEnd: agent.hoursEnd ?? "",
    holidays: agent.holidays ?? "",
    callsToday: agent.callsToday,
    status: agent.status === "active" ? "active" : "paused",
    createdDate: agent.createdAt.slice(0, 10),
  };
}

function mapCall(call: ApiCall): Call {
  const transcript: TranscriptMessage[] = (call.transcripts ?? []).map((message): TranscriptMessage => ({
    sender: message.sender === "customer" || message.sender === "admin"
      ? message.sender
      : "agent",
    text: message.text,
  }));
  if (call.transcript && (!call.transcripts || call.transcripts.length === 0)) {
    transcript.push({ sender: "transcript", text: call.transcript });
  }

  return {
    id: call.id,
    caller: call.destination ?? call.callerNumber ?? "Unknown caller",
    direction: call.direction,
    agentId: call.agentId ?? "",
    agentName: call.agent?.name ?? "Unassigned",
    language: call.agent?.languages?.[0] ?? "Not recorded",
    duration: call.durationSeconds === null
      ? "Not recorded"
      : `${Math.floor(call.durationSeconds / 60)}m ${String(call.durationSeconds % 60).padStart(2, "0")}s`,
    outcome: call.outcome ?? call.status,
    recordingUrl: call.recordingUrl ?? null,
    timestamp: call.startedAt ?? call.createdAt,
    sentiment: "Not recorded",
    status: call.status,
    provider: call.provider,
    failureMessage: call.failureMessage ?? null,
    transcript,
  };
}

function parseTranscriptText(transcriptText: string | null | undefined): TranscriptMessage[] {
  if (!transcriptText || !transcriptText.trim()) return [];
  const lines = transcriptText.split("\n").map((l) => l.trim()).filter(Boolean);
  const messages: TranscriptMessage[] = [];
  for (const line of lines) {
    if (/^agent:\s*/i.test(line)) {
      messages.push({ sender: "agent", text: line.replace(/^agent:\s*/i, "") });
    } else if (/^(customer|user):\s*/i.test(line)) {
      messages.push({ sender: "customer", text: line.replace(/^(customer|user):\s*/i, "") });
    } else if (/^admin:\s*/i.test(line)) {
      messages.push({ sender: "admin", text: line.replace(/^admin:\s*/i, "") });
    } else {
      messages.push({ sender: "transcript", text: line });
    }
  }
  return messages.length > 0 ? messages : [{ sender: "transcript", text: transcriptText }];
}

function mapApiCallToActiveCall(call: ApiCall): ActiveCall {
  let transcript: TranscriptMessage[] = (call.transcripts ?? []).map((message): TranscriptMessage => ({
    sender: message.sender === "customer" || message.sender === "admin"
      ? message.sender
      : "agent",
    text: message.text,
  }));

  if (transcript.length === 0 && call.transcript) {
    transcript = parseTranscriptText(call.transcript);
  }

  let durationSeconds = 0;
  if (typeof call.durationSeconds === "number" && call.durationSeconds >= 0) {
    durationSeconds = call.durationSeconds;
  } else if (call.startedAt) {
    const startedMs = new Date(call.startedAt).getTime();
    if (!Number.isNaN(startedMs)) {
      durationSeconds = Math.max(0, Math.floor((Date.now() - startedMs) / 1000));
    }
  }

  return {
    id: call.id,
    caller: call.destination ?? call.callerNumber ?? "Unknown caller",
    agentId: call.agentId ?? "",
    agentName: call.agent?.name ?? "Unassigned",
    language: call.agent?.languages?.[0] ?? "English",
    durationSeconds,
    sentimentScore: 50,
    transcriptIndex: transcript.length,
    interventionMode: false,
    transcript,
    status: call.status,
  };
}

function mapContact(contact: ApiContact): ContactRecord {
  return {
    id: contact.id,
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email,
    phone: contact.phone,
    company: contact.company,
    title: contact.title,
    source: contact.source,
    status: contact.status,
    value: contact.value,
    lastContactAt: contact.lastContactAt,
    voiceConsentAt: contact.voiceConsentAt,
    voiceConsentSource: contact.voiceConsentSource,
    voiceConsentEvidence: contact.voiceConsentEvidence,
    voiceConsentRevokedAt: contact.voiceConsentRevokedAt,
    doNotCall: contact.doNotCall,
    doNotCallAt: contact.doNotCallAt,
    createdAt: contact.createdAt,
    calls: contact.calls ?? [],
    latestCall: contact.latestCall ?? null,
    lastConversationAt: contact.lastConversationAt ?? contact.lastContactAt ?? null,
    conversationCount: contact.calls ? contact.calls.length : 0,
  };
}

function mapRetellContact(contact: ApiRetellContact): ContactRecord {
  const lastConversationIso = contact.lastConversationTimestamp
    ? new Date(contact.lastConversationTimestamp).toISOString()
    : null;
  const nameParts = [contact.firstName, contact.lastName].filter(Boolean);

  return {
    id: contact.contactId,
    firstName: contact.firstName || (nameParts.length === 0 ? "Unnamed contact" : ""),
    lastName: contact.lastName ?? null,
    email: contact.email ?? null,
    phone: contact.phoneNumber,
    company: contact.company ?? null,
    title: contact.title ?? null,
    source: "Directory",
    status: contact.status ?? "new",
    value: null,
    lastContactAt: lastConversationIso,
    voiceConsentAt: contact.voiceConsentAt ?? null,
    voiceConsentSource: contact.voiceConsentSource ?? null,
    voiceConsentEvidence: contact.voiceConsentEvidence ?? null,
    voiceConsentRevokedAt: null,
    doNotCall: Boolean(contact.doNotCall),
    doNotCallAt: null,
    createdAt: contact.createdTimestamp
      ? new Date(contact.createdTimestamp).toISOString()
      : new Date().toISOString(),
    calls: contact.calls ?? [],
    latestCall: contact.latestCall ?? null,
    lastConversationAt: lastConversationIso,
    conversationCount: contact.conversationCount ?? (contact.calls ? contact.calls.length : 0),
  };
}

function toAgentInput(agent: Agent): Record<string, unknown> {
  return {
    name: agent.name,
    type: agent.type,
    timezone: agent.timezone,
    languages: agent.languages,
    provider: agent.provider,
    voiceName: agent.voiceName,
    speed: agent.speed,
    greeting: agent.greeting,
    systemPrompt: agent.systemPrompt,
    fallback: agent.fallback,
    kbLinks: agent.kbLinks,
    kbFiles: agent.kbFiles,
    kbFaqs: agent.kbFaqs,
    workingDays: agent.workingDays,
    hoursStart: agent.hoursStart,
    hoursEnd: agent.hoursEnd,
    holidays: agent.holidays,
    status: agent.status,
  };
}

export const StateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [authStatus, setAuthStatus] = useState<StateContextType["authStatus"]>("loading");
  const [authError, setAuthError] = useState<string | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [calls, setCalls] = useState<Call[]>([]);
  const [callsLoading, setCallsLoading] = useState(false);
  const [callsError, setCallsError] = useState<string | null>(null);
  const [callPagination, setCallPagination] = useState<CallPagination>({
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 0,
  });
  const [activeCalls, setActiveCalls] = useState<ActiveCall[]>([]);
  const [activeCallsLoading, setActiveCallsLoading] = useState(false);
  const [activeCallsError, setActiveCallsError] = useState<string | null>(null);
  const activeCallsRequestRef = useRef(0);
  const activeCallsRef = useRef<ActiveCall[]>([]);
  useEffect(() => {
    activeCallsRef.current = activeCalls;
  }, [activeCalls]);
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [contactsPagination, setContactsPagination] = useState<ContactPagination>({
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 1,
  });
  const [appointments, setAppointments] = useState<StateContextType["appointments"]>([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [appointmentsError, setAppointmentsError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ApiCallerMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<ApiDashboard | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>({
    apiKokoro: "",
    apiQwen: "",
    webhookStatus: "/api/webhooks/twilio",
    webhookStream: "",
    recordingFormat: "mp3",
  });
  const [profile, setProfile] = useState<Profile>({
    username: "",
    email: "",
    role: "",
    mfa: "Not configured",
  });
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [selectedLiveCallId, setSelectedLiveCallId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);

  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    setToasts((previous) => [...previous, { id, message, type }]);
    setTimeout(() => setToasts((previous) => previous.filter((toast) => toast.id !== id)), 4300);
  };

  const removeToast = (id: string) => {
    setToasts((previous) => previous.filter((toast) => toast.id !== id));
  };

  const addTerminalLog = (
    message: string,
    type: "success" | "warning" | "danger" | "info" = "success",
  ) => {
    const time = new Date().toLocaleTimeString([], { hour12: false });
    setTerminalLogs((previous) => [...previous, `[${time}] ${type}: ${message}`].slice(-50));
  };

  const expireSession = useCallback((message: string | null = "Your session expired. Please sign in again.") => {
    setUser(null);
    setAuthStatus("unauthenticated");
    setAuthError(message);
    setAgents([]);
    setCalls([]);
    setContacts([]);
    setAppointments([]);
    setMessages([]);
    setDashboard(null);
    setProfile({ username: "", email: "", role: "", mfa: "Not configured" });
  }, []);

  const reportLoadError = useCallback((
    error: unknown,
    fallback: string,
    setError: (message: string | null) => void,
  ) => {
    if (error instanceof ApiError && error.status === 401) {
      expireSession();
      return;
    }
    setError(error instanceof Error ? error.message : fallback);
  }, [expireSession]);

  const reportMutationError = (error: unknown, fallback: string) => {
    if (error instanceof ApiError && error.status === 401) {
      expireSession();
      return;
    }
    showToast(error instanceof Error ? error.message : fallback, "error");
  };

  const refreshAgents = useCallback(async () => {
    setAgentsLoading(true);
    setAgentsError(null);
    try {
      const result = await api.agents.list();
      setAgents(result.agents.map(mapAgent));
    } catch (error) {
      reportLoadError(error, "Unable to load agents.", setAgentsError);
    } finally {
      setAgentsLoading(false);
    }
  }, [reportLoadError]);

  const loadContacts = useCallback(async (query = "", status = "", page = 1, pageSize = 25, dnc = "") => {
    setContactsLoading(true);
    setContactsError(null);
    try {
      const params = new URLSearchParams({ pageSize: String(pageSize) });
      if (query) params.set("q", query);
      if (status) params.set("status", status);
      if (dnc) params.set("dnc", dnc);
      if (page) params.set("page", String(page));

      let loadedFromProvider = false;
      try {
        const providerResult = await api.retellContacts.list(params);
        if (Array.isArray(providerResult.contacts)) {
          setContacts(providerResult.contacts.map(mapRetellContact));
          setContactsPagination({
            page,
            pageSize,
            total: providerResult.contacts.length,
            totalPages: providerResult.hasMore ? page + 1 : 1,
          });
          loadedFromProvider = true;
        }
      } catch {
        // Fall back to CRM contacts if provider API is not configured or errors
      }

      if (!loadedFromProvider) {
        const result = await api.contacts.list(query, status, page, pageSize, dnc);
        setContacts(result.contacts.map(mapContact));
        if (result.pagination) {
          setContactsPagination(result.pagination);
        }
      }
    } catch (error) {
      reportLoadError(error, "Unable to load contacts.", setContactsError);
    } finally {
      setContactsLoading(false);
    }
  }, [reportLoadError]);

  const loadCalls = useCallback(async (params = new URLSearchParams()) => {
    setCallsLoading(true);
    setCallsError(null);
    try {
      const result = await api.calls.list(params);
      setCalls(result.calls.map(mapCall));
      setCallPagination(result.pagination);
    } catch (error) {
      reportLoadError(error, "Unable to load call history.", setCallsError);
    } finally {
      setCallsLoading(false);
    }
  }, [reportLoadError]);

  const refreshDashboard = useCallback(async () => {
    setDashboardLoading(true);
    setDashboardError(null);
    try {
      setDashboard(await api.dashboard.get());
    } catch (error) {
      reportLoadError(error, "Unable to load dashboard metrics.", setDashboardError);
    } finally {
      setDashboardLoading(false);
    }
  }, [reportLoadError]);

  const loadActiveCalls = useCallback(async () => {
    const requestId = ++activeCallsRequestRef.current;
    setActiveCallsLoading(true);
    setActiveCallsError(null);
    try {
      const result = await api.calls.active();
      if (requestId === activeCallsRequestRef.current) {
        const mapped = result.calls.map(mapApiCallToActiveCall);
        const previousActiveCount = activeCallsRef.current.length;
        setActiveCalls(mapped);
        if (previousActiveCount > 0 && mapped.length < previousActiveCount) {
          void loadCalls();
          void refreshDashboard();
        }
      }
    } catch (error) {
      if (requestId === activeCallsRequestRef.current) {
        reportLoadError(error, "Unable to load active calls.", setActiveCallsError);
      }
    } finally {
      if (requestId === activeCallsRequestRef.current) {
        setActiveCallsLoading(false);
      }
    }
  }, [loadCalls, refreshDashboard, reportLoadError]);

  const createCall = async (input: {
    agentId: string;
    contactId?: string | null;
    destination: string;
    consentConfirmed: true;
    idempotencyKey: string;
  }) => {
    try {
      const result = await api.calls.create(input);
      const mapped = mapCall(result.call);
      setCalls((previous) => [mapped, ...previous.filter((call) => call.id !== mapped.id)]);
      showToast(`Call status: ${result.status.replaceAll("_", " ")}.`, "info");
      await Promise.all([loadCalls(), loadActiveCalls(), refreshDashboard()]);
      return result.call;
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        await Promise.all([loadCalls(), loadActiveCalls(), refreshDashboard()]);
      }
      reportMutationError(error, "Unable to place call.");
      return null;
    }
  };

  const loadAppointments = useCallback(async () => {
    setAppointmentsLoading(true);
    setAppointmentsError(null);
    try {
      const result = await api.appointments.list();
      setAppointments(Array.isArray(result?.appointments) ? result.appointments : []);
    } catch (error) {
      reportLoadError(error, "Unable to load appointments.", setAppointmentsError);
    } finally {
      setAppointmentsLoading(false);
    }
  }, [reportLoadError]);

  const loadMessages = useCallback(async () => {
    setMessagesLoading(true);
    setMessagesError(null);
    try {
      const result = await api.messages.list();
      setMessages(result.messages);
    } catch (error) {
      reportLoadError(error, "Unable to load messages.", setMessagesError);
    } finally {
      setMessagesLoading(false);
    }
  }, [reportLoadError]);

  const updateMessageStatus = useCallback(
    async (id: string, status: "pending" | "handled" | "archived"): Promise<boolean> => {
      try {
        const result = await api.messages.updateStatus(id, status);
        if (result.success && result.message) {
          setMessages((prev) => prev.map((m) => (m.id === id ? result.message : m)));
          showToast(`Message marked as ${status}.`, "success");
          return true;
        }
        return false;
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Unable to update message.", "error");
        return false;
      }
    },
    [showToast],
  );

  const loadUserData = useCallback(async () => {
    await Promise.all([
      refreshAgents(),
      loadContacts(),
      loadCalls(new URLSearchParams({ page: "1", pageSize: "25" })),
      loadActiveCalls(),
      refreshDashboard(),
      loadAppointments(),
      loadMessages(),
    ]);
  }, [loadActiveCalls, loadCalls, loadContacts, loadAppointments, loadMessages, refreshAgents, refreshDashboard]);

  const setAuthenticatedUser = useCallback(async (authenticatedUser: ApiUser) => {
    setUser(authenticatedUser);
    setAuthError(null);
    setAuthStatus("authenticated");
    setProfile({
      username: authenticatedUser.name,
      email: authenticatedUser.email,
      role: authenticatedUser.role,
      mfa: "Not configured",
    });
    await loadUserData();
  }, [loadUserData]);

  const checkSession = useCallback(async () => {
    try {
      const result = await api.auth.session();
      if (result.authenticated && result.user) {
        await setAuthenticatedUser(result.user);
      } else {
        expireSession(null);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        expireSession(null);
      } else {
        setAuthStatus("error");
        setAuthError(error instanceof Error ? error.message : "Unable to verify your session.");
      }
    }
  }, [expireSession, setAuthenticatedUser]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void checkSession();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [checkSession]);

  const signIn = async (email: string, password: string) => {
    setAuthError(null);
    try {
      const result = await api.auth.login(email, password);
      await setAuthenticatedUser(result.user);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to sign in.";
      setAuthError(message);
      return false;
    }
  };

  const register = async (input: {
    name: string;
    organizationName?: string;
    email: string;
    password: string;
  }) => {
    setAuthError(null);
    try {
      const result = await api.auth.register(input);
      await setAuthenticatedUser(result.user);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to register.";
      setAuthError(message);
      return false;
    }
  };

  const logout = async () => {
    try {
      await api.auth.logout();
      expireSession(null);
      return true;
    } catch (error) {
      reportMutationError(error, "Unable to sign out.");
      return false;
    }
  };

  const addAgent = async (agent: Agent) => {
    try {
      const result = await api.agents.create(toAgentInput(agent));
      const created = mapAgent(result.agent);
      setAgents((previous) => [created, ...previous]);
      showToast(`Agent '${created.name}' saved.`, "success");
      return true;
    } catch (error) {
      reportMutationError(error, "Unable to create agent.");
      return false;
    }
  };

  const updateAgent = async (agent: Agent) => {
    try {
      const result = await api.agents.update(agent.id, toAgentInput(agent));
      const updated = mapAgent(result.agent);
      setAgents((previous) => previous.map((item) => item.id === updated.id ? updated : item));
      showToast(`Agent '${updated.name}' updated.`, "success");
      return true;
    } catch (error) {
      reportMutationError(error, "Unable to update agent.");
      return false;
    }
  };

  const deleteAgent = async (id: string) => {
    try {
      await api.agents.archive(id);
      setAgents((previous) => previous.map((agent) =>
        agent.id === id ? { ...agent, status: "paused" } : agent,
      ));
      showToast("Agent archived.", "success");
      return true;
    } catch (error) {
      reportMutationError(error, "Unable to archive agent.");
      return false;
    }
  };

  const toggleAgentStatus = async (id: string) => {
    const target = agents.find((agent) => agent.id === id);
    if (!target) return false;
    const status = target.status === "active" ? "paused" : "active";
    try {
      const result = await api.agents.update(id, { status });
      const updated = mapAgent(result.agent);
      setAgents((previous) => previous.map((agent) => agent.id === id ? updated : agent));
      showToast(`Agent ${status === "active" ? "resumed" : "paused"}.`, "success");
      return true;
    } catch (error) {
      reportMutationError(error, "Unable to update agent status.");
      return false;
    }
  };

  const duplicateAgent = async (id: string) => {
    const source = agents.find((agent) => agent.id === id);
    if (!source) return false;
    return addAgent({ ...source, id: "", name: `${source.name} (Copy)`, callsToday: 0 });
  };

  const addContact = async (contact: Record<string, unknown>) => {
    try {
      const result = await api.contacts.create(contact);
      setContacts((previous) => [mapContact(result.contact), ...previous]);
      showToast("Contact saved.", "success");
      void refreshDashboard();
      return true;
    } catch (error) {
      reportMutationError(error, "Unable to create contact.");
      return false;
    }
  };

  const updateContact = async (id: string, contact: Record<string, unknown>) => {
    try {
      const result = await api.contacts.update(id, contact);
      const updated = mapContact(result.contact);
      setContacts((previous) => previous.map((item) => item.id === id ? updated : item));
      showToast("Contact updated.", "success");
      void refreshDashboard();
      return true;
    } catch (error) {
      reportMutationError(error, "Unable to update contact.");
      return false;
    }
  };

  const deleteContact = async (id: string) => {
    try {
      await api.contacts.delete(id);
      setContacts((previous) => previous.map((item) => item.id === id ? { ...item, status: "inactive" } : item));
      showToast("Contact archived.", "success");
      void refreshDashboard();
      return true;
    } catch (error) {
      reportMutationError(error, "Unable to archive contact.");
      return false;
    }
  };

  const saveSettings = (updated: Settings) => {
    setSettings(updated);
    showToast("These settings are not persisted; provider configuration is not connected.", "info");
  };

  const saveProfile = (updated: Partial<Profile>) => {
    setProfile((previous) => ({ ...previous, ...updated }));
    showToast("Profile changes are local only and have not been saved to the server.", "info");
  };

  const addActivityLog = (text: string) => {
    setActivityLogs((previous) => [{ text, time: new Date().toISOString() }, ...previous]);
  };

  const changePassword = () => {
    showToast("Password changes are not available through the current API.", "error");
  };

  const markAllNotificationsRead = () => {
    setNotifications((previous) => previous.map((item) => ({ ...item, read: true })));
  };

  const listenInCall = async (id: string) => {
    try {
      showToast("Connecting live audio monitor...", "info");
      const res = await api.calls.listen(id);
      if (res.accessToken) {
        showToast("Live audio monitoring channel active.", "success");
      } else {
        showToast("Live listening channel initialized.", "info");
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to connect to live audio.", "error");
    }
  };

  const takeoverCall = (id: string) => {
    setActiveCalls((prev) =>
      prev.map((c) => (c.id === id ? { ...c, interventionMode: true } : c))
    );
    showToast("Takeover active. Type a message below to synthesize speech to the caller.", "info");
  };

  const cancelTakeoverCall = (id: string) => {
    setActiveCalls((prev) =>
      prev.map((c) => (c.id === id ? { ...c, interventionMode: false } : c))
    );
    showToast("Relinquished takeover control back to AI agent.", "info");
  };

  const sendInterventionMsg = async (id: string, text: string) => {
    try {
      showToast("Injecting intervention...", "info");
      await api.calls.intervene(id, text);
      setActiveCalls((prev) =>
        prev.map((c) => {
          if (c.id !== id) return c;
          return {
            ...c,
            transcript: [...c.transcript, { sender: "admin", text }],
          };
        })
      );
      showToast("Intervention sent to caller.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to send intervention.", "error");
    }
  };

  const endCallManually = async (id: string) => {
    try {
      showToast("Ending call...", "info");
      await api.calls.stop(id);
      setActiveCalls((prev) => prev.filter((c) => c.id !== id));
      setSelectedLiveCallId(null);
      showToast("Call ended successfully.", "success");
      await Promise.all([loadCalls(), refreshDashboard(), loadActiveCalls()]);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Unable to end call.", "error");
    }
  };

  return (
    <StateContext.Provider
      value={{
        user,
        authStatus,
        authError,
        signIn,
        register,
        logout,
        checkSession,
        agents,
        agentsLoading,
        agentsError,
        refreshAgents,
        calls,
        callsLoading,
        callsError,
        callPagination,
        loadCalls,
        createCall,
        activeCalls,
        activeCallsLoading,
        activeCallsError,
        loadActiveCalls,
        contacts,
        contactsLoading,
        contactsError,
        contactsPagination,
        loadContacts,
        addContact,
        updateContact,
        deleteContact,
        appointments,
        appointmentsLoading,
        appointmentsError,
        loadAppointments,
        messages,
        messagesLoading,
        messagesError,
        loadMessages,
        updateMessageStatus,
        dashboard,
        dashboardLoading,
        dashboardError,
        refreshDashboard,
        settings,
        profile,
        activityLogs,
        notifications,
        selectedLiveCallId,
        setSelectedLiveCallId,
        toasts,
        showToast,
        removeToast,
        addAgent,
        updateAgent,
        deleteAgent,
        toggleAgentStatus,
        duplicateAgent,
        saveSettings,
        saveProfile,
        addActivityLog,
        changePassword,
        markAllNotificationsRead,
        listenInCall,
        takeoverCall,
        cancelTakeoverCall,
        sendInterventionMsg,
        endCallManually,
        terminalLogs,
        addTerminalLog,
      }}
    >
      {children}
    </StateContext.Provider>
  );
};

export const useAppState = () => {
  const context = useContext(StateContext);
  if (!context) {
    throw new Error("useAppState must be used within a StateProvider");
  }
  return context;
};
