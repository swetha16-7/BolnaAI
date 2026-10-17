"use client";

import React, { useState, useEffect, useRef } from "react";
import { useAppState } from "@/context/StateContext";
import { PhoneCall, Volume2, Users, PhoneOff, Globe, Clock } from "lucide-react";

export const LiveCallsView: React.FC = () => {
  const {
    activeCalls,
    selectedLiveCallId,
    setSelectedLiveCallId,
    loadActiveCalls,
    listenInCall,
    takeoverCall,
    cancelTakeoverCall,
    sendInterventionMsg,
    endCallManually
  } = useAppState();

  const [interventionInput, setInterventionInput] = useState("");
  const transcriptFeedRef = useRef<HTMLDivElement>(null);

  // Poll active calls while the view is mounted with unmount cleanup and in-flight guard
  useEffect(() => {
    let isMounted = true;
    let inFlight = false;

    const poll = async () => {
      if (!isMounted || inFlight) return;
      inFlight = true;
      try {
        await loadActiveCalls();
      } finally {
        inFlight = false;
      }
    };

    void poll();
    const interval = setInterval(() => {
      void poll();
    }, 3000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [loadActiveCalls]);

  // Auto-select first active call if none selected or selected call no longer exists
  useEffect(() => {
    if (activeCalls.length > 0) {
      const exists = activeCalls.some((c) => c.id === selectedLiveCallId);
      if (!exists) {
        setSelectedLiveCallId(activeCalls[0].id);
      }
    } else if (selectedLiveCallId) {
      setSelectedLiveCallId(null);
    }
  }, [activeCalls, selectedLiveCallId, setSelectedLiveCallId]);

  const selectedCall = activeCalls.find(c => c.id === selectedLiveCallId);

  // Auto scroll transcript feed to bottom on new messages
  useEffect(() => {
    if (transcriptFeedRef.current) {
      transcriptFeedRef.current.scrollTop = transcriptFeedRef.current.scrollHeight;
    }
  }, [selectedCall?.transcript]);

  const handleLiveListen = () => {
    if (selectedLiveCallId) {
      listenInCall(selectedLiveCallId);
    }
  };

  const handleLiveTakeover = () => {
    if (selectedLiveCallId) {
      takeoverCall(selectedLiveCallId);
    }
  };

  const handleCancelTakeover = () => {
    if (selectedLiveCallId) {
      cancelTakeoverCall(selectedLiveCallId);
    }
  };

  const handleLiveEnd = () => {
    if (selectedLiveCallId) {
      endCallManually(selectedLiveCallId);
    }
  };

  const handleSendIntervention = () => {
    const text = interventionInput.trim();
    if (!text || !selectedLiveCallId) return;

    sendInterventionMsg(selectedLiveCallId, text);
    setInterventionInput("");
  };

  const formatSecondsToTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
  };

  return (
    <section id="view-live-calls" className="view-pane active-view">
      <div className="page-header">
        <div>
          <h1 className="page-title">Live Call Center</h1>
          <p className="page-subtitle">
            {activeCalls.length > 0
              ? "Live monitoring of ongoing voice sessions synchronized from Retell."
              : "No active calls in progress. Live channels will appear here automatically when connected."}
          </p>
        </div>
        <div className="system-telemetry-pill">
          <span className={activeCalls.length > 0 ? "pulse-green inline-pulse" : "pulse-grey inline-pulse"}></span>
          <span>{activeCalls.length} active call channels monitored</span>
        </div>
      </div>

      <div className="live-call-container">
        {/* Left Side Active Calls List */}
        <div className="live-calls-sidebar">
          <div className="calls-sidebar-header">
            <h3>Active Channels</h3>
            <span className="badge badge-cyan">{activeCalls.length}</span>
          </div>
          <div className="live-calls-list">
            {activeCalls.length === 0 ? (
              <div className="chat-system-msg" style={{ marginTop: "2rem" }}>
                No active phone sessions.
              </div>
            ) : (
              activeCalls.map(call => {
                let sentDot = "sent-neutral";
                if (call.sentimentScore > 65) sentDot = "sent-positive";
                if (call.sentimentScore < 35) sentDot = "sent-negative";

                return (
                  <div
                    key={call.id}
                    className={`live-call-item ${call.id === selectedLiveCallId ? 'active' : ''}`}
                    onClick={() => setSelectedLiveCallId(call.id)}
                  >
                    <div className="call-item-header">
                      <span className="call-item-caller font-bold">{call.caller}</span>
                      <span className="call-item-timer">
                        <Clock size={12} style={{ marginRight: "3px" }} />
                        {formatSecondsToTime(call.durationSeconds)}
                      </span>
                    </div>
                    <div className="call-item-body">
                      <span>{call.agentName}</span>
                      <span className="status-badge-inline">
                        <span className={`sentiment-dot ${sentDot}`}></span>
                        {call.language}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side Live Monitor */}
        <div className="live-call-monitor-panel">
          {!selectedCall ? (
            <div className="monitor-empty-state">
              <PhoneCall className="pulse-grey large-icon" size={48} />
              <h3>Select Active Call Channel</h3>
              <p>Select an ongoing call stream from the sidebar to inspect logs, view sentiment, listen, or intervene.</p>
            </div>
          ) : (
            <div className="monitor-active-view">
              {/* Monitor Header */}
              <div className="monitor-header">
                <div className="monitor-caller-info">
                  <h3 className="text-gradient font-bold">{selectedCall.caller}</h3>
                  <div className="monitor-metadata-bar">
                    <span className="badge border-violet">{selectedCall.agentName}</span>
                    <span className="divider-dot"></span>
                    <span className="meta-tag">
                      <Globe size={12} style={{ marginRight: "3px" }} />
                      <span>{selectedCall.language}</span>
                    </span>
                    <span className="divider-dot"></span>
                    <span className="meta-tag">
                      <Clock size={12} style={{ marginRight: "3px" }} />
                      <span>{formatSecondsToTime(selectedCall.durationSeconds)}</span>
                    </span>
                  </div>
                </div>

                <div className="monitor-actions">
                  <button className="secondary-btn border-green" onClick={handleLiveListen}>
                    <Volume2 size={16} /> Listen In
                  </button>
                  <button className="primary-btn bg-violet" onClick={handleLiveTakeover}>
                    <Users size={16} /> Take Over
                  </button>
                  <button className="danger-btn" onClick={handleLiveEnd}>
                    <PhoneOff size={16} /> End Call
                  </button>
                </div>
              </div>

              {/* Call Sentiment Indicator */}
              <div className="sentiment-indicator-bar-container">
                <div className="flex-between text-xs mb-1">
                  <span className="text-secondary font-medium">
                    Live Customer Sentiment:{" "}
                    <span>
                      {selectedCall.sentimentScore > 65
                        ? "Positive"
                        : selectedCall.sentimentScore < 35
                        ? "Negative"
                        : "Neutral"}
                    </span>
                  </span>
                  <span className="font-semibold">{selectedCall.sentimentScore}%</span>
                </div>
                <div className="sentiment-bar-track">
                  <div
                    className="sentiment-bar-fill"
                    style={{ width: `${selectedCall.sentimentScore}%` }}
                  ></div>
                </div>
              </div>

              {/* Main Transcript Scroller */}
              <div className="live-transcript-container">
                <div className="transcript-header">
                  <span>Live Conversation Transcript</span>
                  <span className="badge badge-glow border-green">TRANSCRIPT STREAM ACTIVE</span>
                </div>
                <div className="transcript-feed-scroller" ref={transcriptFeedRef}>
                  {selectedCall.transcript.length === 0 ? (
                    <div className="chat-system-msg" style={{ margin: "auto", textAlign: "center", padding: "2.5rem 1rem", opacity: 0.7 }}>
                      Listening for voice activity... Transcripts appear here in real time as the agent and caller speak.
                    </div>
                  ) : (
                    selectedCall.transcript.map((msg, index) => (
                      <div className={`chat-bubble bubble-${msg.sender}`} key={index}>
                        {msg.sender === "admin" && (
                          <span className="block text-xs font-bold text-green-400 mb-1">
                            Administrator Intervention
                          </span>
                        )}
                        {msg.text}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Intervention Panel */}
              {selectedCall.interventionMode && (
                <div className="intervention-box">
                  <div className="intervention-header">
                    <span className="text-green">
                      <Users size={14} style={{ display: "inline", marginRight: "5px" }} />
                      Administrator Takeover Active
                    </span>
                    <button className="text-btn text-xs text-red" onClick={handleCancelTakeover}>
                      Relinquish Control
                    </button>
                  </div>
                  <div className="intervention-input-area">
                    <input
                      type="text"
                      placeholder="Type messages to voice synthesize instantly on the customer's call line..."
                      value={interventionInput}
                      onChange={(e) => setInterventionInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSendIntervention()}
                    />
                    <button className="primary-btn" onClick={handleSendIntervention}>
                      Synthesize & Send
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
