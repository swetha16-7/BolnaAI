"use client";

import React, { useState, useMemo } from "react";
import { useAppState } from "@/context/StateContext";
import { Search, Bot, Edit3, Copy, Trash2, Plus, RefreshCw, Link2 } from "lucide-react";
import { api, type ApiRetellAgent } from "@/lib/api-client";

export const AgentsView: React.FC = () => {
  const {
    agents,
    agentsLoading,
    agentsError,
    refreshAgents,
    showToast,
    deleteAgent,
    toggleAgentStatus,
    duplicateAgent,
  } = useAppState();
  const [search, setSearch] = useState("");
  const [langFilter, setLangFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [retellAgents, setRetellAgents] = useState<ApiRetellAgent[]>([]);
  const [retellLoading, setRetellLoading] = useState(false);
  const [retellError, setRetellError] = useState<string | null>(null);
  const [selectedLocalAgents, setSelectedLocalAgents] = useState<Record<string, string>>({});
  const [linkingRetellAgentId, setLinkingRetellAgentId] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

  const loadRetellAgents = React.useCallback(async () => {
    setRetellLoading(true);
    setRetellError(null);
    try {
      const result = await api.agents.listRetell();
      setRetellAgents(result.agents);
    } catch (error) {
      setRetellError(error instanceof Error ? error.message : "Unable to load Retell agents.");
    } finally {
      setRetellLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadRetellAgents();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadRetellAgents]);

  const filteredAgents = useMemo(() => {
    return agents.filter(a => {
      const matchQuery = !search ||
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.type.toLowerCase().includes(search.toLowerCase()) ||
        a.voiceName.toLowerCase().includes(search.toLowerCase());
      const matchLang = !langFilter || a.languages.includes(langFilter);
      let matchStatus = true;
      if (statusFilter === "active") matchStatus = a.status === "active";
      if (statusFilter === "paused") matchStatus = a.status === "paused";

      return matchQuery && matchLang && matchStatus;
    });
  }, [agents, search, langFilter, statusFilter]);

  const handleCreateAgentClick = () => {
    window.location.assign("#/agent-builder");
  };

  const handleEdit = (id: string) => {
    window.location.assign(`#/agent-builder?edit=${id}`);
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Archive ${name}? The agent record will be retained.`)) {
      void deleteAgent(id);
    }
  };

  const handleLinkRetellAgent = async (retellAgentId: string) => {
    const localAgentId = selectedLocalAgents[retellAgentId];
    if (!localAgentId) return;

    setLinkingRetellAgentId(retellAgentId);
    setLinkError(null);
    try {
      await api.agents.linkRetell(localAgentId, retellAgentId);
      setSelectedLocalAgents((previous) => {
        const next = { ...previous };
        delete next[retellAgentId];
        return next;
      });
      await refreshAgents();
      showToast("Retell agent linked to the application agent.", "success");
    } catch (error) {
      setLinkError(error instanceof Error ? error.message : "Unable to link the Retell agent.");
    } finally {
      setLinkingRetellAgentId(null);
    }
  };

  return (
    <section id="view-agents" className="view-pane active-view">
      <div className="page-header">
        <div>
          <h1 className="page-title">AI Voice Agents</h1>
          <p className="page-subtitle">Configure, duplicate, pause, or deploy conversational agents across standard business profiles.</p>
        </div>
        <div className="header-controls">
          <button className="primary-btn" onClick={handleCreateAgentClick}>
            <Plus size={16} /> Add New Agent
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="filters-bar-card">
        <div className="search-input-wrapper">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search agents by name, type, or voice..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="filter-controls-group">
          <div className="select-wrapper">
            <select value={langFilter} onChange={(e) => setLangFilter(e.target.value)}>
              <option value="">All Languages</option>
              <option value="English">English</option>
              <option value="Hindi">Hindi</option>
              <option value="Telugu">Telugu</option>
              <option value="Spanish">Spanish</option>
            </select>
          </div>
          <div className="select-wrapper">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="paused">Paused Only</option>
            </select>
          </div>
        </div>
      </div>

      <div className="panel-card mt-4" aria-busy={retellLoading}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="settings-section-title">Existing Retell AI Agents</h2>
            <p className="form-help-text">
              Read-only list from the configured Retell account. Linking changes only the local
              application mapping and requires an organization owner or administrator.
            </p>
          </div>
          <button
            className="secondary-btn btn-sm"
            onClick={() => void loadRetellAgents()}
            disabled={retellLoading}
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        {retellLoading ? (
          <p role="status" className="form-help-text mt-3">Loading Retell agents...</p>
        ) : retellError ? (
          <div role="alert" className="form-help-text mt-3">
            {retellError}{" "}
            <button className="text-btn" onClick={() => void loadRetellAgents()}>Retry</button>
          </div>
        ) : retellAgents.length === 0 ? (
          <p role="status" className="form-help-text mt-3">
            No Retell agents were found in the configured account.
          </p>
        ) : (
          <div className="table-container mt-3">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Retell Agent</th>
                  <th>Retell Agent ID</th>
                  <th>Channel</th>
                  <th>Application Mapping</th>
                </tr>
              </thead>
              <tbody>
                {retellAgents.map((retellAgent) => {
                  const linkedAgent = agents.find(
                    (agent) => agent.retellAgentId === retellAgent.retellAgentId,
                  );
                  const selectedLocalAgentId = selectedLocalAgents[retellAgent.retellAgentId] ?? "";
                  const reservedLocalAgentIds = Object.entries(selectedLocalAgents)
                    .filter(([otherRetellId]) => otherRetellId !== retellAgent.retellAgentId)
                    .map(([, localId]) => localId);
                  const availableAgents = agents.filter((agent) =>
                    !agent.retellAgentId &&
                    !reservedLocalAgentIds.includes(agent.id),
                  );

                  return (
                    <tr key={retellAgent.retellAgentId}>
                      <td className="font-medium">{retellAgent.name || "Unnamed agent"}</td>
                      <td className="text-secondary">{retellAgent.retellAgentId}</td>
                      <td>{retellAgent.channel}</td>
                      <td>
                        {linkedAgent ? (
                          <span>Linked to {linkedAgent.name} ({linkedAgent.id})</span>
                        ) : retellAgent.channel !== "voice" ? (
                          <span className="text-secondary">Chat agents cannot be linked to a voice agent.</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <select
                              className="form-input"
                              aria-label={`Local application agent for ${retellAgent.name}`}
                              value={selectedLocalAgentId}
                              onChange={(event) => setSelectedLocalAgents((previous) => ({
                                ...previous,
                                [retellAgent.retellAgentId]: event.target.value,
                              }))}
                              disabled={Boolean(linkingRetellAgentId)}
                            >
                              <option value="">Select application agent</option>
                              {availableAgents.map((agent) => (
                                <option key={agent.id} value={agent.id}>
                                  {agent.name} ({agent.id})
                                </option>
                              ))}
                            </select>
                            <button
                              className="secondary-btn btn-sm"
                              onClick={() => void handleLinkRetellAgent(retellAgent.retellAgentId)}
                              disabled={!selectedLocalAgentId || Boolean(linkingRetellAgentId)}
                              aria-label={`Link ${retellAgent.name} to the selected application agent`}
                            >
                              <Link2 size={14} />
                              {linkingRetellAgentId === retellAgent.retellAgentId ? "Linking..." : "Link"}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {agents.length === 0 && (
              <p className="form-help-text p-3">Create an application agent before linking a Retell agent.</p>
            )}
          </div>
        )}
        {linkError && <p role="alert" className="form-help-text mt-3">{linkError}</p>}
      </div>

      {/* Agents Table Card */}
      <div className="panel-card no-padding mt-4">
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Agent Name</th>
                <th>Business Type</th>
                <th>Languages</th>
                <th>Voice Configuration</th>
                <th>Status</th>
                <th>Calls Today</th>
                <th>Created Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {agentsLoading ? (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: "2rem" }}>Loading agents...</td></tr>
              ) : agentsError ? (
                <tr>
                  <td colSpan={8} role="alert" style={{ textAlign: "center", padding: "2rem" }}>
                    {agentsError}{" "}
                    <button className="secondary-btn btn-sm" onClick={() => void refreshAgents()}>Retry</button>
                  </td>
                </tr>
              ) : filteredAgents.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: "center", padding: "2rem" }}>
                    {agents.length === 0
                      ? "No agents have been created for this organization."
                      : "No voice agents match the selected parameters."}
                  </td>
                </tr>
              ) : (
                filteredAgents.map(agent => {
                  const toggleText = agent.status === "active" ? "Pause" : "Resume";
                  const statusClass = agent.status === "active" ? "status-active" : "status-paused";
                  const statusLabel = agent.status === "active" ? "Active" : "Paused";

                  return (
                    <tr key={agent.id}>
                      <td>
                        <div className="agent-name-cell">
                          <div className="agent-icon-box">
                            <Bot size={16} />
                          </div>
                          <div>
                            <span className="font-bold block">{agent.name}</span>
                            <span className="text-xs text-secondary">ID: {agent.id}</span>
                          </div>
                        </div>
                      </td>
                      <td>{agent.type}</td>
                      <td>
                        <div className="lang-badge-list">
                          {agent.languages.map((l, i) => (
                            <span className="lang-tag" key={i}>
                              {l}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <div className="flex-column">
                          <span className="font-medium text-xs">{agent.voiceName}</span>
                          <span className="text-muted text-xs">
                            {agent.provider} ({agent.speed}x)
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={`status-badge-inline ${statusClass}`}>{statusLabel}</span>
                      </td>
                      <td className="font-bold">{agent.callsToday}</td>
                      <td className="text-secondary">{agent.createdDate}</td>
                      <td>
                        <div className="table-actions-row">
                          <button
                            className="secondary-btn btn-sm"
                            onClick={() => handleEdit(agent.id)}
                            title="Configure Agent"
                          >
                            <Edit3 size={12} /> Edit
                          </button>
                          <button
                            className="secondary-btn btn-sm"
                            onClick={() => toggleAgentStatus(agent.id)}
                          >
                            {toggleText}
                          </button>
                          <button
                            className="secondary-btn btn-sm"
                            onClick={() => duplicateAgent(agent.id)}
                            title="Clone config"
                          >
                            <Copy size={12} />
                          </button>
                          <button
                            className="danger-btn btn-sm square-btn"
                            onClick={() => handleDelete(agent.id, agent.name)}
                            title="Archive agent"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};
