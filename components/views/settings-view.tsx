"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useAppState, Settings } from "@/context/StateContext";
import { ApiError, api, type ApiProviderConfigurationStatus } from "@/lib/api-client";
import { Check, Cpu, Phone, Sliders } from "lucide-react";

export const SettingsView: React.FC = () => {
  const { settings, saveSettings } = useAppState();

  const [activeTab, setActiveTab] = useState<"keys" | "telephony" | "general">("keys");

  // Form states
  const [apiKokoro, setApiKokoro] = useState(settings.apiKokoro);
  const [apiQwen, setApiQwen] = useState(settings.apiQwen);

  const [webhookStatus, setWebhookStatus] = useState(settings.webhookStatus);
  const [webhookStream, setWebhookStream] = useState(settings.webhookStream);
  const [recordingFormat, setRecordingFormat] = useState(settings.recordingFormat);

  const [providerStatus, setProviderStatus] = useState<ApiProviderConfigurationStatus | null>(null);
  const [providerStatusLoading, setProviderStatusLoading] = useState(false);
  const [providerStatusError, setProviderStatusError] = useState<string | null>(null);

  const loadProviderStatus = useCallback(async () => {
    setProviderStatusLoading(true);
    setProviderStatusError(null);
    try {
      setProviderStatus(await api.providers.configurationStatus());
    } catch (error) {
      setProviderStatus(null);
      setProviderStatusError(
        error instanceof ApiError && error.status === 403
          ? "Only organization owners and administrators can view provider configuration."
          : error instanceof Error
            ? error.message
            : "Unable to load provider configuration status.",
      );
    } finally {
      setProviderStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadProviderStatus();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadProviderStatus]);

  const handleSave = () => {
    const payload: Settings = {
      apiKokoro,
      apiQwen,
      webhookStatus,
      webhookStream,
      recordingFormat,
    };
    saveSettings(payload);
  };

  return (
    <section id="view-settings" className="view-pane active-view">
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings & Integrations</h1>
          <p className="page-subtitle">Review provider readiness and manage local voice, endpoint, and general preferences.</p>
        </div>
        <div className="header-controls">
          <button className="primary-btn" onClick={handleSave}>
            <Check size={16} /> Save Changes
          </button>
        </div>
      </div>

      <div className="settings-container">
        {/* Left Side Categories */}
        <div className="settings-sidebar">
          <button
            className={`settings-tab-btn ${activeTab === "keys" ? "active" : ""}`}
            onClick={() => setActiveTab("keys")}
          >
            <Cpu size={16} style={{ marginRight: "8px" }} /> Voice & LLM Settings
          </button>
          <button
            className={`settings-tab-btn ${activeTab === "telephony" ? "active" : ""}`}
            onClick={() => setActiveTab("telephony")}
          >
            <Phone size={16} style={{ marginRight: "8px" }} /> Telephony Integration
          </button>
          <button
            className={`settings-tab-btn ${activeTab === "general" ? "active" : ""}`}
            onClick={() => setActiveTab("general")}
          >
            <Sliders size={16} style={{ marginRight: "8px" }} /> General & Webhooks
          </button>
        </div>

        {/* Right Side Settings Workspace */}
        <div className="settings-body-scroller">
          {/* Tab: Voice & LLM */}
          {activeTab === "keys" && (
            <div className="settings-section active-section">
              <h3 className="settings-section-title">Voice &amp; LLM Provider Configuration</h3>
              <p className="form-help-text">
                Provider credentials are not collected in this browser screen. Configure secrets
                in the server environment. Retell, Twilio, and Cal.com status is available under
                Telephony Integration.
              </p>
              <div className="settings-grid">
                <div className="form-group">
                  <label className="form-label">Kokoro API Url (Self-hosted)</label>
                  <input
                    type="text"
                    className="form-input"
                    value={apiKokoro}
                    onChange={(e) => setApiKokoro(e.target.value)}
                  />
                </div>
              </div>

              <div className="divider"></div>

              <h3 className="settings-section-title">LLM Provider Endpoint</h3>
              <div className="settings-grid">
                <div className="form-group">
                  <label className="form-label">Qwen Endpoint (Alibaba Cloud)</label>
                  <input
                    type="text"
                    className="form-input"
                    value={apiQwen}
                    onChange={(e) => setApiQwen(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Tab: Telephony */}
          {activeTab === "telephony" && (
            <div className="settings-section active-section">
              <h3 className="settings-section-title">Provider Connection Status</h3>
              <p className="form-help-text">
                Status checks only verify that required server environment variables are present.
                They do not contact providers or verify credentials.
              </p>
              {providerStatusLoading ? (
                <p role="status" className="form-help-text">Loading provider configuration...</p>
              ) : providerStatusError ? (
                <div role="alert" className="form-help-text">
                  <p>{providerStatusError}</p>
                  <button className="text-btn" onClick={() => void loadProviderStatus()}>
                    Retry status check
                  </button>
                </div>
              ) : providerStatus ? (
                <div className="settings-grid">
                  {([
                    ["retell", "Retell AI", "RETELL_API_KEY, RETELL_FROM_NUMBER, RETELL_WEBHOOK_URL"],
                    ["twilio", "Twilio", "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WEBHOOK_URL"],
                    ["calcom", "Cal.com", "CALCOM_API_KEY, CALCOM_WEBHOOK_SECRET"],
                  ] as const).map(([key, name, variables]) => {
                    const configuration = providerStatus.providers[key];
                    return (
                      <div className="form-group col-span-2" key={key}>
                        <label className="form-label">{name}</label>
                        <p role="status">
                          {configuration.status === "configured"
                            ? "Required server configuration is present and its format is valid."
                            : configuration.status === "invalid_configuration"
                              ? "Some server configuration values have an invalid format."
                              : "Missing server configuration."}
                        </p>
                        {configuration.missing.length > 0 && (
                          <p className="form-help-text">
                            Missing: {configuration.missing.join(", ")}
                          </p>
                        )}
                        {configuration.invalid.length > 0 && (
                          <p className="form-help-text">
                            Invalid format: {configuration.invalid.join(", ")}
                          </p>
                        )}
                        <p className="form-help-text">Required: {variables}</p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="form-help-text">Provider configuration status is unavailable.</p>
              )}
              <div className="divider"></div>
              <h3 className="settings-section-title">Setup Notes</h3>
              <p className="form-help-text">
                Configure credentials in the server environment only. Configure the Retell webhook
                at <code>/api/webhooks/retell</code> and the Twilio status callback at{" "}
                <code>/api/webhooks/twilio</code> using your public HTTPS application URL. A Twilio
                number used by Retell must be configured in the provider dashboards; this app does
                not change phone routing. Outbound calling remains subject to its separate server
                safety gates.
              </p>
            </div>
          )}

          {/* Tab: General Settings */}
          {activeTab === "general" && (
            <div className="settings-section active-section">
              <h3 className="settings-section-title">Global Webhooks & Callbacks</h3>
              <div className="settings-grid">
                <div className="form-group col-span-2">
                  <label className="form-label">Primary Call Status Webhook URL</label>
                  <input
                    type="url"
                    className="form-input"
                    value={webhookStatus}
                    onChange={(e) => setWebhookStatus(e.target.value)}
                  />
                </div>
                <div className="form-group col-span-2">
                  <label className="form-label">Real-time Transcript Stream WebSocket URL</label>
                  <input
                    type="url"
                    className="form-input"
                    value={webhookStream}
                    onChange={(e) => setWebhookStream(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Default Call Recording Format</label>
                  <select
                    className="form-input"
                    value={recordingFormat}
                    onChange={(e) => setRecordingFormat(e.target.value)}
                  >
                    <option value="wav">WAV (PCM 16-bit 8kHz)</option>
                    <option value="mp3">MP3 (128kbps stereo)</option>
                    <option value="ogg">OGG (Opus 64kbps)</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
