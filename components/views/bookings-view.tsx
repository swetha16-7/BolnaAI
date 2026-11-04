"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useAppState } from "@/context/StateContext";
import type { ApiAppointment } from "@/lib/api-client";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CalendarCheck,
  Search,
  RefreshCw,
  Eye,
  X,
  Calendar,
  Clock,
  MapPin,
  Mail,
  Phone,
  User,
  RotateCcw,
  Tag,
} from "lucide-react";

function formatBookingDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
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

  // Derived filtered bookings list
  const filteredBookings = useMemo(() => {
    return appointments.filter((appointment) => {
      const meta = (appointment.metadata as Record<string, unknown> | null) ?? {};
      const customerName = appointment.contact
        ? `${appointment.contact.firstName} ${appointment.contact.lastName ?? ""}`.trim()
        : ((meta.customerName as string | undefined) || "");
      const customerPhone = appointment.contact?.phone || (meta.phoneNumber as string | undefined) || "";
      const customerEmail = appointment.contact?.email || (meta.email as string | undefined) || "";
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

      // Search term
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
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto min-h-screen bg-slate-50/50">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-1">
        <div className="space-y-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
              <CalendarCheck className="h-7 w-7 text-indigo-600" />
              Bookings
            </h1>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200/80 shadow-2xs">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {appointments.length} {appointments.length === 1 ? "booking" : "bookings"}
            </span>
          </div>
          <p className="text-sm text-slate-500 max-w-2xl">
            Manage property viewings and consultation appointments.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadAppointments()}
            disabled={appointmentsLoading}
            className="cursor-pointer bg-white"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${appointmentsLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* 2. Main Card (Toolbar + Table) */}
      <div className="rounded-xl bg-white border border-slate-200/80 shadow-xs overflow-hidden">
        {/* Search and Filters Toolbar */}
        <div className="p-4 sm:p-5 bg-white border-b border-slate-100">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3.5">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              {/* Search input */}
              <div className="relative flex-1 min-w-[260px] max-w-md">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  aria-label="Search bookings"
                  className="h-10 w-full rounded-lg pl-10 pr-4 text-sm bg-white text-slate-900 border border-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                  placeholder="Search by customer, phone, email, property, reference..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {/* Status filter */}
              <select
                aria-label="Filter by booking status"
                className="h-10 rounded-lg border border-slate-200 bg-white px-3.5 text-sm text-slate-700 font-medium focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All Statuses</option>
                <option value="confirmed">Confirmed</option>
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>

              {/* Date filter */}
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  aria-label="Filter by appointment date"
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3.5 text-sm text-slate-700 font-medium focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                />
              </div>

              {/* Reset filter button */}
              {hasActiveFilters && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 cursor-pointer transition-colors"
                  onClick={resetFilters}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset</span>
                </button>
              )}
            </div>

            {hasActiveFilters && (
              <div className="text-xs text-slate-500">
                Showing {filteredBookings.length} of {appointments.length} bookings
              </div>
            )}
          </div>
        </div>

        {/* Bookings Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/75 border-b border-slate-100">
              <TableRow>
                <TableHead className="py-3.5 px-4 font-semibold text-xs text-slate-700 uppercase tracking-wider">
                  Customer Name
                </TableHead>
                <TableHead className="py-3.5 px-4 font-semibold text-xs text-slate-700 uppercase tracking-wider">
                  Phone Number
                </TableHead>
                <TableHead className="py-3.5 px-4 font-semibold text-xs text-slate-700 uppercase tracking-wider">
                  Email
                </TableHead>
                <TableHead className="py-3.5 px-4 font-semibold text-xs text-slate-700 uppercase tracking-wider">
                  Property / Location
                </TableHead>
                <TableHead className="py-3.5 px-4 font-semibold text-xs text-slate-700 uppercase tracking-wider">
                  Appointment Date
                </TableHead>
                <TableHead className="py-3.5 px-4 font-semibold text-xs text-slate-700 uppercase tracking-wider">
                  Appointment Time
                </TableHead>
                <TableHead className="py-3.5 px-4 font-semibold text-xs text-slate-700 uppercase tracking-wider">
                  Booking Status
                </TableHead>
                <TableHead className="py-3.5 px-4 font-semibold text-xs text-slate-700 uppercase tracking-wider">
                  Cal.com Booking Reference
                </TableHead>
                <TableHead className="py-3.5 px-4 font-semibold text-xs text-slate-700 uppercase tracking-wider text-right">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {appointmentsLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-16 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <RefreshCw className="h-7 w-7 animate-spin text-indigo-600" />
                      <span className="text-sm font-medium">Loading bookings...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : appointmentsError ? (
                <TableRow>
                  <TableCell colSpan={9} role="alert" className="py-12 text-center text-rose-600">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <span className="font-medium">{appointmentsError}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void loadAppointments()}
                        className="mt-2"
                      >
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredBookings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-16 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-3 max-w-md mx-auto">
                      <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
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
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={resetFilters}
                          className="mt-1 cursor-pointer"
                        >
                          Clear filters
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void loadAppointments()}
                          disabled={appointmentsLoading}
                          className="mt-1 cursor-pointer"
                        >
                          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Check for new bookings
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
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
                  const calcomRef =
                    appointment.calcomEventId ||
                    (meta.calcomBookingUid as string | undefined) ||
                    (meta.bookingUid as string | undefined) ||
                    "—";

                  return (
                    <TableRow
                      key={appointment.id}
                      className="hover:bg-slate-50/75 transition-colors border-b border-slate-100"
                    >
                      {/* 1. Customer Name */}
                      <TableCell className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 text-sm">{customerName}</div>
                      </TableCell>

                      {/* 2. Phone Number */}
                      <TableCell className="py-3.5 px-4 text-sm text-slate-600">
                        {customerPhone !== "—" ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5 text-slate-400" />
                            {customerPhone}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </TableCell>

                      {/* 3. Email */}
                      <TableCell className="py-3.5 px-4 text-sm text-slate-600">
                        {customerEmail !== "—" ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5 text-slate-400" />
                            {customerEmail}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </TableCell>

                      {/* 4. Property / Location */}
                      <TableCell className="py-3.5 px-4 text-sm text-slate-700">
                        {propertyLocation !== "—" ? (
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span className="font-medium">{propertyLocation}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </TableCell>

                      {/* 5. Appointment Date */}
                      <TableCell className="py-3.5 px-4 text-sm text-slate-700 font-medium">
                        {formatBookingDate(appointment.startsAt)}
                      </TableCell>

                      {/* 6. Appointment Time */}
                      <TableCell className="py-3.5 px-4 text-sm text-slate-600">
                        {formatBookingTime(appointment.startsAt, appointment.timezone)}
                      </TableCell>

                      {/* 7. Booking Status */}
                      <TableCell className="py-3.5 px-4">
                        <StatusBadge status={appointment.status} />
                      </TableCell>

                      {/* 8. Cal.com Booking Reference */}
                      <TableCell className="py-3.5 px-4">
                        {calcomRef !== "—" ? (
                          <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-700">
                            {calcomRef}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono text-xs">—</span>
                        )}
                      </TableCell>

                      {/* 9. Actions */}
                      <TableCell className="py-3.5 px-4 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 cursor-pointer"
                          onClick={() => setSelectedBooking(appointment)}
                        >
                          <Eye className="mr-1 h-3.5 w-3.5" />
                          View Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* 3. Booking Details Modal */}
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
            const serviceName = selectedBooking.serviceName || (meta.serviceType as string | undefined) || "Property Viewing";
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
                className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Modal Header */}
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/75">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                      <CalendarCheck className="h-5 w-5" />
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
                  <div className="flex items-center justify-between p-3.5 rounded-lg bg-slate-50 border border-slate-200/80">
                    <div className="text-xs font-medium text-slate-600">Booking Status</div>
                    <StatusBadge status={selectedBooking.status} />
                  </div>

                  {/* Attendee Info */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Attendee Information
                    </h3>
                    <div className="rounded-lg border border-slate-200/80 p-3.5 space-y-2.5 bg-white">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-slate-400 shrink-0" />
                        <span className="text-sm font-semibold text-slate-900">{customerName}</span>
                      </div>
                      {customerPhone && (
                        <div className="flex items-center gap-2 text-xs text-slate-600">
                          <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span>{customerPhone}</span>
                        </div>
                      )}
                      {customerEmail && (
                        <div className="flex items-center gap-2 text-xs text-slate-600">
                          <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
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
                      <div className="rounded-lg border border-slate-200/80 p-3 bg-white space-y-1">
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          <span>Date</span>
                        </div>
                        <div className="text-sm font-semibold text-slate-800">
                          {formatBookingDate(selectedBooking.startsAt)}
                        </div>
                      </div>

                      <div className="rounded-lg border border-slate-200/80 p-3 bg-white space-y-1">
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
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
                    <div className="rounded-lg border border-slate-200/80 p-3.5 space-y-2 bg-white text-xs">
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
                          <span className="text-slate-500">Cal.com Reference:</span>
                          <span className="font-mono font-medium text-slate-800 text-right">{calcomRef}</span>
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
                      <div className="rounded-lg bg-slate-50 border border-slate-200/80 p-3 text-xs text-slate-700">
                        {notes}
                      </div>
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-end border-t border-slate-100 px-6 py-3.5 bg-slate-50/75">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedBooking(null)}
                    className="cursor-pointer"
                  >
                    Close
                  </Button>
                </div>
              </section>
            );
          })()}
        </div>
      )}
    </div>
  );
};

