"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useAppState } from "@/context/StateContext";
import type { ApiAppointment } from "@/lib/api-client";
import {
  CalendarCheck,
  Calendar,
  Check,
  Clock,
  Copy,
  X,
  Search,
  Filter,
  RefreshCw,
  Phone,
  Mail,
  MapPin,
  ChevronDown,
  User,
} from "lucide-react";

function formatBookingDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatBookingTime(dateStr: string | null | undefined, timezone?: string | null): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "—";
    const timeStr = d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    return timezone ? `${timeStr} (${timezone})` : timeStr;
  } catch {
    return "—";
  }
}

function getInitials(name: string): string {
  const clean = name.trim();
  if (!clean || clean === "—" || clean === "Customer") return "C";
  const parts = clean.split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 1);
  return parts[0][0] || "C";
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

function BookingStatusPill({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s === "confirmed") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold bg-[#DCFCE7] text-[#166534] border border-[#86EFAC]/40 whitespace-nowrap shadow-2xs">
        <Check className="h-3.5 w-3.5 text-[#166534] stroke-[2.5]" />
        Confirmed
      </span>
    );
  }
  if (s === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]/60 whitespace-nowrap shadow-2xs">
        <Clock className="h-3.5 w-3.5 text-[#92400E] stroke-[2.5]" />
        Pending
      </span>
    );
  }
  if (s === "cancelled" || s === "canceled") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold bg-[#FEE2E2] text-[#991B1B] border border-[#FECACA]/60 whitespace-nowrap shadow-2xs">
        <X className="h-3.5 w-3.5 text-[#991B1B] stroke-[2.5]" />
        Cancelled
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

export const BookingsView: React.FC = () => {
  const {
    appointments,
    appointmentsLoading,
    appointmentsError,
    loadAppointments,
  } = useAppState();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [selectedBooking, setSelectedBooking] = useState<ApiAppointment | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string) => {
    if (!text) return;
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedId(text);
        window.setTimeout(() => setCopiedId((curr) => (curr === text ? null : curr)), 2000);
      }).catch(() => {});
    }
  };

  useEffect(() => {
    void loadAppointments();
  }, [loadAppointments]);

  // Real statistics calculated directly from loaded backend appointment records
  const stats = useMemo(() => {
    const total = appointments.length;
    const confirmed = appointments.filter((a) => a.status.toLowerCase() === "confirmed").length;
    const pending = appointments.filter((a) => a.status.toLowerCase() === "pending").length;
    const cancelled = appointments.filter(
      (a) => a.status.toLowerCase() === "cancelled" || a.status.toLowerCase() === "canceled"
    ).length;
    return { total, confirmed, pending, cancelled };
  }, [appointments]);

  // Filtered bookings list matching search, status filter, and date filter
  const filteredBookings = useMemo(() => {
    return appointments.filter((appointment) => {
      const meta = (appointment.metadata as Record<string, unknown> | null) ?? {};
      const customerName = appointment.contact
        ? `${appointment.contact.firstName} ${appointment.contact.lastName ?? ""}`.trim()
        : ((meta.customerName as string | undefined) || "");
      const customerPhone =
        appointment.contact?.phone || (meta.phoneNumber as string | undefined) || "";
      const customerEmail =
        appointment.contact?.email || (meta.email as string | undefined) || "";
      const propertyLocation =
        (meta.location as string | undefined) ||
        (meta.propertyType as string | undefined) ||
        appointment.serviceName ||
        "";
      const calcomRef =
        appointment.calcomEventId ||
        (meta.calcomBookingUid as string | undefined) ||
        (meta.bookingUid as string | undefined) ||
        "";

      // Status filter
      if (statusFilter && statusFilter !== "all") {
        if (appointment.status.toLowerCase() !== statusFilter.toLowerCase()) {
          return false;
        }
      }

      // Date filter
      if (dateFilter) {
        const appDate = new Date(appointment.startsAt);
        if (!isNaN(appDate.getTime())) {
          const year = appDate.getFullYear();
          const month = String(appDate.getMonth() + 1).padStart(2, "0");
          const day = String(appDate.getDate()).padStart(2, "0");
          const ymd = `${year}-${month}-${day}`;
          if (ymd !== dateFilter) return false;
        } else if (!appointment.startsAt.startsWith(dateFilter)) {
          return false;
        }
      }

      // Search query filter
      if (search.trim()) {
        const query = search.trim().toLowerCase();
        const matches =
          customerName.toLowerCase().includes(query) ||
          customerPhone.toLowerCase().includes(query) ||
          customerEmail.toLowerCase().includes(query) ||
          propertyLocation.toLowerCase().includes(query) ||
          calcomRef.toLowerCase().includes(query);

        if (!matches) return false;
      }

      return true;
    });
  }, [appointments, search, statusFilter, dateFilter]);

  const hasActiveFilters = Boolean(search.trim() || statusFilter !== "all" || dateFilter);

  const resetFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setDateFilter("");
  };

  return (
    <div className="space-y-5 sm:space-y-6 w-full pb-8">
      {/* 1. Header — matches reference design */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3.5 flex-wrap">
            <div className="h-11 w-11 rounded-[14px] bg-[#F1EDFF] border border-[#DDD6FE]/70 flex items-center justify-center text-[#6D28D9] shadow-2xs shrink-0">
              <CalendarCheck className="h-6 w-6 text-[#6D28D9]" />
            </div>
            <h1 className="text-[30px] sm:text-[32px] font-bold tracking-tight text-[#111827] leading-none">
              Bookings
            </h1>
            <span className="inline-flex items-center px-3.5 py-1 rounded-full text-[13px] font-semibold bg-[#EDE8FF] text-[#6D28D9] border border-[#DDD6FE]/60 shadow-2xs">
              {appointments.length} {appointments.length === 1 ? "Booking" : "Bookings"}
            </span>
          </div>
          <p className="text-[14px] text-[#64748B] font-normal pl-0.5 pt-0.5">
            Manage property viewings and consultation appointments.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => void loadAppointments()}
            disabled={appointmentsLoading}
            className="inline-flex items-center gap-2 px-4 py-2.5 h-[46px] rounded-xl text-[14px] font-semibold bg-white border border-[#E2E8F0] text-[#111827] hover:bg-slate-50 active:bg-slate-100 shadow-2xs transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#6D28D9]/20 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 text-[#6D28D9] ${appointmentsLoading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 2. Four Summary Cards — fully center-aligned layout */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* Card 1: Total Bookings */}
        <div className="bg-[#FCFAFF] rounded-[16px] border border-[#E9D5FF] p-5 sm:p-[20px] shadow-[0_1px_3px_rgba(0,0,0,0.03)] min-h-[148px] sm:min-h-[152px] flex flex-col items-center justify-center text-center transition-all hover:border-[#6D28D9]/60">
          <div className="h-[46px] w-[46px] rounded-[12px] bg-[#F1EDFF] border border-[#DDD6FE]/70 flex items-center justify-center text-[#6D28D9] shadow-2xs mb-2.5 shrink-0">
            <Calendar className="h-5 w-5 text-[#6D28D9]" />
          </div>
          <p className="text-[15px] font-semibold text-[#111827]">Total Bookings</p>
          <p className="text-[30px] sm:text-[34px] font-bold text-[#111827] tracking-tight leading-none mt-1.5">
            {stats.total}
          </p>
        </div>

        {/* Card 2: Confirmed */}
        <div className="bg-[#F7FDF9] rounded-[16px] border border-[#BBF7D0] p-5 sm:p-[20px] shadow-[0_1px_3px_rgba(0,0,0,0.03)] min-h-[148px] sm:min-h-[152px] flex flex-col items-center justify-center text-center transition-all hover:border-[#10B981]/60">
          <div className="h-[46px] w-[46px] rounded-[12px] bg-[#DCFCE7] border border-[#86EFAC]/50 flex items-center justify-center text-[#16A34A] shadow-2xs mb-2.5 shrink-0">
            <Check className="h-5 w-5 text-[#16A34A] stroke-[2.5]" />
          </div>
          <p className="text-[15px] font-semibold text-[#111827]">Confirmed</p>
          <p className="text-[30px] sm:text-[34px] font-bold text-[#111827] tracking-tight leading-none mt-1.5">
            {stats.confirmed}
          </p>
        </div>

        {/* Card 3: Pending */}
        <div className="bg-[#FFFDF5] rounded-[16px] border border-[#FDE68A] p-5 sm:p-[20px] shadow-[0_1px_3px_rgba(0,0,0,0.03)] min-h-[148px] sm:min-h-[152px] flex flex-col items-center justify-center text-center transition-all hover:border-[#F59E0B]/60">
          <div className="h-[46px] w-[46px] rounded-[12px] bg-[#FEF3C7] border border-[#FDE68A]/60 flex items-center justify-center text-[#D97706] shadow-2xs mb-2.5 shrink-0">
            <Clock className="h-5 w-5 text-[#D97706] stroke-[2.2]" />
          </div>
          <p className="text-[15px] font-semibold text-[#111827]">Pending</p>
          <p className="text-[30px] sm:text-[34px] font-bold text-[#111827] tracking-tight leading-none mt-1.5">
            {stats.pending}
          </p>
        </div>

        {/* Card 4: Cancelled */}
        <div className="bg-[#FFF8F8] rounded-[16px] border border-[#FECACA] p-5 sm:p-[20px] shadow-[0_1px_3px_rgba(0,0,0,0.03)] min-h-[148px] sm:min-h-[152px] flex flex-col items-center justify-center text-center transition-all hover:border-[#EF4444]/60">
          <div className="h-[46px] w-[46px] rounded-[12px] bg-[#FEE2E2] border border-[#FECACA]/60 flex items-center justify-center text-[#DC2626] shadow-2xs mb-2.5 shrink-0">
            <X className="h-5 w-5 text-[#DC2626] stroke-[2.5]" />
          </div>
          <p className="text-[15px] font-semibold text-[#111827]">Cancelled</p>
          <p className="text-[30px] sm:text-[34px] font-bold text-[#111827] tracking-tight leading-none mt-1.5">
            {stats.cancelled}
          </p>
        </div>
      </div>

      {/* 3. Search and Filter Toolbar Container */}
      <div className="bg-white rounded-[16px] border border-[#E2E8F0] shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-[14px_18px] min-h-[76px] flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3.5 sm:gap-4">
        {/* Search Input (approx 42-45% of width) */}
        <div className="relative flex-[42] min-w-[280px] flex items-center">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-[#94A3B8] pointer-events-none"
            style={{ left: "16px", top: "50%", transform: "translateY(-50%)", width: "18px", height: "18px", pointerEvents: "none" }}
          />
          <input
            type="text"
            aria-label="Search bookings"
            className="h-[48px] w-full rounded-[12px] pl-11 pr-4 text-[14px] sm:text-[15px] bg-white text-[#111827] border border-[#E2E8F0] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#6D28D9] focus:ring-2 focus:ring-[#6D28D9]/15 transition-all"
            style={{ paddingLeft: "44px", paddingRight: "14px" }}
            placeholder="Search by customer, phone, email, property, reference..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Status Dropdown (approx 15% of width) */}
        <div className="relative flex-[15] min-w-[150px] max-w-full lg:max-w-[180px]">
          <select
            aria-label="Filter by booking status"
            className="h-[48px] w-full rounded-[12px] pl-4 pr-10 text-[14px] font-medium text-[#334155] bg-white border border-[#E2E8F0] focus:outline-none focus:border-[#6D28D9] focus:ring-2 focus:ring-[#6D28D9]/15 transition-all cursor-pointer appearance-none"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8] pointer-events-none" />
        </div>

        {/* Date Picker (approx 17% of width) */}
        <div className="relative flex-[17] min-w-[160px] max-w-full lg:max-w-[200px]">
          <input
            type="date"
            aria-label="Filter by appointment date"
            className="h-[48px] w-full rounded-[12px] px-3.5 text-[14px] font-medium text-[#334155] bg-white border border-[#E2E8F0] focus:outline-none focus:border-[#6D28D9] focus:ring-2 focus:ring-[#6D28D9]/15 transition-all cursor-pointer"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
          />
        </div>

        {/* Clear Filters Button (approx 150px-175px) */}
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

      {/* 4. Bookings Table Card — exact 7 columns & lavender header */}
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
                <th className="py-3.5 px-5 min-w-[250px] text-[12px] font-bold text-[#1E1B4B] uppercase tracking-wider select-none">
                  PROPERTY / LOCATION
                </th>
                <th className="py-3.5 px-5 min-w-[180px] text-[12px] font-bold text-[#1E1B4B] uppercase tracking-wider select-none">
                  APPOINTMENT DATE
                </th>
                <th className="py-3.5 px-5 min-w-[190px] text-[12px] font-bold text-[#1E1B4B] uppercase tracking-wider select-none">
                  APPOINTMENT TIME
                </th>
                <th className="py-3.5 px-5 min-w-[150px] text-[12px] font-bold text-[#1E1B4B] uppercase tracking-wider select-none">
                  BOOKING STATUS
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9] text-[14px]">
              {appointmentsLoading ? (
                <tr>
                  <td colSpan={7} className="py-24 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <RefreshCw className="h-8 w-8 animate-spin text-[#6D28D9]" />
                      <span className="text-sm font-medium text-slate-600">Loading bookings...</span>
                    </div>
                  </td>
                </tr>
              ) : appointmentsError ? (
                <tr>
                  <td colSpan={7} role="alert" className="py-16 text-center text-rose-600">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <span className="font-medium">{appointmentsError}</span>
                      <button
                        type="button"
                        onClick={() => void loadAppointments()}
                        className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-white border border-[#E2E8F0] text-slate-700 hover:bg-slate-50 cursor-pointer shadow-2xs"
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> Retry
                      </button>
                    </div>
                  </td>
                </tr>
              ) : filteredBookings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-24 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-3 max-w-md mx-auto">
                      <div className="h-12 w-12 rounded-2xl bg-[#F1EDFF] border border-[#DDD6FE]/60 flex items-center justify-center text-[#6D28D9]">
                        <CalendarCheck className="h-6 w-6 text-[#6D28D9]" />
                      </div>
                      <div className="space-y-1">
                        <p className="font-semibold text-slate-800 text-base">
                          {hasActiveFilters ? "No matching bookings found" : "No bookings recorded yet"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {hasActiveFilters
                            ? "Try adjusting your search terms or filters to find what you're looking for."
                            : "Appointments scheduled through Cal.com or booked by callers via Retell AI will appear here automatically."}
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
                          onClick={() => void loadAppointments()}
                          disabled={appointmentsLoading}
                          className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-white border border-[#E2E8F0] text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors shadow-2xs"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 text-[#6D28D9] ${appointmentsLoading ? "animate-spin" : ""}`} />
                          <span>Check for new bookings</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredBookings.map((appointment) => {
                  const meta = (appointment.metadata as Record<string, unknown> | null) ?? {};
                  const customerName = appointment.contact
                    ? `${appointment.contact.firstName} ${appointment.contact.lastName ?? ""}`.trim()
                    : ((meta.customerName as string | undefined) || "Customer");
                  const customerPhone =
                    appointment.contact?.phone || (meta.phoneNumber as string | undefined) || "—";
                  const customerEmail =
                    appointment.contact?.email || (meta.email as string | undefined) || "—";
                  const propertyLocation =
                    (meta.location as string | undefined) ||
                    (meta.propertyType as string | undefined) ||
                    appointment.serviceName ||
                    "—";
                  const avatar = getAvatarPastel(customerName);
                  const initial = getInitials(customerName);

                  return (
                    <tr
                      key={appointment.id}
                      onClick={() => setSelectedBooking(appointment)}
                      title="Click to view booking details"
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
                          <span className="font-bold text-[14px] text-[#111827] group-hover:text-[#6D28D9] transition-colors">
                            {customerName}
                          </span>
                        </div>
                      </td>

                      {/* 2. PHONE NUMBER */}
                      <td className="py-3 px-5 text-[#1E293B] whitespace-nowrap font-medium text-[14px]">
                        {customerPhone !== "—" ? (
                          <span className="inline-flex items-center gap-2">
                            <Phone className="h-[15px] w-[15px] text-[#6D28D9] shrink-0" />
                            <span>{customerPhone}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* 3. EMAIL */}
                      <td className="py-3 px-5 text-[#1E293B] whitespace-nowrap text-[14px]">
                        {customerEmail !== "—" ? (
                          <span className="inline-flex items-center gap-2" title={customerEmail}>
                            <Mail className="h-[15px] w-[15px] text-[#6D28D9] shrink-0" />
                            <span className="truncate max-w-[210px]">{customerEmail}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* 4. PROPERTY / LOCATION */}
                      <td className="py-3 px-5 text-[#1E293B] whitespace-nowrap text-[14px]">
                        {propertyLocation !== "—" ? (
                          <span className="inline-flex items-center gap-2" title={propertyLocation}>
                            <MapPin className="h-[15px] w-[15px] text-[#6D28D9] shrink-0" />
                            <span className="truncate max-w-[250px] font-normal">
                              {propertyLocation}
                            </span>
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* 5. APPOINTMENT DATE */}
                      <td className="py-3 px-5 text-[#1E293B] whitespace-nowrap text-[14px]">
                        <span className="inline-flex items-center gap-2">
                          <Calendar className="h-[15px] w-[15px] text-[#6D28D9] shrink-0" />
                          <span>{formatBookingDate(appointment.startsAt)}</span>
                        </span>
                      </td>

                      {/* 6. APPOINTMENT TIME */}
                      <td className="py-3 px-5 text-[#1E293B] whitespace-nowrap text-[14px]">
                        <span className="inline-flex items-center gap-2">
                          <Clock className="h-[15px] w-[15px] text-[#6D28D9] shrink-0" />
                          <span>{formatBookingTime(appointment.startsAt, appointment.timezone)}</span>
                        </span>
                      </td>

                      {/* 7. BOOKING STATUS */}
                      <td className="py-3 px-5 whitespace-nowrap">
                        <BookingStatusPill status={appointment.status} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Booking Details Modal Dialog */}
      {selectedBooking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-5 overflow-y-auto"
          role="presentation"
          onClick={() => setSelectedBooking(null)}
        >
          {(() => {
            const meta = (selectedBooking.metadata as Record<string, unknown> | null) ?? {};
            const customerName = selectedBooking.contact
              ? `${selectedBooking.contact.firstName} ${selectedBooking.contact.lastName ?? ""}`.trim()
              : ((meta.customerName as string | undefined) || "Customer");
            const customerPhone =
              selectedBooking.contact?.phone || (meta.phoneNumber as string | undefined) || null;
            const customerEmail =
              selectedBooking.contact?.email || (meta.email as string | undefined) || null;
            const propertyLocation =
              (meta.location as string | undefined) ||
              (meta.propertyType as string | undefined) ||
              null;
            const serviceName =
              selectedBooking.serviceName ||
              (meta.serviceType as string | undefined) ||
              "Property Viewing";
            const calcomRef =
              selectedBooking.calcomEventId ||
              (meta.calcomBookingUid as string | undefined) ||
              (meta.bookingUid as string | undefined) ||
              null;
            const notes =
              (meta.notes as string | undefined) ||
              (meta.issueDescription as string | undefined) ||
              null;
            const cancellationReason =
              (meta.cancellationReason as string | undefined) ||
              (meta.rejectionReason as string | undefined) ||
              null;
            const cancelledAt =
              (meta.cancelledAt as string | undefined) ||
              null;

            return (
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="booking-details-title"
                className="w-full max-w-[660px] rounded-[20px] border border-[#E2E8F0] bg-white shadow-2xl overflow-hidden max-h-[calc(100dvh-32px)] sm:max-h-[88vh] flex flex-col my-auto animate-in fade-in zoom-in-95 duration-150"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Modal Header */}
                <div className="shrink-0 flex items-center justify-between border-b border-[#E2E8F0]/80 px-5 sm:px-6 py-4 bg-[#F1EDFF] gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-[12px] bg-white border border-[#DDD6FE] flex items-center justify-center text-[#6D28D9] shadow-xs shrink-0">
                      <CalendarCheck className="h-5 w-5 text-[#6D28D9]" />
                    </div>
                    <div className="min-w-0">
                      <h2 id="booking-details-title" className="text-base font-bold text-[#111827] truncate">
                        Booking Details
                      </h2>
                      <p className="text-xs text-[#64748B] truncate">
                        Cal.com appointment record
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={() => setSelectedBooking(null)}
                    className="rounded-lg p-1.5 text-[#64748B] hover:bg-white/80 hover:text-[#111827] transition-colors cursor-pointer shrink-0"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Modal Body */}
                <div className="flex-1 min-h-0 p-5 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto min-w-0">
                  {/* Status Banner */}
                  <div className="flex items-center justify-between p-3.5 rounded-[12px] bg-[#F8FAFC] border border-[#E2E8F0] gap-3">
                    <div className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">Booking Status</div>
                    <BookingStatusPill status={selectedBooking.status} />
                  </div>

                  {/* Attendee Info */}
                  <div className="space-y-2">
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
                      Attendee Information
                    </h3>
                    <div className="rounded-[14px] border border-[#E2E8F0] p-3.5 space-y-2.5 bg-white shadow-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <User className="h-4 w-4 text-[#6D28D9] shrink-0" />
                        <span className="text-sm sm:text-[15px] font-bold text-[#111827] truncate">{customerName}</span>
                      </div>
                      {customerPhone && (
                        <div className="flex items-center gap-2 text-xs text-[#334155] min-w-0">
                          <Phone className="h-3.5 w-3.5 text-[#6D28D9] shrink-0" />
                          <span className="break-all">{customerPhone}</span>
                        </div>
                      )}
                      {customerEmail && (
                        <div className="flex items-center gap-2 text-xs text-[#334155] min-w-0">
                          <Mail className="h-3.5 w-3.5 text-[#6D28D9] shrink-0" />
                          <span className="break-all [overflow-wrap:anywhere]">{customerEmail}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Schedule Details */}
                  <div className="space-y-2">
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
                      Appointment Schedule
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-[14px] border border-[#E2E8F0] p-3.5 bg-white space-y-1 shadow-xs">
                        <div className="flex items-center gap-1.5 text-xs text-[#64748B] font-medium">
                          <Calendar className="h-3.5 w-3.5 text-[#6D28D9] shrink-0" />
                          <span>Date</span>
                        </div>
                        <div className="text-sm sm:text-[15px] font-bold text-[#111827]">
                          {formatBookingDate(selectedBooking.startsAt)}
                        </div>
                      </div>

                      <div className="rounded-[14px] border border-[#E2E8F0] p-3.5 bg-white space-y-1 shadow-xs">
                        <div className="flex items-center gap-1.5 text-xs text-[#64748B] font-medium">
                          <Clock className="h-3.5 w-3.5 text-[#6D28D9] shrink-0" />
                          <span>Time</span>
                        </div>
                        <div className="text-sm sm:text-[15px] font-bold text-[#111827]">
                          {formatBookingTime(selectedBooking.startsAt, selectedBooking.timezone)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Service & Property */}
                  <div className="space-y-2">
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
                      Service &amp; Property Details
                    </h3>
                    <div className="rounded-[14px] border border-[#E2E8F0] p-4 space-y-3 bg-white shadow-xs text-xs">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-1 sm:gap-4">
                        <span className="text-[#64748B] shrink-0 font-medium">Service:</span>
                        <span className="font-semibold text-[#111827] text-left sm:text-right break-words min-w-0">
                          {serviceName}
                        </span>
                      </div>

                      {propertyLocation && (
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-1 sm:gap-4 pt-2.5 border-t border-slate-100">
                          <span className="text-[#64748B] shrink-0 font-medium">Property / Location:</span>
                          <span className="font-medium text-[#111827] text-left sm:text-right break-words min-w-0">
                            {propertyLocation}
                          </span>
                        </div>
                      )}

                      {calcomRef && (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-4 pt-2.5 border-t border-slate-100">
                          <span className="text-[#64748B] shrink-0 font-medium">Cal.com Booking Reference:</span>
                          <div className="flex items-center gap-1.5 self-start sm:self-auto min-w-0">
                            <span className="font-mono font-medium text-[#6D28D9] bg-[#F1EDFF] px-2.5 py-1 rounded-md text-xs break-all">
                              {calcomRef}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(calcomRef)}
                              title="Copy Reference"
                              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                            >
                              {copiedId === calcomRef ? (
                                <Check className="h-3.5 w-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      )}

                      {selectedBooking.createdAt && (
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-1 sm:gap-4 pt-2.5 border-t border-slate-100">
                          <span className="text-[#64748B] shrink-0 font-medium">Recorded At:</span>
                          <span className="text-[#334155] text-left sm:text-right">
                            {new Date(selectedBooking.createdAt).toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Cancellation Details if cancelled */}
                  {(selectedBooking.status.toLowerCase() === "cancelled" ||
                    selectedBooking.status.toLowerCase() === "canceled") && (
                    <div className="space-y-2">
                      <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#DC2626]">
                        Cancellation Details
                      </h3>
                      <div className="rounded-[14px] border border-[#FECACA] p-3.5 space-y-2 bg-[#FFF8F8] text-xs shadow-xs">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[#991B1B] font-medium">Status:</span>
                          <span className="font-semibold text-[#DC2626] text-right">Cancelled</span>
                        </div>
                        {cancellationReason && (
                          <div className="flex items-start justify-between gap-2 pt-1.5 border-t border-[#FEE2E2]">
                            <span className="text-[#991B1B] shrink-0 font-medium">Reason:</span>
                            <span className="font-medium text-[#111827] text-right break-words min-w-0">
                              {cancellationReason}
                            </span>
                          </div>
                        )}
                        {cancelledAt && (
                          <div className="flex items-start justify-between gap-2 pt-1.5 border-t border-[#FEE2E2]">
                            <span className="text-[#991B1B] shrink-0 font-medium">Cancelled At:</span>
                            <span className="text-[#334155] text-right">
                              {new Date(cancelledAt).toLocaleString()}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Notes / Description if available */}
                  {notes && (
                    <div className="space-y-2">
                      <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8]">
                        Notes &amp; Details
                      </h3>
                      <div className="rounded-[12px] bg-[#F8FAFC] border border-[#E2E8F0] p-3.5 text-xs text-[#334155] whitespace-pre-wrap break-words leading-relaxed shadow-xs">
                        {notes}
                      </div>
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="shrink-0 flex items-center justify-between border-t border-[#E2E8F0] px-5 sm:px-6 py-3.5 bg-[#F8FAFC]">
                  <span className="text-xs text-[#64748B]">
                    Click anywhere outside to close
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedBooking(null)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-white border border-[#E2E8F0] text-[#111827] hover:bg-slate-50 cursor-pointer shadow-xs transition-colors"
                  >
                    Close
                  </button>
                </div>
              </section>
            );
          })()}
        </div>
      )}
    </div>
  );
};
