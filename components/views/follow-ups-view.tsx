"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useAppState } from "@/context/StateContext";
import type { ApiCallerMessage } from "@/lib/api-client";
import {
  MessageSquareText,
  Calendar,
  Clock,
  Phone,
  Mail,
  Check,
  CheckCircle2,
  X,
  Search,
  Filter,
  RefreshCw,
  ChevronDown,
  PhoneCall,
  Eye,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";

function formatReceivedDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const datePart = d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const timePart = d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return `${datePart}, ${timePart}`;
  } catch {
    return dateStr;
  }
}

function getInitials(name: string): string {
  const clean = name.trim();
  if (!clean || clean === "—" || clean === "Customer") return "C";
  const parts = clean.split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 1).toUpperCase();
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

function getAvatarPastel(name: string): { bg: string; text: string } {
  const char = (name.trim()[0] || "C").toUpperCase();
  if (char === "S") return { bg: "bg-[#E0F2FE]", text: "text-[#0284C7]" };
  if (char === "P") return { bg: "bg-[#EDE8FF]", text: "text-[#6D28D9]" };
  if (char === "M") return { bg: "bg-[#FFE4E6]", text: "text-[#E11D48]" };
  if (char === "A" || char === "B") return { bg: "bg-[#DCFCE7]", text: "text-[#16A34A]" };
  if (char === "R" || char === "K") return { bg: "bg-[#FEF3C7]", text: "text-[#D97706]" };
  const palette = [
    { bg: "bg-[#E0F2FE]", text: "text-[#0284C7]" },
    { bg: "bg-[#EDE8FF]", text: "text-[#6D28D9]" },
    { bg: "bg-[#FFE4E6]", text: "text-[#E11D48]" },
    { bg: "bg-[#DCFCE7]", text: "text-[#16A34A]" },
    { bg: "bg-[#FEF3C7]", text: "text-[#D97706]" },
  ];
  return palette[name.charCodeAt(0) % palette.length];
}

function FollowUpStatusPill({ status }: { status: string }) {
  const s = (status || "").toLowerCase();
  if (s === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]/60 whitespace-nowrap shadow-2xs">
        <Clock className="h-3.5 w-3.5 text-[#92400E] stroke-[2.2]" />
        Pending
      </span>
    );
  }
  if (s === "contacted" || s === "handled") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE]/60 whitespace-nowrap shadow-2xs">
        <PhoneCall className="h-3.5 w-3.5 text-[#1D4ED8] stroke-[2.2]" />
        Contacted
      </span>
    );
  }
  if (s === "completed" || s === "archived") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold bg-[#DCFCE7] text-[#166534] border border-[#86EFAC]/40 whitespace-nowrap shadow-2xs">
        <CheckCircle2 className="h-3.5 w-3.5 text-[#166534] stroke-[2.5]" />
        Completed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold bg-slate-100 text-slate-700 border border-slate-200/80 whitespace-nowrap shadow-2xs capitalize">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
      {status}
    </span>
  );
}

