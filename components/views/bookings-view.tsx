"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useAppState } from "@/context/StateContext";
import type { ApiAppointment } from "@/lib/api-client";
import {
  CalendarCheck,
  Calendar,
  CheckCircle2,
  Clock,
  XCircle,
  Search,
  RefreshCw,
  RotateCcw,
  Phone,
  Mail,
  MapPin,
  User,
  X,
  Eye,
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
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase();
}

function getAvatarPastel(name: string): { bg: string; text: string } {
  const pastels = [
    { bg: "bg-purple-100", text: "text-purple-700" },
    { bg: "bg-indigo-100", text: "text-indigo-700" },
    { bg: "bg-blue-100", text: "text-blue-700" },
    { bg: "bg-emerald-100", text: "text-emerald-700" },
    { bg: "bg-amber-100", text: "text-amber-700" },
    { bg: "bg-rose-100", text: "text-rose-700" },
    { bg: "bg-teal-100", text: "text-teal-700" },
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return pastels[Math.abs(hash) % pastels.length];
}

function BookingStatusPill({ status }: { status: string }) {
  const s = status.toLowerCase();
  if (s === "confirmed") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
        Confirmed
      </span>
    );
  }
  if (s === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200/80 shadow-2xs">
        <Clock className="h-3.5 w-3.5 text-amber-600" />
        Pending
      </span>
    );
  }
  if (s === "cancelled" || s === "canceled") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200/80 shadow-2xs">
        <XCircle className="h-3.5 w-3.5 text-rose-600" />
        Cancelled
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200/80 shadow-2xs capitalize">
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

  // Derived filtered bookings list
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
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto min-h-screen bg-[#F8FAFC]">
      {/* 1. Page Header — match reference */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-1">
        <div className="space-y-1">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="h-10 w-10 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 shadow-2xs">
              <CalendarCheck className="h-6 w-6 text-purple-600" />
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">
              Bookings
            </h1>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200/80 shadow-2xs">
              {appointments.length} {appointments.length === 1 ? "booking" : "bookings"}
            </span>
          </div>
          <p className="text-sm text-slate-500 max-w-2xl pl-0.5">
            Manage property viewings and consultation appointments.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => void loadAppointments()}
            disabled={appointmentsLoading}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 active:bg-slate-100 shadow-2xs transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-500/20 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 text-purple-600 ${appointmentsLoading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* 2. Booking Statistics Cards (4 cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* Card 1: Total Bookings */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs flex items-center justify-between transition-all hover:border-purple-200">
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-500">Total Bookings</p>
            <p className="text-3xl font-bold tracking-tight text-slate-900">{stats.total}</p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 shadow-2xs">
            <Calendar className="h-6 w-6 text-purple-600" />
          </div>
        </div>

        {/* Card 2: Confirmed */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs flex items-center justify-between transition-all hover:border-emerald-200">
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-500">Confirmed</p>
            <p className="text-3xl font-bold tracking-tight text-slate-900">{stats.confirmed}</p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shadow-2xs">
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          </div>
        </div>

        {/* Card 3: Pending */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs flex items-center justify-between transition-all hover:border-amber-200">
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-500">Pending</p>
            <p className="text-3xl font-bold tracking-tight text-slate-900">{stats.pending}</p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shadow-2xs">
            <Clock className="h-6 w-6 text-amber-600" />
          </div>
        </div>

        {/* Card 4: Cancelled */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 sm:p-6 shadow-xs flex items-center justify-between transition-all hover:border-rose-200">
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-500">Cancelled</p>
            <p className="text-3xl font-bold tracking-tight text-slate-900">{stats.cancelled}</p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 shadow-2xs">
            <XCircle className="h-6 w-6 text-rose-600" />
          </div>
        </div>
      </div>

      {/* 3. Search and Filter Toolbar Container */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
          <div className="flex flex-1 flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[280px]">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                aria-label="Search bookings"
                className="h-12 w-full rounded-xl pl-11 pr-4 text-sm bg-white text-slate-900 border border-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all"
                placeholder="Search by customer, phone, email, property, reference..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Booking Status Dropdown */}
            <select
              aria-label="Filter by booking status"
              className="h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 font-medium focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all cursor-pointer min-w-[150px]"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>

            {/* Appointment Date Picker */}
            <input
              type="date"
              aria-label="Filter by appointment date"
              className="h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-700 font-medium focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 transition-all cursor-pointer min-w-[160px]"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
          </div>

          {/* Clear Filters Button aligned to the far right */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={resetFilters}
              className="h-12 px-5 rounded-xl text-sm font-semibold text-purple-700 bg-purple-50 border border-purple-200/80 hover:bg-purple-100 transition-colors cursor-pointer flex items-center gap-2 shadow-2xs"
            >
              <RotateCcw className="h-4 w-4 text-purple-600" />
              <span>Clear Filters</span>
            </button>
          </div>
        </div>

        {hasActiveFilters && (
          <div className="pt-3 text-xs text-slate-500 font-medium">
            Showing {filteredBookings.length} of {appointments.length} bookings matching your filters
          </div>
        )}
      </div>

      {/* 4. Bookings Table Card — exact 7 columns */}
      <div className="rounded-2xl bg-white border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F8F9FD] border-b border-slate-200/80 text-[12px] font-bold text-slate-800 tracking-wider">
                <th className="py-4 px-5 min-w-[180px]">CUSTOMER NAME</th>
                <th className="py-4 px-5 min-w-[150px]">PHONE NUMBER</th>
                <th className="py-4 px-5 min-w-[180px]">EMAIL</th>
                <th className="py-4 px-5 min-w-[180px]">PROPERTY / LOCATION</th>
                <th className="py-4 px-5 min-w-[160px]">APPOINTMENT DATE</th>
                <th className="py-4 px-5 min-w-[180px]">APPOINTMENT TIME</th>
                <th className="py-4 px-5 min-w-[140px]">BOOKING STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {appointmentsLoading ? (
                <tr>
                  <td colSpan={7} className="py-20 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <RefreshCw className="h-8 w-8 animate-spin text-purple-600" />
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
                        className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer shadow-2xs"
                      >
                        <RefreshCw className="h-3.5 w-3.5" /> Retry
                      </button>
                    </div>
                  </td>
                </tr>
              ) : filteredBookings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-20 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-3 max-w-md mx-auto">
                      <div className="h-12 w-12 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600">
                        <CalendarCheck className="h-6 w-6" />
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
                          className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-purple-700 bg-purple-50 border border-purple-200 hover:bg-purple-100 cursor-pointer transition-colors shadow-2xs"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span>Clear Filters</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void loadAppointments()}
                          disabled={appointmentsLoading}
                          className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors shadow-2xs"
                        >
                          <RefreshCw className={`h-3.5 w-3.5 ${appointmentsLoading ? "animate-spin" : ""}`} />
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
                  const initials = getInitials(customerName);

                  return (
                    <tr
                      key={appointment.id}
                      onClick={() => setSelectedBooking(appointment)}
                      title="Click to view booking details"
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                    >
                      {/* 1. CUSTOMER NAME */}
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-3">
                          <div
                            className={`h-8 w-8 rounded-lg ${avatar.bg} ${avatar.text} flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs`}
                          >
                            {initials}
                          </div>
                          <span className="font-semibold text-slate-900 group-hover:text-purple-600 transition-colors">
                            {customerName}
                          </span>
                        </div>
                      </td>

                      {/* 2. PHONE NUMBER */}
                      <td className="py-4 px-5 text-slate-600">
                        {customerPhone !== "—" ? (
                          <span className="inline-flex items-center gap-2">
                            <Phone className="h-4 w-4 text-purple-600 shrink-0" />
                            <span className="font-medium text-slate-700">{customerPhone}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* 3. EMAIL */}
                      <td className="py-4 px-5 text-slate-600">
                        {customerEmail !== "—" ? (
                          <span className="inline-flex items-center gap-2" title={customerEmail}>
                            <Mail className="h-4 w-4 text-purple-500 shrink-0" />
                            <span className="truncate max-w-[190px]">{customerEmail}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* 4. PROPERTY / LOCATION */}
                      <td className="py-4 px-5 text-slate-700">
                        {propertyLocation !== "—" ? (
                          <span className="inline-flex items-center gap-2" title={propertyLocation}>
                            <MapPin className="h-4 w-4 text-purple-600 shrink-0" />
                            <span className="font-medium text-slate-800 truncate max-w-[200px]">
                              {propertyLocation}
                            </span>
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      {/* 5. APPOINTMENT DATE */}
                      <td className="py-4 px-5 text-slate-700">
                        <span className="inline-flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-purple-600 shrink-0" />
                          <span className="font-medium text-slate-800">
                            {formatBookingDate(appointment.startsAt)}
                          </span>
                        </span>
                      </td>

                      {/* 6. APPOINTMENT TIME */}
                      <td className="py-4 px-5 text-slate-600">
                        <span className="inline-flex items-center gap-2">
                          <Clock className="h-4 w-4 text-purple-600 shrink-0" />
                          <span className="text-slate-700">
                            {formatBookingTime(appointment.startsAt, appointment.timezone)}
                          </span>
                        </span>
                      </td>

                      {/* 7. BOOKING STATUS */}
                      <td className="py-4 px-5">
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
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

            return (
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="booking-details-title"
                className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Modal Header */}
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-[#F8F9FD]">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600 shadow-2xs">
                      <CalendarCheck className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <h2 id="booking-details-title" className="text-base font-bold text-slate-900">
                        Booking Details
                      </h2>
                      <p className="text-xs text-slate-500">
                        Cal.com appointment record
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={() => setSelectedBooking(null)}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors cursor-pointer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {/* Modal Body */}
                <div className="p-6 space-y-5 overflow-y-auto">
                  {/* Status Banner */}
                  <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-200/80">
                    <div className="text-xs font-medium text-slate-600">Booking Status</div>
                    <BookingStatusPill status={selectedBooking.status} />
                  </div>

                  {/* Attendee Info */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Attendee Information
                    </h3>
                    <div className="rounded-xl border border-slate-200/80 p-3.5 space-y-2.5 bg-white">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-purple-600 shrink-0" />
                        <span className="text-sm font-semibold text-slate-900">{customerName}</span>
                      </div>
                      {customerPhone && (
                        <div className="flex items-center gap-2 text-xs text-slate-600">
                          <Phone className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                          <span>{customerPhone}</span>
                        </div>
                      )}
                      {customerEmail && (
                        <div className="flex items-center gap-2 text-xs text-slate-600">
                          <Mail className="h-3.5 w-3.5 text-purple-500 shrink-0" />
                          <span>{customerEmail}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Schedule Details */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Appointment Schedule
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-xl border border-slate-200/80 p-3 bg-white space-y-1">
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                          <Calendar className="h-3.5 w-3.5 text-purple-600" />
                          <span>Date</span>
                        </div>
                        <div className="text-sm font-semibold text-slate-800">
                          {formatBookingDate(selectedBooking.startsAt)}
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200/80 p-3 bg-white space-y-1">
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                          <Clock className="h-3.5 w-3.5 text-purple-600" />
                          <span>Time</span>
                        </div>
                        <div className="text-sm font-semibold text-slate-800">
                          {formatBookingTime(selectedBooking.startsAt, selectedBooking.timezone)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Service & Property */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Service &amp; Property Details
                    </h3>
                    <div className="rounded-xl border border-slate-200/80 p-3.5 space-y-2 bg-white text-xs">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-slate-500">Service:</span>
                        <span className="font-semibold text-slate-800 text-right">{serviceName}</span>
                      </div>
                      {propertyLocation && (
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-slate-500">Property / Location:</span>
                          <span className="font-medium text-slate-800 text-right">{propertyLocation}</span>
                        </div>
                      )}
                      {calcomRef && (
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-slate-500">Cal.com Booking Reference:</span>
                          <span className="font-mono font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded text-right">
                            {calcomRef}
                          </span>
                        </div>
                      )}
                      {selectedBooking.createdAt && (
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-slate-500">Recorded At:</span>
                          <span className="text-slate-700 text-right">
                            {new Date(selectedBooking.createdAt).toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Notes / Description if available */}
                  {notes && (
                    <div className="space-y-2">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Notes &amp; Details
                      </h3>
                      <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3 text-xs text-slate-700">
                        {notes}
                      </div>
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-between border-t border-slate-100 px-6 py-3.5 bg-[#F8F9FD]">
                  <span className="text-xs text-slate-500">
                    Click anywhere outside to close
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedBooking(null)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer shadow-2xs transition-colors"
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
