"use client";

import React, { useState, useEffect, useRef } from "react";
import { useAppState, Agent, FAQ, KBFile } from "@/context/StateContext";
import {
  Save,
  UploadCloud,
  Plus,
  Play,
  RotateCcw,
  Send,
  Mic,
  FileText,
  Trash2,
} from "lucide-react";

interface AgentBuilderViewProps {
  editId?: string | null;
}

export const AgentBuilderView: React.FC<AgentBuilderViewProps> = ({ editId }) => {
  const { agents, addAgent, updateAgent, showToast } = useAppState();
  const [isSaving, setIsSaving] = useState(false);

  const [activeTab, setActiveTab] = useState<
    "basic" | "prompt" | "voice" | "knowledge" | "hours"
  >("basic");

  // Form State
  const [name, setName] = useState("");
  const [type, setType] = useState("Customer Support");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [greeting, setGreeting] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [fallback, setFallback] = useState("");

  const [langEn, setLangEn] = useState(true);
  const [langHi, setLangHi] = useState(false);
  const [langTe, setLangTe] = useState(false);
  const [langEs, setLangEs] = useState(false);

  const [provider, setProvider] = useState("Deepgram");
  const [voiceName, setVoiceName] = useState("Aura-Asteria");
  const [speed, setSpeed] = useState(1.0);

  const [previewText, setPreviewText] = useState(
    "Hello! This is a preview of my speaking voice. Let's build something amazing together."
  );

  const [kbFiles, setKbFiles] = useState<KBFile[]>([]);
  const [kbFaqs, setKbFaqs] = useState<FAQ[]>([]);
  const [kbLinks, setKbLinks] = useState("");

  const [workingDays, setWorkingDays] = useState<string[]>(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  const [hoursStart, setHoursStart] = useState("09:00");
  const [hoursEnd, setHoursEnd] = useState("17:00");
  const [holidays, setHolidays] = useState("");

  // Sandbox Chat State
  const [sandboxMessages, setSandboxMessages] = useState<{ sender: "agent" | "customer" | "system"; text: string }[]>([
    { sender: "system", text: "Press Start/Speak to initialize conversation preview with the agent." }
  ]);
  const [sandboxInput, setSandboxInput] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioStatus, setAudioStatus] = useState("Audio output ready");

  // File Upload Ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatBodyRef = useRef<HTMLDivElement>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      synthRef.current = window.speechSynthesis;
    }
  }, []);

  // Pre-load edit mode
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (editId) {
        const agent = agents.find(a => a.id === editId);
        if (agent) {
          setName(agent.name);
          setType(agent.type);
          setTimezone(agent.timezone);
          setGreeting(agent.greeting);
          setSystemPrompt(agent.systemPrompt);
          setFallback(agent.fallback);

          setLangEn(agent.languages.includes("English"));
          setLangHi(agent.languages.includes("Hindi"));
          setLangTe(agent.languages.includes("Telugu"));
          setLangEs(agent.languages.includes("Spanish"));

          setProvider(agent.provider);
          setVoiceName(agent.voiceName);
          setSpeed(agent.speed);

          setKbFiles(agent.kbFiles);
          setKbFaqs(agent.kbFaqs);
          setKbLinks(agent.kbLinks);

          setWorkingDays(agent.workingDays);
          setHoursStart(agent.hoursStart);
          setHoursEnd(agent.hoursEnd);
          setHolidays(agent.holidays);
        }
      } else {
        // Default Receptionist values for creation
        setName("");
        setType("Customer Support");
        setTimezone("Asia/Kolkata");
        setGreeting("Thank you for calling. This is a conversational assistant. How may I help you?");
        setSystemPrompt("You are a professional assistant. Help customers locate offices and log query requests.");
        setFallback("I'm sorry, I'm experiencing technical issues. Let me call support.");
        setLangEn(true);
        setLangHi(false);
        setLangTe(false);
        setLangEs(false);
        setProvider("Deepgram");
        setVoiceName("Aura-Asteria");
        setSpeed(1.0);
        setKbFiles([]);
        setKbFaqs([]);
        setKbLinks("");
        setWorkingDays(["Mon", "Tue", "Wed", "Thu", "Fri"]);
        setHoursStart("09:00");
        setHoursEnd("17:00");
        setHolidays("");
      }
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [editId, agents]);

  // Speech function
  const speakText = (text: string, langCode: string) => {
    if (!synthRef.current) return;
    if (synthRef.current.speaking) {
      synthRef.current.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = speed;
    utterance.lang = langCode;

    const voices = synthRef.current.getVoices();
    const matchedVoice = voices.find(v => v.lang.startsWith(langCode.substring(0, 2)));
    if (matchedVoice) utterance.voice = matchedVoice;

    utterance.onstart = () => {
      setIsSpeaking(true);
      setAudioStatus("Agent speaking aloud...");
    };
    utterance.onend = () => {
      setIsSpeaking(false);
      setAudioStatus("Audio output ready");
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      setAudioStatus("Audio output ready");
    };

    synthRef.current.speak(utterance);
  };

  const getPrimaryLangCode = () => {
    if (langEs) return "es-ES";
    if (langHi) return "hi-IN";
    if (langTe) return "te-IN";
    return "en-US";
  };

  const handleListenPreview = () => {
    speakText(previewText, getPrimaryLangCode());
  };

  const notifyUploadUnavailable = () => {
    showToast("Document storage and indexing are not connected. The file was not saved.", "info");
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) notifyUploadUnavailable();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) notifyUploadUnavailable();
    e.target.value = "";
  };

  const removeKbFile = (nameToRemove: string) => {
    setKbFiles(prev => prev.filter(f => f.name !== nameToRemove));
  };

  // FAQ handlers
  const handleAddFaq = () => {
    setKbFaqs(prev => [...prev, { q: "", a: "" }]);
  };

  const updateFaq = (index: number, field: "q" | "a", value: string) => {
    setKbFaqs(prev => prev.map((faq, i) => i === index ? { ...faq, [field]: value } : faq));
  };

  const removeFaq = (index: number) => {
    setKbFaqs(prev => prev.filter((_, i) => i !== index));
  };

  // Sandbox testing chat logic
  const handleSendSandboxMessage = () => {
    const msg = sandboxInput.trim();
    if (!msg) return;

    setSandboxInput("");
    setSandboxMessages(prev => [...prev, { sender: "customer", text: msg }]);

    // Scroll to bottom
    setTimeout(() => {
      if (chatBodyRef.current) {
        chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
      }
    }, 50);

    // Simulate Agent Reply
    setTimeout(() => {
      let reply = "";
      const cleanMsg = msg.toLowerCase();
      const faqMatch = kbFaqs.find(f => f.q && cleanMsg.includes(f.q.toLowerCase()));

      if (cleanMsg.includes("hello") || cleanMsg.includes("hi")) {
        reply = greeting || "Hello! How can I help you today?";
      } else if (faqMatch) {
        reply = faqMatch.a;
      } else if (cleanMsg.includes("hour") || cleanMsg.includes("time") || cleanMsg.includes("open")) {
        reply = `Our standard operational hours are from ${hoursStart} to ${hoursEnd}. We are closed during national holidays.`;
      } else if (cleanMsg.includes("location") || cleanMsg.includes("where")) {
        reply = "Our corporate offices are headquartered in Silicon Valley Tech Hub.";
      } else if (cleanMsg.includes("pricing") || cleanMsg.includes("price") || cleanMsg.includes("cost")) {
        reply = "We offer flexible enterprise tiers starting at $49 a month. Standard support features are included.";
      } else {
        reply = fallback || "I'm having trouble retrieving that parameter. Let me check with support.";
      }

      setSandboxMessages(prev => [...prev, { sender: "agent", text: reply }]);
      speakText(reply, getPrimaryLangCode());

      setTimeout(() => {
        if (chatBodyRef.current) {
          chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
        }
      }, 50);
    }, 1000);
  };

  const handleResetSandbox = () => {
    setSandboxMessages([{ sender: "system", text: "Sandbox history reset." }]);
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    setIsSpeaking(false);
    setAudioStatus("Audio output ready");
  };

  const handleMicSimulate = () => {
    setSandboxInput("Tell me your location and office hours.");
    showToast("Voice capture simulated. Press send to query.", "info");
  };

  // Day Selection Toggle
  const toggleWorkingDay = (day: string) => {
    setWorkingDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  // Save Agent Data
  const handleSave = async () => {
    if (!name.trim()) {
      showToast("Please provide an agent name", "error");
      return;
    }

    const selectedLanguages = [];
    if (langEn) selectedLanguages.push("English");
    if (langHi) selectedLanguages.push("Hindi");
    if (langTe) selectedLanguages.push("Telugu");
    if (langEs) selectedLanguages.push("Spanish");

    if (selectedLanguages.length === 0) {
      showToast("Select at least one supported language", "error");
      return;
    }

    const agentData: Agent = {
      id: editId || `agent-${Date.now()}`,
      name: name.trim(),
      type,
      timezone,
      retellAgentId: "",
      languages: selectedLanguages,
      provider,
      voiceName,
      speed,
      greeting,
      systemPrompt,
      fallback,
      kbFiles: kbFiles.filter(f => f.progress >= 100),
      kbFaqs: kbFaqs.filter(f => f.q && f.a),
      kbLinks,
      workingDays,
      hoursStart,
      hoursEnd,
      holidays,
      callsToday: editId ? (agents.find(a => a.id === editId)?.callsToday || 0) : 0,
      status: editId ? (agents.find(a => a.id === editId)?.status || "active") : "active",
      createdDate: editId ? (agents.find(a => a.id === editId)?.createdDate || new Date().toISOString().split("T")[0]) : new Date().toISOString().split("T")[0]
    };

    setIsSaving(true);
    try {
      const saved = editId
        ? await updateAgent(agentData)
        : await addAgent(agentData);
      if (saved) window.location.hash = "#/agents";
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    window.location.hash = "#/agents";
  };

  return (
    <section id="view-agent-builder" className="view-pane active-view">
      <div className="page-header">
        <div>
          <h1 className="page-title">{editId ? `Edit Voice Agent: ${name}` : "Create Voice Agent"}</h1>
          <p className="page-subtitle">Create, design, and configure multilingual voice agents with live speech previews.</p>
        </div>
        <div className="header-controls">
          <button className="secondary-btn" onClick={handleCancel}>
            Cancel
          </button>
          <button className="primary-btn" onClick={() => void handleSave()} disabled={isSaving}>
            <Save size={16} /> {isSaving ? "Saving..." : "Save Agent"}
          </button>
        </div>
      </div>

      <div className="builder-workspace">
        {/* Left Side Config Form */}
        <div className="builder-forms-container">
          <div className="builder-tabs">
            <button
              className={`builder-tab-btn ${activeTab === "basic" ? "active" : ""}`}
              onClick={() => setActiveTab("basic")}
            >
              Basic Details
            </button>
            <button
              className={`builder-tab-btn ${activeTab === "prompt" ? "active" : ""}`}
              onClick={() => setActiveTab("prompt")}
            >
              Prompt Studio
            </button>
            <button
              className={`builder-tab-btn ${activeTab === "voice" ? "active" : ""}`}
              onClick={() => setActiveTab("voice")}
            >
              Voice & Language
            </button>
            <button
              className={`builder-tab-btn ${activeTab === "knowledge" ? "active" : ""}`}
              onClick={() => setActiveTab("knowledge")}
            >
              Knowledge Base
            </button>
            <button
              className={`builder-tab-btn ${activeTab === "hours" ? "active" : ""}`}
              onClick={() => setActiveTab("hours")}
            >
              Business Hours
            </button>
          </div>

          <div className="builder-form-scroller">
            {/* SECTION: Basic Details */}
            {activeTab === "basic" && (
              <div className="builder-section active-section">
                <h3 className="builder-section-title">Basic Details</h3>
                <div className="form-grid">
                  <div className="form-group col-span-2">
                    <label className="form-label" htmlFor="builder-name">
                      Agent Name
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      id="builder-name"
                      placeholder="e.g., Sarah - Receptionist"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="builder-type">
                      Business Type / Use Case
                    </label>
                    <select
                      className="form-input"
                      id="builder-type"
                      value={type}
                      onChange={(e) => setType(e.target.value)}
                    >
                      <option value="Customer Support">Customer Support</option>
                      <option value="Receptionist">Receptionist / Front Desk</option>
                      <option value="Sales Agent">Sales Agent</option>
                      <option value="Lead Qualification">Lead Qualification</option>
                      <option value="Surveys & Feedback">Surveys & Feedback</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="builder-timezone">
                      Timezone
                    </label>
                    <select
                      className="form-input"
                      id="builder-timezone"
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                    >
                      <option value="America/New_York">EST (New York)</option>
                      <option value="Europe/London">GMT (London)</option>
                      <option value="Asia/Kolkata">IST (Kolkata)</option>
                      <option value="Asia/Singapore">SGT (Singapore)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION: Prompt Studio */}
            {activeTab === "prompt" && (
              <div className="builder-section active-section">
                <h3 className="builder-section-title">Prompt Studio</h3>
                <div className="form-grid">
                  <div className="form-group col-span-2">
                    <label className="form-label" htmlFor="builder-prompt-greeting">
                      Greeting Message
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      id="builder-prompt-greeting"
                      placeholder="e.g., Thank you for calling EchoVocal, this is Sarah. How can I help you today?"
                      value={greeting}
                      onChange={(e) => setGreeting(e.target.value)}
                    />
                    <p className="form-help-text">First statement spoken by the agent when the call starts.</p>
                  </div>
                  <div className="form-group col-span-2">
                    <label className="form-label" htmlFor="builder-prompt-system">
                      System Prompt Instructions
                    </label>
                    <textarea
                      className="form-textarea"
                      id="builder-prompt-system"
                      rows={6}
                      placeholder="You are a professional assistant..."
                      value={systemPrompt}
                      onChange={(e) => setSystemPrompt(e.target.value)}
                    ></textarea>
                    <p className="form-help-text">Guides the LLM conversation style, guardrails, and tone.</p>
                  </div>
                  <div className="form-group col-span-2">
                    <label className="form-label" htmlFor="builder-prompt-fallback">
                      Fallback Message
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      id="builder-prompt-fallback"
                      placeholder="e.g., I'm sorry, I'm having trouble understanding."
                      value={fallback}
                      onChange={(e) => setFallback(e.target.value)}
                    />
                    <p className="form-help-text">Spoken if LLM fails, timed out, or needs immediate handoff.</p>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION: Voice & Language */}
            {activeTab === "voice" && (
              <div className="builder-section active-section">
                <h3 className="builder-section-title">Voice & Language Configuration</h3>

                <div className="language-selection-container">
                  <label className="form-label">Supported Languages</label>
                  <p className="form-help-text mb-3">
                    Select the languages this agent will support. The system will auto-detect these on-the-fly.
                  </p>
                  <div className="languages-checkbox-grid">
                    <label className="checkbox-pill">
                      <input
                        type="checkbox"
                        checked={langEn}
                        onChange={(e) => setLangEn(e.target.checked)}
                      />
                      <span>English</span>
                    </label>
                    <label className="checkbox-pill">
                      <input
                        type="checkbox"
                        checked={langHi}
                        onChange={(e) => setLangHi(e.target.checked)}
                      />
                      <span>Hindi</span>
                    </label>
                    <label className="checkbox-pill">
                      <input
                        type="checkbox"
                        checked={langTe}
                        onChange={(e) => setLangTe(e.target.checked)}
                      />
                      <span>Telugu</span>
                    </label>
                    <label className="checkbox-pill">
                      <input
                        type="checkbox"
                        checked={langEs}
                        onChange={(e) => setLangEs(e.target.checked)}
                      />
                      <span>Spanish</span>
                    </label>
                  </div>
                </div>

                <div className="divider"></div>

                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label" htmlFor="builder-voice-provider">
                      Voice Provider
                    </label>
                    <select
                      className="form-input"
                      id="builder-voice-provider"
                      value={provider}
                      onChange={(e) => setProvider(e.target.value)}
                    >
                      <option value="Deepgram">Deepgram (Ultra low latency)</option>
                      <option value="Cartesia">Cartesia (High emotional range)</option>
                      <option value="Kokoro">Kokoro (Open-source default)</option>
                      <option value="Coqui">Coqui TTS (Multi-lingual clone)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="builder-voice-name">
                      Voice Name / Speaker Profile
                    </label>
                    <select
                      className="form-input"
                      id="builder-voice-name"
                      value={voiceName}
                      onChange={(e) => setVoiceName(e.target.value)}
                    >
                      <option value="Aura-Asteria">Aura - Asteria (US Female)</option>
                      <option value="Aura-Athena">Aura - Athena (US Female)</option>
                      <option value="Aura-Orpheus">Aura - Orpheus (US Male)</option>
                      <option value="Cartesia-Sonic">Cartesia - Sonic (Energetic)</option>
                      <option value="Cartesia-British">Cartesia - British Accent</option>
                      <option value="Kokoro-Default">Kokoro - Default Voice</option>
                      <option value="Coqui-Cloned-Voice">Coqui - Cloned Voice 1</option>
                    </select>
                  </div>
                  <div className="form-group col-span-2">
                    <div className="slider-header">
                      <label className="form-label" htmlFor="builder-voice-speed">
                        Speaking Speed: <span>{speed.toFixed(1)}x</span>
                      </label>
                    </div>
                    <input
                      type="range"
                      className="form-range"
                      id="builder-voice-speed"
                      min="0.5"
                      max="2.0"
                      step="0.1"
                      value={speed}
                      onChange={(e) => setSpeed(parseFloat(e.target.value))}
                    />
                  </div>
                </div>

                <div className="voice-preview-box">
                  <input
                    type="text"
                    className="form-input text-sm"
                    value={previewText}
                    onChange={(e) => setPreviewText(e.target.value)}
                  />
                  <button className="secondary-btn btn-sm" onClick={handleListenPreview}>
                    <Play size={12} /> Listen Preview
                  </button>
                </div>
              </div>
            )}

            {/* SECTION: Knowledge Base */}
            {activeTab === "knowledge" && (
              <div className="builder-section active-section">
                <h3 className="builder-section-title">Knowledge Base</h3>
                <p className="form-help-text mb-4">FAQ entries and links are saved with the agent. Document storage and indexing are not connected.</p>

                <label className="form-label">Upload PDF Documents</label>
                <div
                  className="file-drag-zone"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                >
                  <UploadCloud size={32} style={{ marginBottom: "0.5rem" }} />
                  <span>Document upload unavailable until storage is configured</span>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".pdf"
                    style={{ display: "none" }}
                    onChange={handleFileChange}
                  />
                </div>
                <div className="uploaded-files-list">
                  {kbFiles.map((file, idx) => (
                    <div className="uploaded-file-row" key={idx}>
                      <div className="uploaded-file-info">
                        <FileText size={16} />
                        <div>
                          <span className="block text-xs font-semibold">{file.name}</span>
                          <span className="block text-muted text-xs">{file.size}</span>
                        </div>
                      </div>
                      <div className="flex-column align-end">
                        <span className="text-xs text-green font-bold">{file.progress}%</span>
                        <button className="text-btn text-red text-xs" onClick={() => removeKbFile(file.name)}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="divider"></div>

                <div className="faq-section">
                  <div className="flex-between mb-2">
                    <label className="form-label">FAQ Data</label>
                    <button className="text-btn text-xs" onClick={handleAddFaq}>
                      <Plus size={12} /> Add Row
                    </button>
                  </div>
                  <div className="faq-list">
                    {kbFaqs.map((faq, i) => (
                      <div className="faq-row mb-2" key={i}>
                        <input
                          type="text"
                          className="form-input text-xs"
                          placeholder="Question"
                          value={faq.q}
                          onChange={(e) => updateFaq(i, "q", e.target.value)}
                        />
                        <input
                          type="text"
                          className="form-input text-xs"
                          placeholder="Answer"
                          value={faq.a}
                          onChange={(e) => updateFaq(i, "a", e.target.value)}
                        />
                        <button className="danger-btn btn-sm square-btn" onClick={() => removeFaq(i)}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="divider"></div>

                <div className="form-group col-span-2">
                  <label className="form-label" htmlFor="builder-kb-links">
                    Website Crawl Links
                  </label>
                  <input
                    type="url"
                    className="form-input"
                    id="builder-kb-links"
                    placeholder="https://example.com/faq-or-documentation"
                    value={kbLinks}
                    onChange={(e) => setKbLinks(e.target.value)}
                  />
                  <p className="form-help-text">Agent will index URLs to extract business parameters.</p>
                </div>
              </div>
            )}

            {/* SECTION: Business Hours */}
            {activeTab === "hours" && (
              <div className="builder-section active-section">
                <h3 className="builder-section-title">Business Hours & Time Rules</h3>
                <p className="form-help-text mb-4 font-normal">
                  Define when the agent is online to answer active calls. Calls received outside these times will route directly to voicemail/fallback messages.
                </p>

                <div className="working-days-selection">
                  <label className="form-label mb-2">Working Days</label>
                  <div className="days-checkbox-grid">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                      <label className="day-checkbox" key={day}>
                        <input
                          type="checkbox"
                          checked={workingDays.includes(day)}
                          onChange={() => toggleWorkingDay(day)}
                        />
                        <span>{day[0]}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="divider"></div>

                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label" htmlFor="builder-hours-start">
                      Start Work Hour
                    </label>
                    <select
                      className="form-input"
                      id="builder-hours-start"
                      value={hoursStart}
                      onChange={(e) => setHoursStart(e.target.value)}
                    >
                      <option value="08:00">08:00 AM</option>
                      <option value="09:00">09:00 AM</option>
                      <option value="10:00">10:00 AM</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="builder-hours-end">
                      End Work Hour
                    </label>
                    <select
                      className="form-input"
                      id="builder-hours-end"
                      value={hoursEnd}
                      onChange={(e) => setHoursEnd(e.target.value)}
                    >
                      <option value="17:00">05:00 PM</option>
                      <option value="18:00">06:00 PM</option>
                      <option value="20:00">08:00 PM</option>
                    </select>
                  </div>
                  <div className="form-group col-span-2">
                    <label className="form-label" htmlFor="builder-hours-holiday">
                      Holiday Dates (comma-separated)
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      id="builder-hours-holiday"
                      placeholder="e.g. 2026-12-25, 2026-01-01"
                      value={holidays}
                      onChange={(e) => setHolidays(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side Chat Sandbox */}
        <div className="builder-sandbox">
          <div className="sandbox-header">
            <div className="sandbox-title-group">
              <span className="sandbox-badge">LOCAL PREVIEW</span>
              <h3>Preset responses only · no AI provider or call is used</h3>
            </div>
            <button className="icon-btn text-red" onClick={handleResetSandbox} title="Reset Sandbox Chat">
              <RotateCcw size={14} />
            </button>
          </div>

          {/* Chat Window Box */}
          <div className="sandbox-chat-body" ref={chatBodyRef}>
            {sandboxMessages.map((msg, index) => {
              if (msg.sender === "system") {
                return (
                  <div className="chat-system-msg" key={index}>
                    {msg.text}
                  </div>
                );
              }
              return (
                <div className={`chat-bubble bubble-${msg.sender}`} key={index}>
                  {msg.text}
                </div>
              );
            })}
          </div>

          {/* Chat Input Console */}
          <div className="sandbox-input-area">
            <input
              type="text"
              placeholder="Type a mock customer message..."
              value={sandboxInput}
              onChange={(e) => setSandboxInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendSandboxMessage()}
            />
            <button className="primary-btn square-btn" onClick={handleSendSandboxMessage} title="Send text prompt">
              <Send size={16} />
            </button>
            <button className="secondary-btn square-btn" onClick={handleMicSimulate} title="Simulate voice conversation">
              <Mic size={16} />
            </button>
          </div>

          <div className="sandbox-audio-waveform-panel">
            <div className={`wave-lines-mini ${isSpeaking ? "active" : ""}`} id="sandbox-wave">
              <span></span>
              <span></span>
              <span></span>
              <span></span>
              <span></span>
            </div>
            <span className="text-xs text-secondary">{audioStatus}</span>
          </div>
        </div>
      </div>
    </section>
  );
};