export const FollowUpsView: React.FC = () => {
  const {
    messages,
    messagesLoading,
    messagesError,
    loadMessages,
    updateMessageStatus,
    showToast,
  } = useAppState();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [selectedMessage, setSelectedMessage] = useState<ApiCallerMessage | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  // Keep selectedMessage in sync with messages in state
  useEffect(() => {
    if (selectedMessage) {
      const updated = messages.find((m) => m.id === selectedMessage.id);
      if (updated) {
        setSelectedMessage(updated);
      }
    }
  }, [messages, selectedMessage]);

  // Real statistics calculated directly from loaded backend caller messages
  const stats = useMemo(() => {
    const total = messages.length;
    const pending = messages.filter((m) => (m.status || "").toLowerCase() === "pending").length;
    const contacted = messages.filter((m) => {
      const s = (m.status || "").toLowerCase();
      return s === "contacted" || s === "handled";
    }).length;
    const completed = messages.filter((m) => {
      const s = (m.status || "").toLowerCase();
      return s === "completed" || s === "archived";
    }).length;
    return { total, pending, contacted, completed };
  }, [messages]);

  // Filtered follow-ups list matching search, status filter, and date filter
  const filteredMessages = useMemo(() => {
    return messages.filter((msg) => {
      // Status filter
      if (statusFilter && statusFilter !== "all") {
        const s = (msg.status || "").toLowerCase();
        if (statusFilter === "pending" && s !== "pending") return false;
        if (statusFilter === "contacted" && s !== "contacted" && s !== "handled") return false;
        if (statusFilter === "completed" && s !== "completed" && s !== "archived") return false;
        if (
          statusFilter !== "pending" &&
          statusFilter !== "contacted" &&
          statusFilter !== "completed"
        ) {
          if (s !== statusFilter.toLowerCase()) return false;
        }
      }

      // Date filter
      if (dateFilter) {
        const msgDate = new Date(msg.createdAt);
        if (!isNaN(msgDate.getTime())) {
          const year = msgDate.getFullYear();
          const month = String(msgDate.getMonth() + 1).padStart(2, "0");
          const day = String(msgDate.getDate()).padStart(2, "0");
          const ymd = `${year}-${month}-${day}`;
          if (ymd !== dateFilter) return false;
        } else if (!msg.createdAt.startsWith(dateFilter)) {
          return false;
        }
      }

      // Search query filter (customer name, phone, email, message, reason)
      if (search.trim()) {
        const query = search.trim().toLowerCase();
        const name = (msg.callerName || "").toLowerCase();
        const phone = (msg.phoneNumber || "").toLowerCase();
        const email = (msg.email || "").toLowerCase();
        const messageText = (msg.message || "").toLowerCase();
        const reasonText = (msg.reason || "").toLowerCase();

        if (
          !name.includes(query) &&
          !phone.includes(query) &&
          !email.includes(query) &&
          !messageText.includes(query) &&
          !reasonText.includes(query)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [messages, search, statusFilter, dateFilter]);

  const hasActiveFilters = Boolean(search.trim() || statusFilter !== "all" || dateFilter);

  const resetFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setDateFilter("");
  };

  const handleStatusChange = async (
    id: string,
    newStatus: "pending" | "handled" | "archived",
  ) => {
    setUpdatingId(id);
    try {
      await updateMessageStatus(id, newStatus);
    } catch {
      showToast("Failed to update status", "error");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6 w-full pb-8">
      {/* 1. Header — matches Bookings design */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3.5 flex-wrap">
            <div className="h-11 w-11 rounded-[14px] bg-[#F1EDFF] border border-[#DDD6FE]/70 flex items-center justify-center text-[#6D28D9] shadow-2xs shrink-0">
              <MessageSquareText className="h-6 w-6 text-[#6D28D9]" />
            </div>
            <h1 className="text-[30px] sm:text-[32px] font-bold tracking-tight text-[#111827] leading-none">
              Follow-Ups
            </h1>
            <span className="inline-flex items-center px-3.5 py-1 rounded-full text-[13px] font-semibold bg-[#EDE8FF] text-[#6D28D9] border border-[#DDD6FE]/60 shadow-2xs">
              {messages.length} {messages.length === 1 ? "Follow-Up" : "Follow-Ups"}
            </span>
          </div>
          <p className="text-[14px] text-[#64748B] font-normal pl-0.5 pt-0.5">
            Manage caller messages, customer enquiries, and pending follow-up activities.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => void loadMessages()}
            disabled={messagesLoading}
            className="inline-flex items-center gap-2 px-4 py-2.5 h-[46px] rounded-xl text-[14px] font-semibold bg-white border border-[#E2E8F0] text-[#111827] hover:bg-slate-50 active:bg-slate-100 shadow-2xs transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#6D28D9]/20 disabled:opacity-60"
          >
            <RefreshCw
              className={`h-4 w-4 text-[#6D28D9] ${messagesLoading ? "animate-spin" : ""}`}
            />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 2. Four Summary Cards — fully center-aligned layout */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* Card 1: Total Follow-Ups */}
        <div className="bg-[#FCFAFF] rounded-[16px] border border-[#E9D5FF] p-5 sm:p-[20px] shadow-[0_1px_3px_rgba(0,0,0,0.03)] min-h-[148px] sm:min-h-[152px] flex flex-col items-center justify-center text-center transition-all hover:border-[#6D28D9]/60">
          <div className="h-[46px] w-[46px] rounded-[12px] bg-[#F1EDFF] border border-[#DDD6FE]/70 flex items-center justify-center text-[#6D28D9] shadow-2xs mb-2.5 shrink-0">
            <MessageSquareText className="h-5 w-5 text-[#6D28D9]" />
          </div>
          <p className="text-[15px] font-semibold text-[#111827]">Total Follow-Ups</p>
          <p className="text-[30px] sm:text-[34px] font-bold text-[#111827] tracking-tight leading-none mt-1.5">
            {stats.total}
          </p>
        </div>

        {/* Card 2: Pending */}
        <div className="bg-[#FFFDF5] rounded-[16px] border border-[#FDE68A] p-5 sm:p-[20px] shadow-[0_1px_3px_rgba(0,0,0,0.03)] min-h-[148px] sm:min-h-[152px] flex flex-col items-center justify-center text-center transition-all hover:border-[#F59E0B]/60">
          <div className="h-[46px] w-[46px] rounded-[12px] bg-[#FEF3C7] border border-[#FDE68A]/60 flex items-center justify-center text-[#D97706] shadow-2xs mb-2.5 shrink-0">
            <Clock className="h-5 w-5 text-[#D97706] stroke-[2.2]" />
          </div>
          <p className="text-[15px] font-semibold text-[#111827]">Pending</p>
          <p className="text-[30px] sm:text-[34px] font-bold text-[#111827] tracking-tight leading-none mt-1.5">
            {stats.pending}
          </p>
        </div>

        {/* Card 3: Contacted */}
        <div className="bg-[#EFF6FF] rounded-[16px] border border-[#BFDBFE] p-5 sm:p-[20px] shadow-[0_1px_3px_rgba(0,0,0,0.03)] min-h-[148px] sm:min-h-[152px] flex flex-col items-center justify-center text-center transition-all hover:border-[#2563EB]/60">
          <div className="h-[46px] w-[46px] rounded-[12px] bg-[#DBEAFE] border border-[#BFDBFE]/70 flex items-center justify-center text-[#2563EB] shadow-2xs mb-2.5 shrink-0">
            <PhoneCall className="h-5 w-5 text-[#2563EB]" />
          </div>
          <p className="text-[15px] font-semibold text-[#111827]">Contacted</p>
          <p className="text-[30px] sm:text-[34px] font-bold text-[#111827] tracking-tight leading-none mt-1.5">
            {stats.contacted}
          </p>
        </div>

        {/* Card 4: Completed */}
        <div className="bg-[#F7FDF9] rounded-[16px] border border-[#BBF7D0] p-5 sm:p-[20px] shadow-[0_1px_3px_rgba(0,0,0,0.03)] min-h-[148px] sm:min-h-[152px] flex flex-col items-center justify-center text-center transition-all hover:border-[#10B981]/60">
          <div className="h-[46px] w-[46px] rounded-[12px] bg-[#DCFCE7] border border-[#86EFAC]/50 flex items-center justify-center text-[#16A34A] shadow-2xs mb-2.5 shrink-0">
            <CheckCircle2 className="h-5 w-5 text-[#16A34A] stroke-[2.5]" />
          </div>
          <p className="text-[15px] font-semibold text-[#111827]">Completed</p>
          <p className="text-[30px] sm:text-[34px] font-bold text-[#111827] tracking-tight leading-none mt-1.5">
            {stats.completed}
          </p>
        </div>
      </div>

      {/* 3. Search and Filter Toolbar Container */}
      <div className="bg-white rounded-[16px] border border-[#E2E8F0] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[14px_18px] min-h-[76px] flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3.5 sm:gap-4">
        {/* Search Input (with absolute icon and proper 44px left padding) */}
        <div className="relative flex-[42] min-w-[280px] flex items-center">
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
            aria-label="Search follow-ups"
            className="h-[48px] w-full rounded-[12px] pl-11 pr-4 text-[14px] sm:text-[15px] bg-white text-[#111827] border border-[#E2E8F0] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#6D28D9] focus:ring-2 focus:ring-[#6D28D9]/15 transition-all"
            style={{ paddingLeft: "44px", paddingRight: "14px" }}
            placeholder="Search by customer, phone, email, message..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Status Dropdown */}
        <div className="relative flex-[15] min-w-[150px] max-w-full lg:max-w-[180px]">
          <select
            aria-label="Filter by follow-up status"
            className="h-[48px] w-full rounded-[12px] pl-4 pr-10 text-[14px] font-medium text-[#334155] bg-white border border-[#E2E8F0] focus:outline-none focus:border-[#6D28D9] focus:ring-2 focus:ring-[#6D28D9]/15 transition-all cursor-pointer appearance-none"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="contacted">Contacted</option>
            <option value="completed">Completed</option>
          </select>
          <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8] pointer-events-none" />
        </div>

        {/* Date Picker */}
        <div className="relative flex-[17] min-w-[160px] max-w-full lg:max-w-[200px]">
          <input
            type="date"
            aria-label="Filter by date received"
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
            className="h-[48px] px-5 w-full lg:w-auto rounded-[12px] text-[14px] font-semibold text-[#6D28D9] bg-white border border-[#DDD6FE] hover:border-[#6D28D9] hover:bg-[#F8F6FF] active:bg-[#F1EDFF] transition-all cursor-pointer flex items-center justify-center gap-2 shadow-2xs"
          >
            <Filter className="h-4 w-4 text-[#6D28D9]" />
            <span>Clear Filters</span>
          </button>
        </div>
      </div>

      {/* 4. Follow-Ups Table Card — exact 7 columns & lavender header */}
      <div className="rounded-[16px] bg-white border border-[#E2E8F0] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse table-auto">
            <thead>
              <tr className="bg-[#F1EDFF] border-b border-[#DDD6FE]/60 h-[46px]">
                <th className="py-3.5 px-5 min-w-[170px] text-[12px] font-bold text-[#1E1B4B] uppercase tracking-wider select-none">
                  CUSTOMER NAME
                </th>
                <th className="py-3.5 px-5 min-w-[170px] text-[12px] font-bold text-[#1E1B4B] uppercase tracking-wider select-none">
                  PHONE NUMBER
                </th>
                <th className="py-3.5 px-5 min-w-[210px] text-[12px] font-bold text-[#1E1B4B] uppercase tracking-wider select-none">
                  EMAIL
                </th>
                <th className="py-3.5 px-5 min-w-[260px] text-[12px] font-bold text-[#1E1B4B] uppercase tracking-wider select-none">
                  MESSAGE / ENQUIRY
                </th>
                <th className="py-3.5 px-5 min-w-[180px] text-[12px] font-bold text-[#1E1B4B] uppercase tracking-wider select-none">
                  DATE RECEIVED
                </th>
                <th className="py-3.5 px-5 min-w-[150px] text-[12px] font-bold text-[#1E1B4B] uppercase tracking-wider select-none">
                  FOLLOW-UP STATUS
                </th>
                <th className="py-3.5 px-5 min-w-[150px] text-[12px] font-bold text-[#1E1B4B] uppercase tracking-wider select-none text-right">
                  ACTIONS
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9] text-[14px]">
              {messagesLoading ? (
                <tr>
                  <td colSpan={7} className="py-24 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <RefreshCw className="h-8 w-8 animate-spin text-[#6D28D9]" />
                      <span className="text-sm font-medium text-slate-600">
                        Loading follow-ups...
                      </span>
                    </div>
                  </td>
                </tr>
              ) : messagesError ? (
                <tr>
                  <td colSpan={7} role="alert" className="py-16 text-center text-rose-600">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <span className="font-medium">{messagesError}</span>
                      <button
                        type="button"
                        onClick={() => void loadMessages()}
                        className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-white border border-[#E2E8F0] text-slate-700 hover:bg-slate-50 cursor-pointer shadow-2xs"
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> Retry
                      </button>
                    </div>
                  </td>
                </tr>
              ) : filteredMessages.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-24 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-3 max-w-md mx-auto">
                      <div className="h-12 w-12 rounded-2xl bg-[#F1EDFF] border border-[#DDD6FE]/60 flex items-center justify-center text-[#6D28D9]">
                        <MessageSquareText className="h-6 w-6 text-[#6D28D9]" />
                      </div>
                      <div className="space-y-1">
                        <p className="font-semibold text-slate-800 text-base">
                          {hasActiveFilters
                            ? "No matching follow-ups found"
                            : "No follow-up messages recorded yet"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {hasActiveFilters
                            ? "Try adjusting your search terms or filters to find what you're looking for."
                            : "Caller enquiries, callback requests, and caller messages taken by Retell AI will appear here automatically."}
                        </p>
                      </div>
                      {hasActiveFilters ? (
                        <button
                          type="button"
                          onClick={resetFilters}
                          className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-[#6D28D9] bg-white border border-[#DDD6FE] hover:bg-[#F8F6FF] cursor-pointer transition-colors shadow-2xs"
                        >
                          <Filter className="h-3.5 w-3.5 text-[#6D28D9]" />
                          <span>Clear Filters</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void loadMessages()}
                          disabled={messagesLoading}
                          className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-white border border-[#E2E8F0] text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors shadow-2xs"
                        >
                          <RefreshCw
                            className={`h-3.5 w-3.5 text-[#6D28D9] ${messagesLoading ? "animate-spin" : ""}`}
                          />
                          <span>Check for new messages</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredMessages.map((msg) => {
                  const customerName = msg.callerName?.trim() || "Caller";
                  const avatar = getAvatarPastel(customerName);
                  const initial = getInitials(customerName);

                  return (
                    <tr
                      key={msg.id}
                      onClick={() => setSelectedMessage(msg)}
                      title="Click to view full message and follow-up details"
                      className="h-[56px] min-h-[56px] hover:bg-[#FAF9FF] transition-colors cursor-pointer group"
                    >
                      {/* 1. CUSTOMER NAME */}
                      <td className="py-3 px-5 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div
                            className={`h-[34px] w-[34px] rounded-[10px] ${avatar.bg} ${avatar.text} flex items-center justify-center font-bold text-[13px] shrink-0 shadow-2xs`}
                          >
                            {initial}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[14px] text-[#111827] group-hover:text-[#6D28D9] transition-colors">
                              {customerName}
                            </span>
                            {msg.isDnc && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700">
                                DNC
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 2. PHONE NUMBER */}
                      <td className="py-3 px-5 text-[#1E293B] whitespace-nowrap font-medium text-[14px]">
                        {msg.phoneNumber ? (
                          <span className="inline-flex items-center gap-2">
                            <Phone className="h-[15px] w-[15px] text-[#6D28D9] shrink-0" />
                            <span>{msg.phoneNumber}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* 3. EMAIL */}
                      <td className="py-3 px-5 text-[#1E293B] whitespace-nowrap text-[14px]">
                        {msg.email ? (
                          <span className="inline-flex items-center gap-2" title={msg.email}>
                            <Mail className="h-[15px] w-[15px] text-[#6D28D9] shrink-0" />
                            <span className="truncate max-w-[210px]">{msg.email}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* 4. MESSAGE / ENQUIRY */}
                      <td className="py-3 px-5 text-[#1E293B] text-[14px]">
                        <div className="flex flex-col gap-0.5 max-w-[280px]">
                          <span
                            className="truncate text-[#111827] font-normal"
                            title={msg.message}
                          >
                            {msg.message}
                          </span>
                          {msg.reason && (
                            <span
                              className="text-[11px] text-[#64748B] truncate"
                              title={`Reason: ${msg.reason}`}
                            >
                              <span className="font-semibold text-[#475569]">Reason:</span>{" "}
                              {msg.reason}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 5. DATE RECEIVED */}
                      <td className="py-3 px-5 text-[#1E293B] whitespace-nowrap text-[14px]">
                        <span className="inline-flex items-center gap-2">
                          <Calendar className="h-[15px] w-[15px] text-[#6D28D9] shrink-0" />
                          <span>{formatReceivedDate(msg.createdAt)}</span>
                        </span>
                      </td>

                      {/* 6. FOLLOW-UP STATUS */}
                      <td className="py-3 px-5 whitespace-nowrap">
                        <FollowUpStatusPill status={msg.status} />
                      </td>

                      {/* 7. ACTIONS */}
                      <td className="py-3 px-5 whitespace-nowrap text-right">
                        <div
                          className="inline-flex items-center gap-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedMessage(msg)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium bg-slate-50 text-slate-700 hover:bg-[#F1EDFF] hover:text-[#6D28D9] border border-slate-200 transition-colors shadow-2xs"
                            title="View full details"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>View</span>
                          </button>

                          {msg.status === "pending" ? (
                            <button
                              type="button"
                              disabled={updatingId === msg.id}
                              onClick={() => void handleStatusChange(msg.id, "handled")}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[#EFF6FF] text-[#1D4ED8] hover:bg-[#DBEAFE] border border-[#BFDBFE]/60 transition-colors shadow-2xs disabled:opacity-50"
                              title="Mark as Contacted"
                            >
                              <PhoneCall className="h-3.5 w-3.5" />
                              <span>Contacted</span>
                            </button>
                          ) : msg.status === "handled" ? (
                            <button
                              type="button"
                              disabled={updatingId === msg.id}
                              onClick={() => void handleStatusChange(msg.id, "archived")}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium bg-[#DCFCE7] text-[#166534] hover:bg-[#BBF7D0] border border-[#86EFAC]/60 transition-colors shadow-2xs disabled:opacity-50"
                              title="Mark as Completed"
                            >
                              <Check className="h-3.5 w-3.5" />
                              <span>Complete</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={updatingId === msg.id}
                              onClick={() => void handleStatusChange(msg.id, "pending")}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors shadow-2xs disabled:opacity-50"
                              title="Reopen follow-up"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              <span>Reopen</span>
                            </button>
                          )}
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

      {/* 5. Follow-Up Details Modal Dialog */}
      {selectedMessage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          role="presentation"
          onClick={() => setSelectedMessage(null)}
        >
          <div
            className="w-full max-w-xl rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
            aria-labelledby="followup-details-title"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-[#F1F5F9]">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-[#F1EDFF] border border-[#DDD6FE]/70 flex items-center justify-center text-[#6D28D9]">
                  <MessageSquareText className="h-5 w-5 text-[#6D28D9]" />
                </div>
                <div>
                  <h2
                    id="followup-details-title"
                    className="text-[18px] font-bold text-[#111827] leading-tight"
                  >
                    Follow-Up Details
                  </h2>
                  <p className="text-xs text-slate-500">
                    Recorded {formatReceivedDate(selectedMessage.createdAt)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setSelectedMessage(null)}
                className="h-8 w-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="py-4 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Customer Info Card */}
              <div className="bg-[#FAF9FF] rounded-xl p-4 border border-[#DDD6FE]/60">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-11 w-11 rounded-xl ${getAvatarPastel(selectedMessage.callerName).bg} ${getAvatarPastel(selectedMessage.callerName).text} flex items-center justify-center font-bold text-base shadow-2xs`}
                    >
                      {getInitials(selectedMessage.callerName)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-[16px]">
                          {selectedMessage.callerName}
                        </span>
                        {selectedMessage.isDnc && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                            Do Not Call
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">Caller</p>
                    </div>
                  </div>
                  <FollowUpStatusPill status={selectedMessage.status} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-[#DDD6FE]/40 text-xs">
                  <div className="flex items-center gap-2 text-slate-700">
                    <Phone className="h-4 w-4 text-[#6D28D9] shrink-0" />
                    <span className="font-medium">
                      {selectedMessage.phoneNumber || "No phone provided"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-700">
                    <Mail className="h-4 w-4 text-[#6D28D9] shrink-0" />
                    <span className="truncate">
                      {selectedMessage.email || "No email provided"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Message Enquiry Box */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#1E1B4B] uppercase tracking-wider">
                  Caller Message / Enquiry
                </label>
                <div className="p-3.5 bg-white border border-[#E2E8F0] rounded-xl text-sm text-slate-800 whitespace-pre-wrap leading-relaxed shadow-2xs">
                  {selectedMessage.message || "No message body provided."}
                </div>
              </div>

              {/* Reason / Category if available */}
              {selectedMessage.reason && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#1E1B4B] uppercase tracking-wider">
                    Enquiry Reason / Topic
                  </label>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700">
                    {selectedMessage.reason}
                  </div>
                </div>
              )}

              {/* Technical / Call Metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {selectedMessage.callId && (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-0.5">
                    <span className="text-[11px] font-semibold text-slate-500">
                      Retell Call ID
                    </span>
                    <p className="font-mono text-slate-700 truncate" title={selectedMessage.callId}>
                      {selectedMessage.callId}
                    </p>
                  </div>
                )}
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-0.5">
                  <span className="text-[11px] font-semibold text-slate-500">
                    Received Timestamp
                  </span>
                  <p className="text-slate-700">
                    {formatReceivedDate(selectedMessage.createdAt)}
                  </p>
                </div>
              </div>

              {/* Update Status Actions */}
              <div className="pt-2">
                <label className="text-xs font-bold text-[#1E1B4B] uppercase tracking-wider block mb-2">
                  Update Follow-Up Status
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    disabled={updatingId === selectedMessage.id}
                    onClick={() => void handleStatusChange(selectedMessage.id, "pending")}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                      selectedMessage.status === "pending"
                        ? "bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <Clock className="h-3.5 w-3.5" />
                    <span>Pending</span>
                  </button>

                  <button
                    type="button"
                    disabled={updatingId === selectedMessage.id}
                    onClick={() => void handleStatusChange(selectedMessage.id, "handled")}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                      selectedMessage.status === "handled"
                        ? "bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <PhoneCall className="h-3.5 w-3.5" />
                    <span>Contacted</span>
                  </button>

                  <button
                    type="button"
                    disabled={updatingId === selectedMessage.id}
                    onClick={() => void handleStatusChange(selectedMessage.id, "archived")}
                    className={`py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                      selectedMessage.status === "archived"
                        ? "bg-[#DCFCE7] text-[#166534] border-[#86EFAC]"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Completed</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-4 border-t border-[#F1F5F9] flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedMessage(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-white border border-[#E2E8F0] text-slate-700 hover:bg-slate-50 cursor-pointer shadow-2xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FollowUpsView;

