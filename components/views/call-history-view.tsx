"use client";

import React, { useEffect, useRef, useState, type FormEvent } from "react";
import { MessageSquare, PhoneCall, Search } from "lucide-react";
import { useAppState, type Call, type ContactRecord } from "@/context/StateContext";
import { ApiError, api, type ApiRetellCall, type ApiRetellContact } from "@/lib/api-client";
import { formatDateTime } from "@/lib/utils";
import {
  runOutboundCallOnce,
  validateOutboundCallForm,
} from "@/lib/calls/outbound-form";

type CallSource = "stored" | "retell";
type RetellDisplayCall = Call & {
  retellCallId: string;
  summary: string | null;
  recordingUrl: string | null;
};

function formatDuration(seconds: number | null) {
  if (seconds === null) return "Not recorded";
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

function mapRetellCall(call: ApiRetellCall): RetellDisplayCall {
  const timestamp = call.startTimestamp ?? call.endTimestamp;
  return {
    id: `retell-${call.callId}`,
    retellCallId: call.callId,
    caller: call.direction === "inbound"
      ? call.fromNumber ?? "Unknown caller"
      : call.toNumber ?? call.fromNumber ?? "Unknown caller",
    direction: call.direction ?? "Not recorded",
    agentId: call.agentId,
    agentName: call.agentName,
    language: "Not recorded",
    duration: formatDuration(call.durationSeconds),
    outcome: call.summary ?? call.status,
    timestamp: timestamp === null ? "" : new Date(timestamp).toISOString(),
    sentiment: "Not recorded",
    transcript: call.transcript
      ? [{ sender: "transcript", text: call.transcript }]
      : [],
    status: call.status,
    provider: "retell",
    failureMessage: null,
    summary: call.summary,
    recordingUrl: call.recordingUrl,
  };
}

function timestampLabel(timestamp: string) {
  return timestamp ? formatDateTime(timestamp) : "Not recorded";
}

export const CallHistoryView: React.FC = () => {
  const {
    calls,
    agents,
    contacts,
    callsLoading,
    callsError,
    callPagination,
    loadCalls,
  } = useAppState();
  const [source, setSource] = useState<CallSource>("stored");
  const [search, setSearch] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [langFilter, setLangFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [selectedRetellCall, setSelectedRetellCall] = useState<ApiRetellCall | null>(null);
  const [retellCalls, setRetellCalls] = useState<ApiRetellCall[]>([]);
  const [retellLoading, setRetellLoading] = useState(false);
  const [retellError, setRetellError] = useState<string | null>(null);
  const [retellHasMore, setRetellHasMore] = useState(false);
  const [retellNextCursor, setRetellNextCursor] = useState<string | null>(null);
  const [retellCursorStack, setRetellCursorStack] = useState<Array<string | null>>([null]);
  const [retellPage, setRetellPage] = useState(1);
  const [retellDetailLoading, setRetellDetailLoading] = useState(false);
  const [retellDetailError, setRetellDetailError] = useState<string | null>(null);
  const [retellContacts, setRetellContacts] = useState<ApiRetellContact[]>([]);
  const [retellContactsLoading, setRetellContactsLoading] = useState(false);
  const [retellContactsError, setRetellContactsError] = useState<string | null>(null);
  const [retellContactsHasMore, setRetellContactsHasMore] = useState(false);
  const [retellContactsNextCursor, setRetellContactsNextCursor] = useState<string | null>(null);
  const [retellContactsCursorStack, setRetellContactsCursorStack] = useState<Array<string | null>>([null]);
  const [retellContactsPage, setRetellContactsPage] = useState(1);
  const [retellContactsRetry, setRetellContactsRetry] = useState(0);
  const [callAgentId, setCallAgentId] = useState("");
  const [destination, setDestination] = useState("");
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [callSubmitting, setCallSubmitting] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);
  const [callSuccess, setCallSuccess] = useState<string | null>(null);
  const callSubmissionPending = useRef(false);
  const callIdempotencyRef = useRef<{ intent: string; key: string } | null>(null);
  const callAgents = agents.filter(
    (agent) => agent.status === "active" && agent.retellAgentId.trim().length > 0,
  );

  const selectedCallAgentId = callAgents.some((agent) => agent.id === callAgentId)
    ? callAgentId
    : callAgents[0]?.id ?? "";

  const destinationMatches = contacts.filter(
    (contact) => contact.phone === destination.trim(),
  );
  const matchedContact: ContactRecord | null = destinationMatches.length === 1
    ? destinationMatches[0]
    : null;

  const handleMakeCall = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCallError(null);
    setCallSuccess(null);
    const validationError = validateOutboundCallForm({
      agentId: selectedCallAgentId,
      destination,
      contact: matchedContact,
      consentConfirmed,
    });
    if (validationError || !matchedContact) {
      setCallError(validationError ?? "Select a unique, consented organization contact.");
      return;
    }

    const normalizedDestination = destination.trim();
    const intent = `${selectedCallAgentId}\u0000${matchedContact.id}\u0000${normalizedDestination}`;
    if (callIdempotencyRef.current?.intent !== intent) {
      callIdempotencyRef.current = { intent, key: window.crypto.randomUUID() };
    }
    const idempotencyKey = callIdempotencyRef.current.key;

    await runOutboundCallOnce(callSubmissionPending, async () => {
      setCallSubmitting(true);
      try {
        const result = await api.calls.create({
          agentId: selectedCallAgentId,
          contactId: matchedContact.id,
          destination: normalizedDestination,
          consentConfirmed: true,
          idempotencyKey,
        });
        setSource("stored");
        setPage(1);
        setSearch("");
        setAgentFilter("");
        setLangFilter("");
        setStatusFilter("");
        if (result.error) {
          setCallError(`${result.error} The request key is retained to prevent a duplicate call.`);
        } else {
          setCallSuccess(
            `${result.replayed ? "Existing request confirmed" : "Call request submitted"}. Current status: ${result.status.replaceAll("_", " ")}.`,
          );
          callIdempotencyRef.current = null;
          setDestination("");
          setConsentConfirmed(false);
        }
        await loadCalls(new URLSearchParams({
          page: "1",
          pageSize: String(callPagination.pageSize),
        }));
      } catch (error) {
        setCallError(
          error instanceof ApiError
            ? error.message
            : "Unable to submit the call request. Check your connection and try again.",
        );
      } finally {
        setCallSubmitting(false);
      }
    });
  };

  useEffect(() => {
    if (source !== "stored") return;
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(callPagination.pageSize),
    });
    if (search.trim()) params.set("q", search.trim());
    if (agentFilter) params.set("agentId", agentFilter);
    if (langFilter) params.set("language", langFilter);
    if (statusFilter) params.set("status", statusFilter);

    const timeout = window.setTimeout(() => {
      void loadCalls(params);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [source, search, agentFilter, langFilter, statusFilter, page, callPagination.pageSize, loadCalls]);

  const retellCursor = retellCursorStack[retellCursorStack.length - 1] ?? null;
  useEffect(() => {
    if (source !== "retell") return;
    let active = true;
    const params = new URLSearchParams({ pageSize: "25" });
    if (retellCursor) params.set("cursor", retellCursor);
    if (agentFilter) params.set("agentId", agentFilter);
    const timeout = window.setTimeout(() => {
      setRetellLoading(true);
      setRetellError(null);
      void api.retellCalls.list(params).then((result) => {
        if (!active) return;
        setRetellCalls(result.calls);
        const cursorCycles = result.nextCursor !== null &&
          retellCursorStack.includes(result.nextCursor);
        setRetellHasMore(result.hasMore && !cursorCycles);
        setRetellNextCursor(cursorCycles ? null : result.nextCursor);
        if (cursorCycles) {
          setRetellError("Retell returned an invalid pagination sequence. Refresh and try again.");
        }
      }).catch((error: unknown) => {
        if (!active) return;
        setRetellError(error instanceof Error ? error.message : "Unable to load Retell calls.");
      }).finally(() => {
        if (active) setRetellLoading(false);
      });
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [source, agentFilter, retellCursor, retellCursorStack]);

  const retellContactsCursor = retellContactsCursorStack[retellContactsCursorStack.length - 1] ?? null;
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ pageSize: "25" });
    if (retellContactsCursor) params.set("cursor", retellContactsCursor);

    const timeout = window.setTimeout(() => {
      setRetellContactsLoading(true);
      setRetellContactsError(null);
      void api.retellContacts.list(params).then((result) => {
        if (!active) return;
        setRetellContacts(result.contacts);
        const cursorCycles = result.nextCursor !== null &&
          retellContactsCursorStack.includes(result.nextCursor);
        setRetellContactsHasMore(result.hasMore && !cursorCycles);
        setRetellContactsNextCursor(cursorCycles ? null : result.nextCursor);
        if (cursorCycles) {
          setRetellContactsError("Retell returned an invalid contact pagination sequence. Refresh and try again.");
        }
      }).catch((error: unknown) => {
        if (!active) return;
        setRetellContactsError(
          error instanceof Error ? error.message : "Unable to load Retell contacts.",
        );
      }).finally(() => {
        if (active) setRetellContactsLoading(false);
      });
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [retellContactsCursor, retellContactsCursorStack, retellContactsRetry]);

  const updateFilter = (setter: (value: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };

  const matchingRetellCalls = retellCalls.filter((call) => {
    const matchesStatus = !statusFilter ||
      mapRetellCall(call).status === statusFilter;
    const query = search.trim().toLocaleLowerCase();
    const matchesSearch = !query || [
      call.fromNumber,
      call.toNumber,
      call.agentName,
      call.summary,
    ].some((value) => value?.toLocaleLowerCase().includes(query));
    return matchesStatus && matchesSearch;
  });
  const displayedCalls = source === "stored"
    ? calls
    : matchingRetellCalls.map(mapRetellCall);
  const loading = source === "stored" ? callsLoading : retellLoading;
  const error = source === "stored" ? callsError : retellError;

  const openRetellCall = async (call: ApiRetellCall) => {
    setSelectedRetellCall(call);
    setSelectedCall(mapRetellCall(call));
    setRetellDetailLoading(true);
    setRetellDetailError(null);
    try {
      const result = await api.retellCalls.detail(call.callId);
      setSelectedRetellCall(result.call);
      setSelectedCall(mapRetellCall(result.call));
    } catch (detailError) {
      setRetellDetailError(
        detailError instanceof Error ? detailError.message : "Unable to load Retell call details.",
      );
    } finally {
      setRetellDetailLoading(false);
    }
  };

  const retryCalls = () => {
    if (source === "retell") {
      const params = new URLSearchParams({ pageSize: "25" });
      if (retellCursor) params.set("cursor", retellCursor);
      if (agentFilter) params.set("agentId", agentFilter);
      setRetellLoading(true);
      setRetellError(null);
      void api.retellCalls.list(params).then((result) => {
        setRetellCalls(result.calls);
        setRetellHasMore(result.hasMore);
        setRetellNextCursor(result.nextCursor);
      }).catch((retryError: unknown) => {
        setRetellError(retryError instanceof Error ? retryError.message : "Unable to load Retell calls.");
      }).finally(() => setRetellLoading(false));
      return;
    }
    const params = new URLSearchParams({ page: String(page), pageSize: String(callPagination.pageSize) });
    if (search.trim()) params.set("q", search.trim());
    if (agentFilter) params.set("agentId", agentFilter);
    if (langFilter) params.set("language", langFilter);
    if (statusFilter) params.set("status", statusFilter);
    void loadCalls(params);
  };

  const previousRetellPage = () => {
    if (retellCursorStack.length <= 1 || retellLoading) return;
    setRetellCursorStack((current) => current.slice(0, -1));
    setRetellPage((current) => Math.max(1, current - 1));
  };

  const nextRetellPage = () => {
    if (!retellHasMore || !retellNextCursor || retellLoading) return;
    setRetellCursorStack((current) => [...current, retellNextCursor]);
    setRetellPage((current) => current + 1);
  };

  const previousRetellContactsPage = () => {
    if (retellContactsCursorStack.length <= 1 || retellContactsLoading) return;
    setRetellContactsCursorStack((current) => current.slice(0, -1));
    setRetellContactsPage((current) => Math.max(1, current - 1));
  };

  const nextRetellContactsPage = () => {
    if (!retellContactsHasMore || !retellContactsNextCursor || retellContactsLoading) return;
    setRetellContactsCursorStack((current) => [...current, retellContactsNextCursor]);
    setRetellContactsPage((current) => current + 1);
  };

  return (
    <section id="view-call-history" className="view-pane active-view">
      <div className="page-header">
        <div>
          <h1 className="page-title">Call History &amp; Recordings</h1>
          <p className="page-subtitle">
            Review organization-owned call records and safely linked calls from the Retell account.
          </p>
        </div>
      </div>

      <section className="panel-card mt-4" aria-labelledby="make-call-title">
        <div className="mb-4">
          <h2 id="make-call-title" className="text-lg font-semibold">Make a Call</h2>
          <p className="text-sm text-secondary">
            Calls can only be requested for a unique organization contact with current recorded consent.
            Server-side outbound policy and destination allowlists remain in force.
          </p>
        </div>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => void handleMakeCall(event)}>
          <label className="grid gap-1 text-sm">
            Retell-mapped agent
            <select
              className="rounded-md border border-border bg-background px-3 py-2"
              value={selectedCallAgentId}
              onChange={(event) => {
                setCallAgentId(event.target.value);
                setCallError(null);
                setCallSuccess(null);
              }}
              required
              disabled={callSubmitting || callAgents.length === 0}
            >
              <option value="">Select an active agent</option>
              {callAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>{agent.name}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Destination phone number (E.164)
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+14155552671"
              pattern="\\+[1-9][0-9]{7,14}"
              className="rounded-md border border-border bg-background px-3 py-2"
              value={destination}
              onChange={(event) => {
                setDestination(event.target.value);
                setConsentConfirmed(false);
                setCallError(null);
                setCallSuccess(null);
              }}
              required
              disabled={callSubmitting}
            />
          </label>
          {destination.trim() && (
            <p className="text-sm sm:col-span-2" role="status">
              {matchedContact
                ? `Matched consent record: ${matchedContact.firstName} ${matchedContact.lastName ?? ""}`.trim()
                : destinationMatches.length > 1
                  ? "This number matches multiple contacts. Resolve the duplicate contacts before calling."
                  : "No unique contact match. Add this number to an organization contact and record consent first."}
            </p>
          )}
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={consentConfirmed}
              onChange={(event) => {
                setConsentConfirmed(event.target.checked);
                setCallError(null);
              }}
              disabled={callSubmitting}
            />
            I confirm this contact has current consent to receive an AI voice call at this number.
          </label>
          {callError && <p role="alert" className="text-sm text-destructive sm:col-span-2">{callError}</p>}
          {callSuccess && <p role="status" className="text-sm text-green-600 sm:col-span-2">{callSuccess}</p>}
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="primary-btn"
              disabled={callSubmitting || callAgents.length === 0}
            >
              <PhoneCall size={16} />
              {callSubmitting ? "Submitting call request..." : "Request Call"}
            </button>
            {callAgents.length === 0 && (
              <p className="mt-2 text-sm text-secondary">
                Map an active application agent to a Retell voice agent before requesting a call.
              </p>
            )}
          </div>
        </form>
      </section>

      <div className="flex gap-2 mb-4" role="group" aria-label="Call history source">
        <button
          className={source === "stored" ? "primary-btn btn-sm" : "secondary-btn btn-sm"}
          aria-pressed={source === "stored"}
          onClick={() => setSource("stored")}
        >Stored records</button>
        <button
          className={source === "retell" ? "primary-btn btn-sm" : "secondary-btn btn-sm"}
          aria-pressed={source === "retell"}
          onClick={() => setSource("retell")}
        >Retell account</button>
      </div>

      <div className="filters-bar-card">
        <div className="search-input-wrapper">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search by caller or outcome..."
            value={search}
            onChange={(event) => updateFilter(setSearch, event.target.value)}
          />
        </div>
        <div className="filter-controls-group">
          <div className="select-wrapper">
            <select
              aria-label="Filter by agent"
              value={agentFilter}
              onChange={(event) => {
                updateFilter(setAgentFilter, event.target.value);
                setRetellCursorStack([null]);
                setRetellPage(1);
              }}
            >
              <option value="">All Agents</option>
              {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
            </select>
          </div>
          {source === "stored" && (
            <div className="select-wrapper">
              <select aria-label="Filter by language" value={langFilter} onChange={(event) => updateFilter(setLangFilter, event.target.value)}>
                <option value="">All Languages</option>
                <option value="English">English</option>
                <option value="Hindi">Hindi</option>
                <option value="Telugu">Telugu</option>
                <option value="Spanish">Spanish</option>
              </select>
            </div>
          )}
          <div className="select-wrapper">
            <select aria-label="Filter by call status" value={statusFilter} onChange={(event) => updateFilter(setStatusFilter, event.target.value)}>
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="initiating">Initiating</option>
              <option value="initiated">Initiated</option>
              <option value="submission_unknown">Provider response unknown</option>
              <option value="ringing">Ringing</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="canceled">Canceled</option>
            </select>
          </div>
        </div>
      </div>

      {source === "retell" && (
        <p className="text-sm text-secondary mt-3">
          Only calls for uniquely linked Retell agents in this organization are included. Search and status filters apply to the current provider page.
        </p>
      )}

      <div className="panel-card no-padding mt-4">
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Caller / Destination</th>
                <th>Direction</th>
                <th>Agent</th>
                <th>Language</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Date / Time</th>
                <th>Record Source</th>
                <th>Transcript / Details</th>
                <th>Recording</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} style={{ textAlign: "center", padding: "2.5rem" }}>Loading call records...</td></tr>
              ) : error ? (
                <tr>
                  <td colSpan={10} role="alert" style={{ textAlign: "center", padding: "2.5rem" }}>
                    {error}{" "}
                    <button className="secondary-btn btn-sm" onClick={retryCalls}>Retry</button>
                  </td>
                </tr>
              ) : displayedCalls.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: "center", padding: "2.5rem" }}>No call records match these filters.</td></tr>
              ) : displayedCalls.map((call) => {
                const retellCall = source === "retell"
                  ? retellCalls.find((item) => `retell-${item.callId}` === call.id)
                  : undefined;
                const recordingUrl = retellCall?.recordingUrl ?? call.recordingUrl;
                return (
                  <tr key={call.id}>
                    <td className="font-bold">{call.caller}</td>
                    <td>{call.direction.replaceAll("_", " ")}</td>
                    <td>{call.agentName}</td>
                    <td><span className="lang-tag">{call.language}</span></td>
                    <td>
                      <span className="badge border-violet">{call.status.replaceAll("_", " ")}</span>
                      {call.failureMessage && <span className="block text-xs text-destructive">{call.failureMessage}</span>}
                    </td>
                    <td>{call.duration}</td>
                    <td className="text-secondary">{timestampLabel(call.timestamp)}</td>
                    <td>{call.provider === "placeholder" ? "Test record" : call.provider ?? "Unspecified"}</td>
                    <td>
                      {source === "retell" && retellCall ? (
                        <button className="primary-btn btn-sm" onClick={() => void openRetellCall(retellCall)}>
                          <MessageSquare size={14} style={{ marginRight: "3px" }} />
                          Details
                        </button>
                      ) : (
                        <button
                          className="primary-btn btn-sm"
                          disabled={!call.transcript.length && call.outcome === call.status && !call.recordingUrl}
                          onClick={() => setSelectedCall(call)}
                        >
                          <MessageSquare size={14} style={{ marginRight: "3px" }} />
                          {call.transcript.length ? "Details" : call.outcome !== call.status || call.recordingUrl ? "Details" : "Unavailable"}
                        </button>
                      )}
                    </td>
                    <td>
                      {recordingUrl ? (
                        <a href={recordingUrl} target="_blank" rel="noreferrer">Open recording</a>
                      ) : "Unavailable"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-border/60 px-4 py-3 text-sm">
          <span>
            {source === "stored"
              ? callPagination.total === 0
                ? "No records"
                : `Showing ${(page - 1) * callPagination.pageSize + 1}-${Math.min(page * callPagination.pageSize, callPagination.total)} of ${callPagination.total}`
              : `Retell provider page ${retellPage} · ${matchingRetellCalls.length} calls`}
          </span>
          <div className="flex gap-2">
            {source === "stored" ? (
              <>
                <button
                  className="secondary-btn btn-sm"
                  disabled={page <= 1 || callsLoading}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >Previous</button>
                <button
                  className="secondary-btn btn-sm"
                  disabled={page >= callPagination.totalPages || callsLoading}
                  onClick={() => setPage((value) => Math.min(callPagination.totalPages, value + 1))}
                >Next</button>
              </>
            ) : (
              <>
                <button
                  className="secondary-btn btn-sm"
                  disabled={retellCursorStack.length <= 1 || retellLoading}
                  onClick={previousRetellPage}
                >Previous</button>
                <button
                  className="secondary-btn btn-sm"
                  disabled={!retellHasMore || retellLoading}
                  onClick={nextRetellPage}
                >Next</button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="panel-card no-padding mt-6">
        <div className="border-b border-border/60 px-6 py-4">
          <h2 className="text-lg font-semibold">Retell Contacts</h2>
          <p className="mt-1 text-sm text-secondary">
            Contacts from Retell that match exactly one saved contact in this organization.
          </p>
        </div>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Conversations</th>
                <th>Last Conversation</th>
                <th>Do Not Call</th>
              </tr>
            </thead>
            <tbody>
              {retellContactsLoading ? (
                <tr><td colSpan={5} style={{ textAlign: "center", padding: "2.5rem" }}>Loading Retell contacts...</td></tr>
              ) : retellContactsError ? (
                <tr>
                  <td colSpan={5} role="alert" style={{ textAlign: "center", padding: "2.5rem" }}>
                    {retellContactsError}{" "}
                    <button
                      className="secondary-btn btn-sm"
                      onClick={() => setRetellContactsRetry((retry) => retry + 1)}
                    >Retry</button>
                  </td>
                </tr>
              ) : retellContacts.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: "center", padding: "2.5rem" }}>No Retell contacts match this organization&apos;s saved contacts.</td></tr>
              ) : retellContacts.map((contact) => (
                <tr key={contact.contactId}>
                  <td className="font-medium">
                    {[contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Unnamed contact"}
                  </td>
                  <td>{contact.phoneNumber}</td>
                  <td>{contact.conversationCount ?? "—"}</td>
                  <td className="text-secondary">
                    {contact.lastConversationTimestamp === null
                      ? "—"
                      : formatDateTime(new Date(contact.lastConversationTimestamp).toISOString())}
                  </td>
                  <td>
                    {contact.doNotCall === null
                      ? "Not specified"
                      : contact.doNotCall
                        ? "Yes"
                        : "No"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-border/60 px-4 py-3 text-sm">
          <span>Retell contact page {retellContactsPage} · {retellContacts.length} matched contacts</span>
          <div className="flex gap-2">
            <button
              className="secondary-btn btn-sm"
              disabled={retellContactsCursorStack.length <= 1 || retellContactsLoading}
              onClick={previousRetellContactsPage}
            >Previous</button>
            <button
              className="secondary-btn btn-sm"
              disabled={!retellContactsHasMore || retellContactsLoading}
              onClick={nextRetellContactsPage}
            >Next</button>
          </div>
        </div>
      </div>

      {selectedCall && (
        <div className="modal-overlay active" role="presentation">
          <div className="modal-card" role="dialog" aria-modal="true">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">
                  {selectedRetellCall ? "Retell call details" : `Call Transcript: ${selectedCall.caller}`}
                </h3>
                <p className="modal-subtitle">
                  Handled by {selectedCall.agentName} · {timestampLabel(selectedCall.timestamp)}
                </p>
              </div>
              <button
                className="close-btn"
                aria-label="Close call details"
                onClick={() => {
                  setSelectedCall(null);
                  setSelectedRetellCall(null);
                  setRetellDetailError(null);
                }}
              >&times;</button>
            </div>
            <div className="modal-body">
              <div className="modal-stats-grid mb-4">
                <div className="modal-stat-box"><span className="label">Status</span><span className="value font-medium">{selectedCall.status}</span></div>
                <div className="modal-stat-box"><span className="label">Direction</span><span className="value font-medium">{selectedCall.direction}</span></div>
                <div className="modal-stat-box"><span className="label">Duration</span><span className="value font-medium">{selectedCall.duration}</span></div>
                {selectedRetellCall && (
                  <div className="modal-stat-box">
                    <span className="label">Ended</span>
                    <span className="value font-medium">
                      {selectedRetellCall.endTimestamp === null
                        ? "Not recorded"
                        : formatDateTime(new Date(selectedRetellCall.endTimestamp).toISOString())}
                    </span>
                  </div>
                )}
              </div>
              {retellDetailLoading && <p>Loading Retell details...</p>}
              {retellDetailError && <p role="alert" className="text-destructive">{retellDetailError}</p>}
              {selectedRetellCall?.summary && (
                <div className="mb-4">
                  <span className="label mb-2 block font-semibold text-primary">Summary</span>
                  <p>{selectedRetellCall.summary}</p>
                </div>
              )}
              {!selectedRetellCall && selectedCall.outcome !== selectedCall.status && (
                <div className="mb-4">
                  <span className="label mb-2 block font-semibold text-primary">Summary</span>
                  <p>{selectedCall.outcome}</p>
                </div>
              )}
              {(selectedRetellCall?.recordingUrl ?? selectedCall.recordingUrl) && (
                <p className="mb-4">
                  <a href={selectedRetellCall?.recordingUrl ?? selectedCall.recordingUrl ?? undefined} target="_blank" rel="noreferrer">
                    Open {selectedRetellCall ? "Retell " : ""}recording
                  </a>
                </p>
              )}
              <div className="modal-transcript-wrapper">
                <span className="label mb-2 block font-semibold text-primary">Conversation History</span>
                <div className="modal-transcript-feed">
                  {selectedCall.transcript.map((message, index) => (
                    <div className={`chat-bubble bubble-${message.sender}`} key={`${selectedCall.id}-${index}`}>{message.text}</div>
                  ))}
                  {!selectedCall.transcript.length && !retellDetailLoading && (
                    <p className="text-secondary">Transcript is not available.</p>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="secondary-btn"
                onClick={() => {
                  setSelectedCall(null);
                  setSelectedRetellCall(null);
                  setRetellDetailError(null);
                }}
              >Close</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
