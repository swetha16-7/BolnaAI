"use client";

import React, { useState, useMemo, useEffect, FormEvent } from "react";
import { useAppState, type ContactRecord } from "@/context/StateContext";
import { generateSecureClientUuid } from "@/lib/utils";
import {
  UserRoundSearch,
  Sparkles,
  PhoneCall,
  CheckCircle2,
  Search,
  ChevronDown,
  Filter,
  RefreshCw,
  Phone,
  Mail,
  Building,
  Calendar,
  Eye,
  Pencil,
  Plus,
  X,
  Clock,
  ShieldCheck,
  AlertCircle,
  Check,
  User,
  ExternalLink,
} from "lucide-react";

type ContactForm = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  title: string;
  source: string;
  status: string;
  voiceConsentGranted: boolean;
  voiceConsentSource: "written" | "verbal" | "web_form" | "other";
  voiceConsentEvidence: string;
  doNotCall: boolean;
};

const blankContact: ContactForm = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  company: "",
  title: "",
  source: "",
  status: "new",
  voiceConsentGranted: false,
  voiceConsentSource: "written",
  voiceConsentEvidence: "",
  doNotCall: false,
};

function isConsentSource(value: string | null): value is ContactForm["voiceConsentSource"] {
  return value === "written" || value === "verbal" || value === "web_form" || value === "other";
}

