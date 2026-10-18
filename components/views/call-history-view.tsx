"use client";

import React, { useEffect, useRef, useState, type FormEvent } from "react";
import { MessageSquare, PhoneCall, Search } from "lucide-react";
import { useAppState, type Call, type ContactRecord } from "@/context/StateContext";
import { ApiError, api, type ApiRetellCall } from "@/lib/api-client";
import { formatDateTime } from "@/lib/utils";
import {
  runOutboundCallOnce,
  validateOutboundCallForm,
} from "@/lib/calls/outbound-form";

type RetellDisplayCall = Call & {
  retellCallId: string;
  summary: string | null;
  recordingUrl: string | null;
};

function formatDuration(seconds: number | null) {
  if (seconds === null) return "Not recorded";
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

function mapRetellCall(
  call: ApiRetellCall,
  agents: Array<{ id: string; retellAgentId: string; languages: string[] }> = [],
): RetellDisplayCall {
  const timestamp = call.startTimestamp ?? call.endTimestamp;
  const mappedAgent = agents.find(
    (agent) => agent.retellAgentId === call.agentId || agent.id === call.agentId,
  );
  return {
    id: `retell-${call.callId}`,
    retellCallId: call.callId,
    caller: call.direction === "inbound"
      ? call.fromNumber ?? "Unknown caller"
      : call.toNumber ?? call.fromNumber ?? "Unknown caller",
    direction: call.direction ?? "Not recorded",
    agentId: call.agentId,
    agentName: call.agentName,
    language: mappedAgent?.languages?.[0] ?? "English",
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
  const { agents, contacts } = useAppState();
  const [search, setSearch] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [selectedRetellCall, setSelectedRetellCall] = useState<ApiRetellCall | null>(null);
  const [retellCalls, setRetellCalls] = useState<ApiRetellCall[]>([]);
  const [retellLoading, setRetellLoading] = useState(false);
  const [retellError, setRetellError] = useState<string | null>(null);
  const [retellHasMore, setRetellHasMore] = useState(false);
  const [retellNextCursor, setRetellNextCursor] = useState<string | null>(null);
  const [retellCursorStack, setRetellCursorStack] = useState<Array<string | null>>([null]);
  const [retellPage, setRetellPage] = useState(1);
  const [retellRefresh, setRetellRefresh] = useState(0);
  const [retellDetailLoading, setRetellDetailLoading] = useState(false);
  const [retellDetailError, setRetellDetailError] = useState<string | null>(null);
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

  const handleMakeCall = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCallError(null);
    setCallSuccess(null);
    const validationError = validateOutboundCallForm({
      agentId: selectedCallAgentId,
      destination,
      consentConfirmed,
    });
    if (validationError) {
      setCallError(validationError);
      return;
    }

    const normalizedDestination = destination.trim();
    const intent = `${selectedCallAgentId}\u0000direct\u0000${normalizedDestination}`;
    if (callIdempotencyRef.current?.intent !== intent) {
      callIdempotencyRef.current = { intent, key: window.crypto.randomUUID() };
    }
    const idempotencyKey = callIdempotencyRef.current.key;

    await runOutboundCallOnce(callSubmissionPending, async () => {
      setCallSubmitting(true);
      try {
        const result = await api.calls.create({
          agentId: selectedCallAgentId,
          destination: normalizedDestination,
          consentConfirmed: true,
          idempotencyKey,
        });
        setRetellCursorStack([null]);
        setRetellPage(1);
        setSearch("");
        setAgentFilter("");
        setStatusFilter("");
        if (result.error) {
          setCallError(`${result.error} The request key is retained to prevent a duplicate call.`);
        } else {
          setCallSuccess(
            `${result.replayed ? "Existing request confirmed" : "Call request submitted"}. Current status: ${result.status.replaceAll("_", " ")}.`,
          );
          if (result.call) {
            const newRetellCall: ApiRetellCall = {
              callId: result.call.id,
              agentId: selectedCallAgentId,
              agentName: callAgents.find((a) => a.id === selectedCallAgentId)?.name || "Agent",
              callType: "phone_call",
              direction: "outbound",
              status: "initiated",
              fromNumber: result.call.callerNumber || null,
              toNumber: normalizedDestination,
              startTimestamp: Date.now(),
              endTimestamp: null,
              durationSeconds: 0,
              transcript: result.call.transcript ?? null,
              summary: null,
              recordingUrl: null,
            };
            setRetellCalls((prev) => [newRetellCall, ...prev.filter((c) => c.callId !== newRetellCall.callId)]);
          }
          callIdempotencyRef.current = null;
          setDestination("");
          setConsentConfirmed(false);
        }
        setRetellRefresh((count) => count + 1);
      } catch (error) {
        if (error instanceof ApiError && Array.isArray(error.details) && error.details.length > 0) {
          setCallError(`${error.message} (${error.details.join(", ")})`);
        } else {
          setCallError(
            error instanceof ApiError
              ? error.message
              : "Unable to submit the call request. Check your connection and try again.",
          );
        }
      } finally {
        setCallSubmitting(false);
      }
    });
  };

  const retellCursor = retellCursorStack[retellCursorStack.length - 1] ?? null;
  useEffect(() => {
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
  }, [agentFilter, retellCursor, retellCursorStack, retellRefresh]);

  // Poll while there are active or initiated calls so status automatically transitions to completed when done
  useEffect(() => {
    const hasActiveCall = retellCalls.some(
      (c) => c.status === "initiated" || c.status === "in_progress" || c.status === "registered" || c.status === "ongoing"
    );
    if (!hasActiveCall) return;

    const interval = setInterval(() => {
      const params = new URLSearchParams({ pageSize: "25" });
      if (retellCursor) params.set("cursor", retellCursor);
      if (agentFilter) params.set("agentId", agentFilter);
      void api.retellCalls.list(params).then((result) => {
        setRetellCalls((prev) => {
          const remoteCallIds = new Set(result.calls.map((c) => c.callId));
          const localPending = prev.filter(
            (c) => (c.status === "initiated" || c.status === "in_progress") && !remoteCallIds.has(c.callId)
          );
          return [...localPending, ...result.calls];
        });
      }).catch(() => {});
    }, 3000);

    return () => clearInterval(interval);
  }, [retellCalls, retellCursor, agentFilter]);


  const updateFilter = (setter: (value: string) => void, value: string) => {
    setter(value);
  };

  const matchingRetellCalls = retellCalls.filter((call) => {
    const matchesStatus = !statusFilter ||
      mapRetellCall(call, agents).status === statusFilter;
    const query = search.trim().toLocaleLowerCase();
    const matchesSearch = !query || [
      call.fromNumber,
      call.toNumber,
      call.agentName,
      call.summary,
      call.callId,
    ].some((value) => value?.toLocaleLowerCase().includes(query));
    return matchesStatus && matchesSearch;
  });

  const displayedCalls = matchingRetellCalls.map((call) => mapRetellCall(call, agents));

  const openRetellCall = async (call: ApiRetellCall) => {
    setSelectedRetellCall(call);
    setSelectedCall(mapRetellCall(call, agents));
    setRetellDetailLoading(true);
    setRetellDetailError(null);
    try {
      const result = await api.retellCalls.detail(call.callId);
      setSelectedRetellCall(result.call);
      setSelectedCall(mapRetellCall(result.call, agents));
    } catch (detailError) {
      setRetellDetailError(
        detailError instanceof Error ? detailError.message : "Unable to load Retell call details.",
      );
    } finally {
      setRetellDetailLoading(false);
    }
  };

  const retryCalls = () => {
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


  return (
    <section id="view-call-history" className="view-pane active-view">
      <div className="page-header">
        <div>
          <h1 className="page-title">Call History &amp; Recordings</h1>
          <p className="page-subtitle">
            Review voice calls and recordings from your linked Retell account.
          </p>
        </div>
      </div>

      <section className="panel-card mt-4" aria-labelledby="make-call-title">
        <div className="mb-4">
          <h2 id="make-call-title" className="text-lg font-semibold">Make a Call</h2>
          <p className="text-sm text-secondary">
            Request an outbound AI voice call to any valid E.164 phone number.
            Server-side outbound policy, consent, and destination allowlists remain in force.
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
              placeholder="+919876543210 or +14155552671"
              pattern="[+][1-9][0-9]{7,14}"
              title="Phone number must be in E.164 format starting with '+' followed by country code and digits (e.g. +919121998166 or +14155552671)"
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
            I confirm that consent has been obtained to place an AI voice call to this destination.
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

      <div className="filters-bar-card mt-4">
        <div className="search-input-wrapper">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search by caller, destination, or agent..."
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

      <p className="text-sm text-secondary mt-3">
        Only calls for uniquely linked Retell agents in this organization are included.
      </p>

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
                <th>Transcript / Details</th>
                <th>Recording</th>
              </tr>
            </thead>
            <tbody>
              {retellLoading ? (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: "2.5rem" }}>Loading Retell calls...</td></tr>
              ) : retellError ? (
                <tr>
                  <td colSpan={9} role="alert" style={{ textAlign: "center", padding: "2.5rem" }}>
                    {retellError}{" "}
                    <button className="secondary-btn btn-sm" onClick={retryCalls}>Retry</button>
                  </td>
                </tr>
              ) : displayedCalls.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: "center", padding: "2.5rem" }}>No Retell call records match these filters.</td></tr>
              ) : displayedCalls.map((call) => {
                const retellCall = retellCalls.find((item) => `retell-${item.callId}` === call.id);
                const recordingUrl = retellCall?.recordingUrl ?? call.recordingUrl;
                return (
                  <tr key={call.id}>
                    <td className="font-bold">{call.caller}</td>
                    <td>{call.direction.replaceAll("_", " ")}</td>
                    <td>{call.agentName}</td>
                    <td><span className="lang-tag">{call.language}</span></td>
                    <td>
                      <span className={`badge ${
                        call.status === "completed"
                          ? "border-green"
                          : call.status === "failed"
                            ? "border-red"
                            : "border-cyan"
                      }`}>{call.status.replaceAll("_", " ")}</span>
                      {call.failureMessage && <span className="block text-xs text-destructive">{call.failureMessage}</span>}
                    </td>
                    <td>{call.duration}</td>
                    <td className="text-secondary">{timestampLabel(call.timestamp)}</td>
                    <td>
                      {retellCall && (
                        <button className="primary-btn btn-sm" onClick={() => void openRetellCall(retellCall)}>
                          <MessageSquare size={14} style={{ marginRight: "3px" }} />
                          Details
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
            Retell provider page {retellPage} · {matchingRetellCalls.length} {matchingRetellCalls.length === 1 ? "call" : "calls"}
          </span>
          <div className="flex gap-2">
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
          </div>
        </div>
      </div>


      {selectedCall && (
        <div className="modal-overlay active" role="presentation">
          <div className="modal-card" role="dialog" aria-modal="true">
            <div className="modal-header">
              <div>
                <h3 className="modal-title">
                  {`Call Details: ${selectedCall.caller}`}
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
              {selectedRetellCall?.recordingUrl && (
                <p className="mb-4">
                  <a href={selectedRetellCall.recordingUrl} target="_blank" rel="noreferrer">
                    Open Retell recording
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