export const LeadsView: React.FC = () => {
  const {
    contacts,
    contactsLoading,
    contactsError,
    loadContacts,
    addContact,
    updateContact,
    agents,
    createCall,
    showToast,
  } = useAppState();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");

  // Modals state
  const [selectedLead, setSelectedLead] = useState<ContactRecord | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ContactRecord | null>(null);
  const [form, setForm] = useState<ContactForm>(blankContact);
  const [saving, setSaving] = useState(false);

  // Call modal state
  const [callingContact, setCallingContact] = useState<ContactRecord | null>(null);
  const [callAgentId, setCallAgentId] = useState("");
  const [callSubmitting, setCallSubmitting] = useState(false);
  const [callConsentConfirmed, setCallConsentConfirmed] = useState(false);

  const callAgents = useMemo(
    () => agents.filter((agent) => agent.status === "active" && agent.retellAgentId.trim()),
    [agents],
  );

  useEffect(() => {
    if (callAgentId && !callAgents.some((a) => a.id === callAgentId)) {
      setCallAgentId(callAgents[0]?.id ?? "");
    }
  }, [callAgents, callAgentId]);

  // Initial load
  useEffect(() => {
    if (contacts.length === 0) {
      void loadContacts();
    }
  }, [contacts.length, loadContacts]);

  // 4 Summary Card Statistics calculated from live database records
  const stats = useMemo(() => {
    let total = contacts.length;
    let newCount = 0;
    let contactedCount = 0;
    let convertedCount = 0;

    contacts.forEach((c) => {
      const st = (c.status || "").toLowerCase().trim();
      if (st === "new") {
        newCount++;
      } else if (st === "contacted") {
        contactedCount++;
      } else if (st === "converted" || st === "qualified") {
        convertedCount++;
      }
    });

    return {
      total,
      new: newCount,
      contacted: contactedCount,
      converted: convertedCount,
    };
  }, [contacts]);

  // Filtered Leads
  const filteredLeads = useMemo(() => {
    return contacts.filter((lead) => {
      const fullName = `${lead.firstName || ""} ${lead.lastName || ""}`.trim();
      const phone = lead.phone || "";
      const email = lead.email || "";
      const company = lead.company || "";
      const title = lead.title || "";
      const source = lead.source || "";
      const status = (lead.status || "new").toLowerCase();

      // Status filter
      if (statusFilter && statusFilter !== "all") {
        if (status !== statusFilter.toLowerCase()) {
          return false;
        }
      }

      // Date filter (lead created date)
      if (dateFilter && lead.createdAt) {
        const leadDate = new Date(lead.createdAt);
        if (!isNaN(leadDate.getTime())) {
          const year = leadDate.getFullYear();
          const month = String(leadDate.getMonth() + 1).padStart(2, "0");
          const day = String(leadDate.getDate()).padStart(2, "0");
          const ymd = `${year}-${month}-${day}`;
          if (ymd !== dateFilter) return false;
        } else if (!lead.createdAt.startsWith(dateFilter)) {
          return false;
        }
      }

      // Search query filter
      if (search.trim()) {
        const query = search.trim().toLowerCase();
        const matches =
          fullName.toLowerCase().includes(query) ||
          phone.toLowerCase().includes(query) ||
          email.toLowerCase().includes(query) ||
          company.toLowerCase().includes(query) ||
          title.toLowerCase().includes(query) ||
          source.toLowerCase().includes(query);

        if (!matches) return false;
      }

      return true;
    });
  }, [contacts, search, statusFilter, dateFilter]);

  const hasActiveFilters = Boolean(search.trim() || statusFilter !== "all" || dateFilter);

  const resetFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setDateFilter("");
  };

  const hasActiveVoiceConsent = (contact: ContactRecord) =>
    Boolean(
      contact.voiceConsentAt &&
        (!contact.voiceConsentRevokedAt ||
          new Date(contact.voiceConsentAt) > new Date(contact.voiceConsentRevokedAt)) &&
        !contact.doNotCall,
    );

  const beginCreate = () => {
    setEditing(null);
    setForm(blankContact);
    setFormOpen(true);
  };

  const beginEdit = (contact: ContactRecord) => {
    setEditing(contact);
    setForm({
      firstName: contact.firstName,
      lastName: contact.lastName ?? "",
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      company: contact.company ?? "",
      title: contact.title ?? "",
      source: contact.source ?? "",
      status: contact.status,
      voiceConsentGranted: Boolean(
        contact.voiceConsentAt &&
          (!contact.voiceConsentRevokedAt ||
            new Date(contact.voiceConsentAt) > new Date(contact.voiceConsentRevokedAt)) &&
          !contact.doNotCall,
      ),
      voiceConsentSource: isConsentSource(contact.voiceConsentSource)
        ? contact.voiceConsentSource
        : "written",
      voiceConsentEvidence: contact.voiceConsentEvidence ?? "",
      doNotCall: contact.doNotCall,
    });
    setFormOpen(true);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    try {
      const saved = editing
        ? await updateContact(editing.id, form)
        : await addContact(form);
      if (saved) {
        setFormOpen(false);
        if (selectedLead && editing && selectedLead.id === editing.id) {
          setSelectedLead({
            ...selectedLead,
            ...form,
            lastName: form.lastName || null,
            email: form.email || null,
            phone: form.phone || null,
            company: form.company || null,
            title: form.title || null,
            source: form.source || null,
          });
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const handleStatusUpdate = async (contact: ContactRecord, newStatus: string) => {
    const success = await updateContact(contact.id, { status: newStatus });
    if (success && selectedLead && selectedLead.id === contact.id) {
      setSelectedLead({ ...selectedLead, status: newStatus });
    }
  };

  const beginCall = (contact: ContactRecord) => {
    if (!contact.phone || !/^\+[1-9]\d{7,14}$/.test(contact.phone)) {
      showToast("Add a valid E.164 phone number before requesting a call.", "error");
      return;
    }
    if (!hasActiveVoiceConsent(contact)) {
      showToast("Recorded, unrevoked consent is required before calling this lead.", "error");
      return;
    }
    if (callAgents.length === 0) {
      showToast("Map an active agent to a Retell agent before requesting a call.", "error");
      return;
    }
    setCallAgentId(callAgents[0].id);
    setCallConsentConfirmed(false);
    setCallingContact(contact);
  };

  const handleCallSubmit = async () => {
    if (!callingContact || !callAgentId || !callConsentConfirmed || callSubmitting) return;
    setCallSubmitting(true);
    try {
      let idempotencyKey: string;
      try {
        idempotencyKey = generateSecureClientUuid();
      } catch (error) {
        showToast(
          error instanceof Error
            ? error.message
            : "Unable to generate a secure request key. Check your browser security settings.",
          "error",
        );
        return;
      }

      const call = await createCall({
        agentId: callAgentId,
        contactId: callingContact.id,
        destination: callingContact.phone ?? "",
        consentConfirmed: callConsentConfirmed,
        idempotencyKey,
      });
      if (call) setCallingContact(null);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Unable to initiate call.",
        "error",
      );
    } finally {
      setCallSubmitting(false);
    }
  };

  const getInitials = (firstName?: string, lastName?: string | null) => {
    const f = (firstName || "").trim()[0] || "";
    const l = (lastName || "").trim()[0] || "";
    return (f + l).toUpperCase() || "L";
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return "—";
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return isoString;
    }
  };

  const renderStatusBadge = (status: string) => {
    const st = (status || "new").toLowerCase();
    switch (st) {
      case "new":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A] whitespace-nowrap">
            <span className="h-1.5 w-1.5 rounded-full bg-[#D97706]" />
            New
          </span>
        );
      case "contacted":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold bg-[#DBEAFE] text-[#1E40AF] border border-[#BFDBFE] whitespace-nowrap">
            <span className="h-1.5 w-1.5 rounded-full bg-[#2563EB]" />
            Contacted
          </span>
        );
      case "qualified":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold bg-[#EDE8FF] text-[#6D28D9] border border-[#DDD6FE] whitespace-nowrap">
            <span className="h-1.5 w-1.5 rounded-full bg-[#7C3AED]" />
            Qualified
          </span>
        );
      case "converted":
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold bg-[#DCFCE7] text-[#166534] border border-[#86EFAC] whitespace-nowrap">
            <span className="h-1.5 w-1.5 rounded-full bg-[#16A34A]" />
            Converted
          </span>
        );
      case "inactive":
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold bg-[#F1F5F9] text-[#475569] border border-[#CBD5E1] whitespace-nowrap">
            <span className="h-1.5 w-1.5 rounded-full bg-[#64748B]" />
            {st ? st.charAt(0).toUpperCase() + st.slice(1) : "Inactive"}
          </span>
        );
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6 w-full max-w-full pb-8">
      {/* 1. Header — matches Bookings and Follow-Ups design language */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3.5 flex-wrap">
            <div className="h-11 w-11 rounded-[14px] bg-[#F1EDFF] border border-[#DDD6FE]/70 flex items-center justify-center text-[#6D28D9] shadow-2xs shrink-0">
              <UserRoundSearch className="h-6 w-6 text-[#6D28D9]" />
            </div>
            <h1 className="text-[30px] sm:text-[32px] font-bold tracking-tight text-[#111827] leading-none">
              Leads
            </h1>
            <span className="inline-flex items-center px-3.5 py-1 rounded-full text-[13px] font-semibold bg-[#EDE8FF] text-[#6D28D9] border border-[#DDD6FE]/60 shadow-2xs">
              {stats.total} {stats.total === 1 ? "Lead" : "Leads"}
            </span>
          </div>
          <p className="text-[14px] text-[#64748B] font-normal pl-0.5 pt-0.5">
            Manage prospective customers and track their interest in Boomi Solutions properties and services.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          <button
            type="button"
            onClick={beginCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 h-[46px] rounded-xl text-[14px] font-semibold bg-[#6D28D9] hover:bg-[#5B21B6] text-white shadow-2xs transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#6D28D9]/30"
          >
            <Plus className="h-4 w-4 stroke-[2.5]" />
            <span>Add Lead</span>
          </button>
          <button
            type="button"
            onClick={() => void loadContacts()}
            disabled={contactsLoading}
            className="inline-flex items-center gap-2 px-4 py-2.5 h-[46px] rounded-xl text-[14px] font-semibold bg-white border border-[#E2E8F0] text-[#111827] hover:bg-slate-50 active:bg-slate-100 shadow-2xs transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#6D28D9]/20 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 text-[#6D28D9] ${contactsLoading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 2. Four Summary Cards — fully center-aligned layout */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 w-full max-w-full">
        {/* Card 1: Total Leads */}
        <div className="bg-[#FCFAFF] rounded-[16px] border border-[#E9D5FF] p-5 sm:p-[20px] shadow-[0_1px_3px_rgba(0,0,0,0.03)] min-h-[148px] sm:min-h-[152px] min-w-0 flex flex-col items-center justify-center text-center transition-all hover:border-[#6D28D9]/60">
          <div className="h-[46px] w-[46px] rounded-[12px] bg-[#F1EDFF] border border-[#DDD6FE]/70 flex items-center justify-center text-[#6D28D9] shadow-2xs mb-2.5 shrink-0">
            <UserRoundSearch className="h-5 w-5 text-[#6D28D9]" />
          </div>
          <p className="text-[15px] font-semibold text-[#111827]">Total Leads</p>
          <p className="text-[30px] sm:text-[34px] font-bold text-[#111827] tracking-tight leading-none mt-1.5">
            {stats.total}
          </p>
        </div>

        {/* Card 2: New Leads */}
        <div className="bg-[#FFFDF5] rounded-[16px] border border-[#FDE68A] p-5 sm:p-[20px] shadow-[0_1px_3px_rgba(0,0,0,0.03)] min-h-[148px] sm:min-h-[152px] min-w-0 flex flex-col items-center justify-center text-center transition-all hover:border-[#F59E0B]/60">
          <div className="h-[46px] w-[46px] rounded-[12px] bg-[#FEF3C7] border border-[#FDE68A]/60 flex items-center justify-center text-[#D97706] shadow-2xs mb-2.5 shrink-0">
            <Sparkles className="h-5 w-5 text-[#D97706] stroke-[2.2]" />
          </div>
          <p className="text-[15px] font-semibold text-[#111827]">New Leads</p>
          <p className="text-[30px] sm:text-[34px] font-bold text-[#111827] tracking-tight leading-none mt-1.5">
            {stats.new}
          </p>
        </div>

        {/* Card 3: Contacted Leads */}
        <div className="bg-[#EFF6FF] rounded-[16px] border border-[#BFDBFE] p-5 sm:p-[20px] shadow-[0_1px_3px_rgba(0,0,0,0.03)] min-h-[148px] sm:min-h-[152px] min-w-0 flex flex-col items-center justify-center text-center transition-all hover:border-[#2563EB]/60">
          <div className="h-[46px] w-[46px] rounded-[12px] bg-[#DBEAFE] border border-[#BFDBFE]/70 flex items-center justify-center text-[#2563EB] shadow-2xs mb-2.5 shrink-0">
            <PhoneCall className="h-5 w-5 text-[#2563EB]" />
          </div>
          <p className="text-[15px] font-semibold text-[#111827]">Contacted Leads</p>
          <p className="text-[30px] sm:text-[34px] font-bold text-[#111827] tracking-tight leading-none mt-1.5">
            {stats.contacted}
          </p>
        </div>

        {/* Card 4: Converted Leads */}
        <div className="bg-[#F7FDF9] rounded-[16px] border border-[#BBF7D0] p-5 sm:p-[20px] shadow-[0_1px_3px_rgba(0,0,0,0.03)] min-h-[148px] sm:min-h-[152px] min-w-0 flex flex-col items-center justify-center text-center transition-all hover:border-[#10B981]/60">
          <div className="h-[46px] w-[46px] rounded-[12px] bg-[#DCFCE7] border border-[#86EFAC]/50 flex items-center justify-center text-[#16A34A] shadow-2xs mb-2.5 shrink-0">
            <CheckCircle2 className="h-5 w-5 text-[#16A34A] stroke-[2.5]" />
          </div>
          <p className="text-[15px] font-semibold text-[#111827]">Converted Leads</p>
          <p className="text-[30px] sm:text-[34px] font-bold text-[#111827] tracking-tight leading-none mt-1.5">
            {stats.converted}
          </p>
        </div>
      </div>

      {/* 3. Search and Filter Toolbar Container */}
      <div className="bg-white rounded-[16px] border border-[#E2E8F0] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[14px_18px] min-h-[76px] flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3.5 sm:gap-4 w-full max-w-full">
        {/* Search Input with 44px left padding to prevent icon overlap */}
        <div className="relative flex-1 min-w-[220px] flex items-center">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-[#94A3B8] pointer-events-none"
            style={{
              left: "16px",
              top: "50%",
              transform: "translateY(-50%)",
              width: "18px",
              height: "18px",
              pointerEvents: "none",
            }}
          />
          <input
            type="text"
            aria-label="Search leads"
            className="h-[48px] w-full rounded-[12px] pl-11 pr-4 text-[14px] sm:text-[15px] bg-white text-[#111827] border border-[#E2E8F0] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#6D28D9] focus:ring-2 focus:ring-[#6D28D9]/15 transition-all"
            style={{ paddingLeft: "44px", paddingRight: "14px" }}
            placeholder="Search by customer, phone, email, property, source..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Status Dropdown */}
        <div className="relative w-full xl:w-[170px] shrink-0">
          <select
            aria-label="Filter by lead status"
            className="h-[48px] w-full rounded-[12px] pl-4 pr-10 text-[14px] font-medium text-[#334155] bg-white border border-[#E2E8F0] focus:outline-none focus:border-[#6D28D9] focus:ring-2 focus:ring-[#6D28D9]/15 transition-all cursor-pointer appearance-none"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="new">New</option>
            <option value="contacted">Contacted</option>
            <option value="qualified">Qualified</option>
            <option value="converted">Converted</option>
            <option value="inactive">Inactive</option>
          </select>
          <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8] pointer-events-none" />
        </div>

        {/* Date Filter */}
        <div className="relative w-full xl:w-[170px] shrink-0">
          <input
            type="date"
            aria-label="Filter by date created"
            className="h-[48px] w-full rounded-[12px] px-3.5 text-[14px] font-medium text-[#334155] bg-white border border-[#E2E8F0] focus:outline-none focus:border-[#6D28D9] focus:ring-2 focus:ring-[#6D28D9]/15 transition-all cursor-pointer"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
          />
        </div>

        {/* Clear Filters Button */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={resetFilters}
            disabled={!hasActiveFilters}
            className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 h-[48px] rounded-[12px] text-[14px] font-medium transition-all w-full xl:w-auto ${
              hasActiveFilters
                ? "bg-[#F1EDFF] text-[#6D28D9] hover:bg-[#E9D5FF] border border-[#DDD6FE] cursor-pointer"
                : "bg-slate-50 text-slate-400 border border-slate-200 cursor-not-allowed opacity-70"
            }`}
          >
            <Filter className="h-4 w-4" />
            <span>Clear Filters</span>
          </button>
        </div>
      </div>

      {/* 4. Leads Table Card */}
      <div className="rounded-[16px] bg-white border border-[#E2E8F0] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden w-full max-w-full">
        {/* Container-only horizontal scrolling */}
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse min-w-[1080px] table-auto">
            {/* Lavender Table Header matching Bookings & Follow-Ups */}
            <thead>
              <tr className="bg-[#F1EDFF] border-b border-[#DDD6FE]/60 h-[48px]">
                <th className="px-4 py-3 text-[12px] font-bold text-[#6D28D9] tracking-wider uppercase min-w-[160px]">
                  CUSTOMER NAME
                </th>
                <th className="px-4 py-3 text-[12px] font-bold text-[#6D28D9] tracking-wider uppercase min-w-[165px]">
                  PHONE NUMBER
                </th>
                <th className="px-4 py-3 text-[12px] font-bold text-[#6D28D9] tracking-wider uppercase min-w-[200px]">
                  EMAIL
                </th>
                <th className="px-4 py-3 text-[12px] font-bold text-[#6D28D9] tracking-wider uppercase min-w-[220px]">
                  PROPERTY / REQUIREMENT
                </th>
                <th className="px-4 py-3 text-[12px] font-bold text-[#6D28D9] tracking-wider uppercase min-w-[140px]">
                  LEAD SOURCE
                </th>
                <th className="px-4 py-3 text-[12px] font-bold text-[#6D28D9] tracking-wider uppercase min-w-[150px]">
                  DATE CREATED
                </th>
                <th className="px-4 py-3 text-[12px] font-bold text-[#6D28D9] tracking-wider uppercase min-w-[140px]">
                  LEAD STATUS
                </th>
                <th className="px-4 py-3 text-[12px] font-bold text-[#6D28D9] tracking-wider uppercase min-w-[210px] text-right">
                  ACTIONS
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {contactsLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[#64748B] text-[14px]">
                    <div className="flex items-center justify-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin text-[#6D28D9]" />
                      <span>Loading leads...</span>
                    </div>
                  </td>
                </tr>
              ) : contactsError ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-red-600 text-[14px]">
                    <div className="flex flex-col items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-red-500" />
                      <span>{contactsError}</span>
                      <button
                        type="button"
                        onClick={() => void loadContacts()}
                        className="mt-2 text-[13px] font-semibold text-[#6D28D9] hover:underline"
                      >
                        Retry Loading
                      </button>
                    </div>
                  </td>
                </tr>
              ) : filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-14 text-center text-[#64748B]">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                      <div className="h-12 w-12 rounded-full bg-[#F1EDFF] flex items-center justify-center text-[#6D28D9] mb-3">
                        <UserRoundSearch className="h-6 w-6" />
                      </div>
                      <p className="text-[16px] font-semibold text-[#111827]">No leads found</p>
                      <p className="text-[13px] text-[#64748B] mt-1">
                        {hasActiveFilters
                          ? "Try clearing your search query or filters to see all prospective customer leads."
                          : "No leads are registered in your workspace yet. Click 'Add Lead' to create one."}
                      </p>
                      {hasActiveFilters && (
                        <button
                          type="button"
                          onClick={resetFilters}
                          className="mt-4 px-4 py-2 rounded-lg bg-[#6D28D9] text-white text-[13px] font-medium hover:bg-[#5B21B6] transition-all"
                        >
                          Reset Filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredLeads.map((lead) => {
                  const fullName = `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || "Unnamed Lead";
                  const canCall = Boolean(lead.phone && hasActiveVoiceConsent(lead) && callAgents.length > 0);

                  return (
                    <tr
                      key={lead.id}
                      className="hover:bg-slate-50/70 transition-colors group cursor-pointer"
                      onClick={() => setSelectedLead(lead)}
                    >
                      {/* 1. Customer Name */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-[#F1EDFF] border border-[#DDD6FE] text-[#6D28D9] font-bold text-[13px] flex items-center justify-center shrink-0">
                            {getInitials(lead.firstName, lead.lastName)}
                          </div>
                          <div>
                            <p className="text-[14px] font-semibold text-[#111827] group-hover:text-[#6D28D9] transition-colors leading-tight">
                              {fullName}
                            </p>
                            {lead.title && (
                              <p className="text-[12px] text-[#64748B] mt-0.5">{lead.title}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 2. Phone Number */}
                      <td className="px-4 py-3.5">
                        {lead.phone ? (
                          <div className="flex items-center gap-2 text-[14px] font-medium text-[#334155]">
                            <Phone className="h-3.5 w-3.5 text-[#94A3B8] shrink-0" />
                            <span>{lead.phone}</span>
                          </div>
                        ) : (
                          <span className="text-[13px] text-slate-400">—</span>
                        )}
                      </td>

                      {/* 3. Email */}
                      <td className="px-4 py-3.5">
                        {lead.email ? (
                          <div className="flex items-center gap-2 text-[13px] text-[#475569]">
                            <Mail className="h-3.5 w-3.5 text-[#94A3B8] shrink-0" />
                            <span className="truncate max-w-[190px]" title={lead.email}>
                              {lead.email}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[13px] text-slate-400">—</span>
                        )}
                      </td>

                      {/* 4. Property / Requirement */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <Building className="h-3.5 w-3.5 text-[#94A3B8] shrink-0" />
                          <span className="text-[13px] font-medium text-[#1E293B] truncate max-w-[210px]">
                            {lead.company || "General Property Interest"}
                          </span>
                        </div>
                      </td>

                      {/* 5. Lead Source */}
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[12px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                          {lead.source || "Website"}
                        </span>
                      </td>

                      {/* 6. Date Created */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 text-[13px] text-[#475569]">
                          <Calendar className="h-3.5 w-3.5 text-[#94A3B8] shrink-0" />
                          <span>{formatDate(lead.createdAt)}</span>
                        </div>
                      </td>

                      {/* 7. Lead Status */}
                      <td className="px-4 py-3.5">
                        {renderStatusBadge(lead.status)}
                      </td>

                      {/* 8. Actions */}
                      <td
                        className="px-4 py-3.5 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                          {/* View details button */}
                          <button
                            type="button"
                            onClick={() => setSelectedLead(lead)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[13px] font-medium text-[#475569] bg-white border border-[#CBD5E1] hover:bg-slate-50 hover:text-[#111827] transition-all cursor-pointer shadow-2xs"
                            title="View lead details"
                          >
                            <Eye className="h-3.5 w-3.5 text-[#6D28D9]" />
                            <span>View</span>
                          </button>

                          {/* Edit button */}
                          <button
                            type="button"
                            onClick={() => beginEdit(lead)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[13px] font-medium text-[#475569] bg-white border border-[#CBD5E1] hover:bg-slate-50 hover:text-[#111827] transition-all cursor-pointer shadow-2xs"
                            title="Edit lead"
                          >
                            <Pencil className="h-3.5 w-3.5 text-[#2563EB]" />
                            <span>Edit</span>
                          </button>

                          {/* Outbound call button */}
                          <button
                            type="button"
                            onClick={() => beginCall(lead)}
                            disabled={!canCall}
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[13px] font-semibold transition-all shadow-2xs ${
                              canCall
                                ? "bg-[#DCFCE7] text-[#166534] border border-[#86EFAC] hover:bg-[#BBF7D0] cursor-pointer"
                                : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60"
                            }`}
                            title={
                              lead.doNotCall || !hasActiveVoiceConsent(lead)
                                ? "Recorded, unrevoked voice-call consent is required"
                                : callAgents.length === 0
                                ? "No active agent has a Retell mapping"
                                : "Call this lead with an AI Agent"
                            }
                          >
                            <PhoneCall className="h-3.5 w-3.5 text-[#16A34A]" />
                            <span>Call</span>
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

      {/* 5. Lead Details Modal */}
      {selectedLead && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          role="presentation"
          onClick={() => setSelectedLead(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="lead-details-title"
            className="w-full max-w-2xl rounded-2xl border border-[#E2E8F0] bg-white p-6 sm:p-7 shadow-2xl overflow-y-auto max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-[#E2E8F0]">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-[#F1EDFF] border border-[#DDD6FE] text-[#6D28D9] font-bold text-[16px] flex items-center justify-center shrink-0">
                  {getInitials(selectedLead.firstName, selectedLead.lastName)}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 id="lead-details-title" className="text-[20px] font-bold text-[#111827]">
                      {`${selectedLead.firstName || ""} ${selectedLead.lastName || ""}`.trim() || "Unnamed Lead"}
                    </h2>
                    {renderStatusBadge(selectedLead.status)}
                  </div>
                  <p className="text-[13px] text-[#64748B] mt-0.5">
                    Lead ID: <span className="font-mono text-slate-700">{selectedLead.id.slice(0, 13)}...</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setSelectedLead(null)}
                className="h-9 w-9 rounded-lg border border-[#E2E8F0] text-[#64748B] hover:text-[#111827] hover:bg-slate-100 flex items-center justify-center transition-all cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="py-5 space-y-5">
              {/* Key Contact Information Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="text-[12px] font-semibold text-[#64748B] uppercase tracking-wider block">
                    Phone Number
                  </span>
                  <p className="text-[15px] font-medium text-[#111827] mt-1 flex items-center gap-2">
                    <Phone className="h-4 w-4 text-[#6D28D9]" />
                    {selectedLead.phone || "No phone recorded"}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="text-[12px] font-semibold text-[#64748B] uppercase tracking-wider block">
                    Email Address
                  </span>
                  <p className="text-[15px] font-medium text-[#111827] mt-1 flex items-center gap-2 truncate">
                    <Mail className="h-4 w-4 text-[#6D28D9]" />
                    {selectedLead.email || "No email recorded"}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="text-[12px] font-semibold text-[#64748B] uppercase tracking-wider block">
                    Property / Requirement
                  </span>
                  <p className="text-[15px] font-medium text-[#111827] mt-1 flex items-center gap-2">
                    <Building className="h-4 w-4 text-[#6D28D9]" />
                    {selectedLead.company || "General Property Interest"}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="text-[12px] font-semibold text-[#64748B] uppercase tracking-wider block">
                    Lead Source
                  </span>
                  <p className="text-[15px] font-medium text-[#111827] mt-1">
                    {selectedLead.source || "Website Form"}
                  </p>
                </div>
              </div>

              {/* Status Quick Updater */}
              <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
                <span className="text-[12px] font-bold text-[#475569] uppercase tracking-wider block mb-2">
                  Update Lead Pipeline Status
                </span>
                <div className="flex flex-wrap gap-2">
                  {(["new", "contacted", "qualified", "converted", "inactive"] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => void handleStatusUpdate(selectedLead, st)}
                      className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold transition-all cursor-pointer ${
                        (selectedLead.status || "").toLowerCase() === st
                          ? "bg-[#6D28D9] text-white shadow-2xs"
                          : "bg-white text-[#475569] border border-[#CBD5E1] hover:bg-slate-100"
                      }`}
                    >
                      {st.charAt(0).toUpperCase() + st.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Voice Consent & Compliance Details */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[12px] font-bold text-[#475569] uppercase tracking-wider block mb-2">
                  AI Voice Call Consent & Compliance
                </span>
                <div className="space-y-2 text-[13px]">
                  <div className="flex items-center justify-between">
                    <span className="text-[#64748B]">Consent Status:</span>
                    <span
                      className={`font-semibold px-2.5 py-0.5 rounded-md ${
                        hasActiveVoiceConsent(selectedLead)
                          ? "bg-[#DCFCE7] text-[#166534] border border-[#86EFAC]"
                          : "bg-red-50 text-red-700 border border-red-200"
                      }`}
                    >
                      {hasActiveVoiceConsent(selectedLead)
                        ? "Verified Consent Granted"
                        : selectedLead.doNotCall
                        ? "Do Not Call (Revoked)"
                        : "No Active Voice Consent"}
                    </span>
                  </div>
                  {selectedLead.voiceConsentSource && (
                    <div className="flex items-center justify-between">
                      <span className="text-[#64748B]">Consent Method:</span>
                      <span className="font-medium text-[#111827] capitalize">
                        {selectedLead.voiceConsentSource.replace("_", " ")}
                      </span>
                    </div>
                  )}
                  {selectedLead.voiceConsentEvidence && (
                    <div className="pt-1 border-t border-slate-200">
                      <span className="text-[#64748B] block text-[12px]">Evidence Record:</span>
                      <p className="text-[#1E293B] italic mt-0.5 bg-white p-2 rounded border border-slate-200">
                        {selectedLead.voiceConsentEvidence}
                      </p>
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[#64748B]">Date Created:</span>
                    <span className="font-medium text-[#111827]">{formatDate(selectedLead.createdAt)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-4 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const toEdit = selectedLead;
                    setSelectedLead(null);
                    beginEdit(toEdit);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-[#CBD5E1] bg-white text-[#111827] text-[14px] font-semibold hover:bg-slate-50 transition-all cursor-pointer shadow-2xs"
                >
                  <Pencil className="h-4 w-4 text-[#2563EB]" />
                  <span>Edit Details</span>
                </button>

                <button
                  type="button"
                  disabled={!selectedLead.phone || !hasActiveVoiceConsent(selectedLead) || callAgents.length === 0}
                  onClick={() => {
                    const toCall = selectedLead;
                    setSelectedLead(null);
                    beginCall(toCall);
                  }}
                  className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[14px] font-semibold transition-all shadow-2xs ${
                    selectedLead.phone && hasActiveVoiceConsent(selectedLead) && callAgents.length > 0
                      ? "bg-[#DCFCE7] text-[#166534] border border-[#86EFAC] hover:bg-[#BBF7D0] cursor-pointer"
                      : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60"
                  }`}
                >
                  <PhoneCall className="h-4 w-4 text-[#16A34A]" />
                  <span>Initiate AI Call</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setSelectedLead(null)}
                className="px-5 py-2.5 rounded-xl bg-slate-100 text-[#334155] text-[14px] font-semibold hover:bg-slate-200 transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </section>
        </div>
      )}

      {/* 6. Add / Edit Lead Modal */}
      {formOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          role="presentation"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="lead-form-title"
            className="w-full max-w-xl rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xl overflow-y-auto max-h-[90vh]"
          >
            <div className="mb-5 flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
              <h2 id="lead-form-title" className="text-[18px] font-bold text-[#111827]">
                {editing ? "Edit Lead Details" : "Add New Lead"}
              </h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setFormOpen(false)}
                className="h-8 w-8 rounded-lg text-slate-400 hover:text-slate-700 flex items-center justify-center cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
              <label className="grid gap-1 text-[13px] font-medium text-[#334155]">
                First Name *
                <input
                  required
                  minLength={1}
                  className="h-10 rounded-lg border border-[#CBD5E1] bg-white px-3 text-[14px] text-[#111827] focus:outline-none focus:border-[#6D28D9] focus:ring-1 focus:ring-[#6D28D9]"
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  placeholder="e.g. John"
                />
              </label>

              <label className="grid gap-1 text-[13px] font-medium text-[#334155]">
                Last Name
                <input
                  className="h-10 rounded-lg border border-[#CBD5E1] bg-white px-3 text-[14px] text-[#111827] focus:outline-none focus:border-[#6D28D9] focus:ring-1 focus:ring-[#6D28D9]"
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  placeholder="e.g. Smith"
                />
              </label>

              <label className="grid gap-1 text-[13px] font-medium text-[#334155]">
                Email Address
                <input
                  type="email"
                  className="h-10 rounded-lg border border-[#CBD5E1] bg-white px-3 text-[14px] text-[#111827] focus:outline-none focus:border-[#6D28D9] focus:ring-1 focus:ring-[#6D28D9]"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="john@example.com"
                />
              </label>

              <label className="grid gap-1 text-[13px] font-medium text-[#334155]">
                Phone Number (E.164)
                <input
                  type="tel"
                  placeholder="+14155552671 or +919876543210"
                  className="h-10 rounded-lg border border-[#CBD5E1] bg-white px-3 text-[14px] text-[#111827] focus:outline-none focus:border-[#6D28D9] focus:ring-1 focus:ring-[#6D28D9]"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </label>

              <label className="grid gap-1 text-[13px] font-medium text-[#334155]">
                Property Requirement / Company
                <input
                  className="h-10 rounded-lg border border-[#CBD5E1] bg-white px-3 text-[14px] text-[#111827] focus:outline-none focus:border-[#6D28D9] focus:ring-1 focus:ring-[#6D28D9]"
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                  placeholder="e.g. 3BHK Villa, Palm Grove"
                />
              </label>

              <label className="grid gap-1 text-[13px] font-medium text-[#334155]">
                Title / Role
                <input
                  className="h-10 rounded-lg border border-[#CBD5E1] bg-white px-3 text-[14px] text-[#111827] focus:outline-none focus:border-[#6D28D9] focus:ring-1 focus:ring-[#6D28D9]"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Prospective Buyer"
                />
              </label>

              <label className="grid gap-1 text-[13px] font-medium text-[#334155]">
                Lead Source
                <input
                  className="h-10 rounded-lg border border-[#CBD5E1] bg-white px-3 text-[14px] text-[#111827] focus:outline-none focus:border-[#6D28D9] focus:ring-1 focus:ring-[#6D28D9]"
                  value={form.source}
                  onChange={(e) => setForm({ ...form, source: e.target.value })}
                  placeholder="e.g. Website, Cal.com, Referral"
                />
              </label>

              <label className="grid gap-1 text-[13px] font-medium text-[#334155]">
                Lead Status
                <select
                  className="h-10 rounded-lg border border-[#CBD5E1] bg-white px-3 text-[14px] text-[#111827] focus:outline-none focus:border-[#6D28D9] focus:ring-1 focus:ring-[#6D28D9]"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="qualified">Qualified</option>
                  <option value="converted">Converted</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>

              <div className="sm:col-span-2 pt-2 border-t border-[#E2E8F0]">
                <label className="flex items-center gap-2 text-[13px] font-medium text-[#334155] cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded text-[#6D28D9] focus:ring-[#6D28D9]"
                    checked={form.voiceConsentGranted}
                    disabled={form.doNotCall}
                    onChange={(e) => setForm({ ...form, voiceConsentGranted: e.target.checked })}
                  />
                  <span>I verified this contact explicitly consented to AI voice calls.</span>
                </label>
              </div>

              {form.voiceConsentGranted && (
                <>
                  <label className="grid gap-1 text-[13px] font-medium text-[#334155]">
                    Consent Source
                    <select
                      className="h-10 rounded-lg border border-[#CBD5E1] bg-white px-3 text-[14px] text-[#111827] focus:outline-none focus:border-[#6D28D9]"
                      value={form.voiceConsentSource}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          voiceConsentSource: e.target.value as ContactForm["voiceConsentSource"],
                        })
                      }
                    >
                      <option value="written">Written</option>
                      <option value="verbal">Verbal</option>
                      <option value="web_form">Web form</option>
                      <option value="other">Other</option>
                    </select>
                  </label>

                  <label className="grid gap-1 text-[13px] font-medium text-[#334155] sm:col-span-2">
                    Consent Evidence Note *
                    <textarea
                      required
                      minLength={5}
                      maxLength={500}
                      rows={2}
                      className="rounded-lg border border-[#CBD5E1] bg-white p-2.5 text-[14px] text-[#111827] focus:outline-none focus:border-[#6D28D9]"
                      value={form.voiceConsentEvidence}
                      onChange={(e) => setForm({ ...form, voiceConsentEvidence: e.target.value })}
                      placeholder="Record where/how consent was obtained (e.g. Website contact form checkbox on Nov 4, 2026)"
                    />
                  </label>
                </>
              )}

              <div className="sm:col-span-2">
                <label className="flex items-center gap-2 text-[13px] font-medium text-red-600 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded text-red-600 focus:ring-red-500"
                    checked={form.doNotCall}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        doNotCall: e.target.checked,
                        voiceConsentGranted: e.target.checked ? false : form.voiceConsentGranted,
                      })
                    }
                  />
                  <span>Do not call this lead (revokes stored voice-call consent).</span>
                </label>
              </div>

              <div className="col-span-full flex justify-end gap-3 pt-4 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[#CBD5E1] bg-white text-[#334155] text-[14px] font-semibold hover:bg-slate-50 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-[#6D28D9] hover:bg-[#5B21B6] text-white text-[14px] font-semibold transition-all cursor-pointer disabled:opacity-60"
                >
                  {saving ? "Saving..." : editing ? "Save Changes" : "Create Lead"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* 7. Outbound Call Confirmation Modal */}
      {callingContact && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          role="presentation"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="call-lead-title"
            className="w-full max-w-lg rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xl"
          >
            <div className="mb-4 flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-full bg-[#DCFCE7] flex items-center justify-center text-[#16A34A]">
                  <PhoneCall className="h-4 w-4" />
                </div>
                <h2 id="call-lead-title" className="text-[18px] font-bold text-[#111827]">
                  Initiate AI Outbound Call
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setCallingContact(null)}
                disabled={callSubmitting}
                className="h-8 w-8 rounded-lg text-slate-400 hover:text-slate-700 flex items-center justify-center cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mb-4 text-[13px] text-[#475569] leading-relaxed">
              You are requesting a live call to{" "}
              <strong className="text-[#111827]">
                {callingContact.firstName} {callingContact.lastName ?? ""}
              </strong>{" "}
              at <strong className="text-[#111827]">{callingContact.phone}</strong>. Confirm only if you have verified
              compliance rules and applicable calling hours.
            </p>

            <label className="mb-4 grid gap-1.5 text-[13px] font-medium text-[#334155]">
              Active Retell AI Agent
              <select
                className="h-10 rounded-lg border border-[#CBD5E1] bg-white px-3 text-[14px] text-[#111827] focus:outline-none focus:border-[#6D28D9]"
                value={callAgentId}
                onChange={(e) => setCallAgentId(e.target.value)}
              >
                {callAgents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="mb-5 flex items-start gap-2.5 text-[13px] text-[#334155] cursor-pointer bg-slate-50 p-3 rounded-xl border border-slate-200">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded text-[#6D28D9] focus:ring-[#6D28D9]"
                checked={callConsentConfirmed}
                onChange={(e) => setCallConsentConfirmed(e.target.checked)}
              />
              <span>
                I confirm this prospective customer has verified consent to receive an AI voice call at{" "}
                <strong>{callingContact.phone}</strong>.
              </span>
            </label>

            <div className="flex justify-end gap-3 pt-3 border-t border-[#E2E8F0]">
              <button
                type="button"
                onClick={() => setCallingContact(null)}
                disabled={callSubmitting}
                className="px-4 py-2 rounded-xl border border-[#CBD5E1] bg-white text-[#334155] text-[14px] font-semibold hover:bg-slate-50 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleCallSubmit()}
                disabled={callSubmitting || !callAgentId || !callConsentConfirmed}
                className="px-5 py-2 rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white text-[14px] font-semibold transition-all cursor-pointer disabled:opacity-60 shadow-2xs"
              >
                {callSubmitting ? "Initiating Call..." : "Confirm & Call Now"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default LeadsView;

