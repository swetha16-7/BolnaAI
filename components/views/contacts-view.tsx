"use client";

import React, { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/shared/page-header";
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
import { useAppState, type ContactRecord } from "@/context/StateContext";
import type { ApiContactCall } from "@/lib/api-client";
import {
  Archive,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  Mail,
  Pencil,
  Phone,
  PhoneCall,
  PhoneOff,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  User,
  X,
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
  source: "CRM",
  status: "new",
  voiceConsentGranted: false,
  voiceConsentSource: "written",
  voiceConsentEvidence: "",
  doNotCall: false,
};

function isConsentSource(value: string | null): value is ContactForm["voiceConsentSource"] {
  return value === "written" || value === "verbal" || value === "web_form" || value === "other";
}

function getInitials(firstName: string, lastName?: string | null): string {
  const first = firstName.trim()[0] || "";
  const last = (lastName || "").trim()[0] || "";
  return (first + last).toUpperCase() || "C";
}

function getAvatarColor(name: string): string {
  const colors = [
    "bg-indigo-600 text-white",
    "bg-emerald-600 text-white",
    "bg-blue-600 text-white",
    "bg-amber-600 text-white",
    "bg-purple-600 text-white",
    "bg-rose-600 text-white",
    "bg-teal-600 text-white",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function getAvatarPastel(idOrName: string) {
  const palette = [
    { bg: "#ede9fe", text: "#7c3aed" }, // purple
    { bg: "#e0f2fe", text: "#0284c7" }, // blue
    { bg: "#dcfce7", text: "#16a34a" }, // green
    { bg: "#fef3c7", text: "#d97706" }, // amber
    { bg: "#fee2e2", text: "#dc2626" }, // red
    { bg: "#e0e7ff", text: "#4f46e5" }, // indigo
    { bg: "#ccfbf1", text: "#0d9488" }, // teal
  ];
  let hash = 0;
  for (let i = 0; i < idOrName.length; i++) {
    hash = idOrName.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length];
}

function formatDateTime(timestamp: string | null | undefined): string {
  if (!timestamp) return "No conversations yet";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "No conversations yet";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number | null | undefined): string {
  if (typeof seconds !== "number" || seconds <= 0) return "—";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${String(secs).padStart(2, "0")}s`;
}

export const ContactsView: React.FC = () => {
  const {
    contacts,
    contactsLoading,
    contactsError,
    contactsPagination,
    loadContacts,
    addContact,
    updateContact,
    deleteContact,
    showToast,
  } = useAppState();

  // Search & Filter states
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dncFilter, setDncFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Selected contact for detail side panel
  const [selectedContact, setSelectedContact] = useState<ContactRecord | null>(null);

  // Form modal states
  const [editing, setEditing] = useState<ContactRecord | null>(null);
  const [form, setForm] = useState<ContactForm>(blankContact);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Archive modal state
  const [archivingContact, setArchivingContact] = useState<ContactRecord | null>(null);
  const [archiving, setArchiving] = useState(false);

  // Clipboard copy state tracking
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Fetch contacts with debounced search and filters
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadContacts(search, statusFilter, currentPage, pageSize, dncFilter);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [search, statusFilter, dncFilter, currentPage, loadContacts]);

  const handleCopy = (text: string, label = "ID") => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(text);
      showToast(`${label} copied to clipboard.`, "info");
      window.setTimeout(() => setCopiedId((curr) => (curr === text ? null : curr)), 2000);
    });
  };

  const handleClearFilters = () => {
    setSearch("");
    setStatusFilter("");
    setDncFilter("");
    setCurrentPage(1);
  };

  const isFiltered = Boolean(search || statusFilter || dncFilter);

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
      source: contact.source ?? "CRM",
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
        void loadContacts(search, statusFilter, currentPage, pageSize, dncFilter);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleArchiveConfirm = async () => {
    if (!archivingContact) return;
    setArchiving(true);
    try {
      const success = await deleteContact(archivingContact.id);
      if (success) {
        if (selectedContact?.id === archivingContact.id) {
          setSelectedContact(null);
        }
        setArchivingContact(null);
        void loadContacts(search, statusFilter, currentPage, pageSize, dncFilter);
      }
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto min-h-screen bg-slate-50/50">
      {/* 1. Contacts Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-1">
        <div className="space-y-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Contacts
            </h1>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200/80 shadow-2xs">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {contactsPagination.total} {contactsPagination.total === 1 ? "contact" : "contacts"}
            </span>
          </div>
          <p className="text-sm text-slate-500 max-w-2xl">
            Manage your contacts, review conversations, and keep customer details organized.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 shadow-sm transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            onClick={beginCreate}
          >
            <Plus className="h-4 w-4 text-white" />
            <span>Add Contact</span>
          </button>
        </div>
      </div>

      {/* Main Contacts Card (Toolbar + Table + Pagination) */}
      <div className="rounded-xl bg-white border border-slate-200/80 shadow-xs overflow-hidden">
        {/* 2. Search and Filter Toolbar inside card */}
        <div className="p-4 sm:p-5 bg-white border-b border-slate-100">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3.5">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              {/* Search input with generous width and proper icon spacing */}
              <div className="relative flex-1 min-w-[280px] max-w-md">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  aria-label="Search contacts"
                  className="h-10 w-full rounded-lg pl-10 pr-4 text-sm bg-white text-slate-900 border border-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                  placeholder="Search by name, phone, email, or contact ID..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setCurrentPage(1);
                  }}
                />
              </div>

              {/* Status filter */}
              <select
                aria-label="Filter contacts by status"
                className="h-10 rounded-lg px-3.5 text-sm font-medium bg-white text-slate-700 border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer hover:border-slate-300"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="">All Statuses</option>
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="qualified">Qualified</option>
                <option value="converted">Converted</option>
                <option value="inactive">Inactive</option>
              </select>

              {/* Source/Category filter */}
              <select
                aria-label="Filter by category"
                className="h-10 rounded-lg px-3.5 text-sm font-medium bg-white text-slate-700 border border-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer hover:border-slate-300"
                value={dncFilter}
                onChange={(e) => {
                  setDncFilter(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="">All Contacts</option>
                <option value="false">Callable Only</option>
                <option value="true">Do Not Call Only</option>
              </select>
            </div>

            {/* Right toolbar actions: Refresh and Clear Filters */}
            <div className="flex items-center gap-2.5 self-end lg:self-auto">
              <button
                type="button"
                onClick={() => void loadContacts(search, statusFilter, currentPage, pageSize, dncFilter)}
                disabled={contactsLoading}
                title="Refresh contacts"
                className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${contactsLoading ? "animate-spin text-indigo-600" : ""}`} />
              </button>

              <button
                type="button"
                onClick={handleClearFilters}
                className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg text-sm font-medium bg-white border border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
              >
                <span>Clear Filters</span>
              </button>
            </div>
          </div>
        </div>

        {/* 3. Contacts Table */}
        <div className="overflow-x-auto">
          <Table className="w-full text-left border-collapse">
            <TableHeader className="bg-slate-50/80 border-b border-slate-200/80 [&_th]:py-3.5 [&_th]:px-6 [&_th]:text-[11px] [&_th]:font-bold [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-slate-500">
              <TableRow className="border-b border-slate-200/80 bg-slate-50/70 hover:bg-slate-50/70">
                <TableHead>Phone Number</TableHead>
                <TableHead>Contact ID</TableHead>
                <TableHead>Conversations</TableHead>
                <TableHead>Last Conversation</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contactsLoading ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <TableRow key={`skeleton-${idx}`} className="border-b border-slate-100">
                    <TableCell colSpan={5} className="py-5 px-6">
                      <div className="flex items-center gap-4 animate-pulse">
                        <div className="h-9 w-9 rounded-full bg-slate-200" />
                        <div className="flex-1 space-y-2">
                          <div className="h-4 w-1/4 rounded bg-slate-200" />
                          <div className="h-3 w-1/6 rounded bg-slate-100" />
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : contactsError ? (
                <TableRow>
                  <TableCell colSpan={5} role="alert" className="py-14 px-6 text-center text-rose-600">
                    <p className="font-semibold text-base">{contactsError}</p>
                    <button
                      type="button"
                      className="mt-3.5 inline-flex items-center px-4 py-2 rounded-lg text-xs font-semibold bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
                      onClick={() => void loadContacts(search, statusFilter, currentPage, pageSize, dncFilter)}
                    >
                      Retry
                    </button>
                  </TableCell>
                </TableRow>
              ) : contacts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-16 px-6 text-center text-slate-500">
                    {isFiltered ? (
                      <div className="space-y-3 max-w-md mx-auto">
                        <p className="font-semibold text-slate-900 text-base">No contacts match your filters</p>
                        <p className="text-sm text-slate-500">Try adjusting your search query or clearing applied filters.</p>
                        <button
                          type="button"
                          onClick={handleClearFilters}
                          className="mt-2 inline-flex items-center px-4 py-2 rounded-lg text-xs font-semibold bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
                        >
                          Clear Filters
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4 max-w-md mx-auto py-4">
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-600 border border-slate-200/60 shadow-2xs">
                          <User className="h-7 w-7" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 text-lg">No contacts found</p>
                          <p className="text-sm text-slate-500 mt-1">
                            Start building your directory by adding customer details and conversation records.
                          </p>
                        </div>
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 transition-all shadow-sm cursor-pointer"
                          onClick={beginCreate}
                        >
                          <Plus className="h-4 w-4 text-white" />
                          <span>Add Contact</span>
                        </button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                contacts.map((contact) => {
                  const callsCount = contact.calls?.length || 0;
                  const conversationsCount = typeof contact.conversationCount === "number" ? contact.conversationCount : callsCount;

                  return (
                    <TableRow
                      key={contact.id}
                      onClick={() => setSelectedContact(contact)}
                      className="cursor-pointer hover:bg-slate-50/80 transition-colors h-16 border-b border-slate-100 group"
                    >
                      {/* 1. Phone Number */}
                      <TableCell className="py-4 px-6">
                        {contact.phone ? (
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50/80 text-indigo-600 border border-indigo-100/60">
                              <Phone className="h-4 w-4" />
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-sm font-semibold text-slate-900 tracking-tight">
                                {contact.phone}
                              </span>
                              {contact.doNotCall && (
                                <span className="inline-flex items-center rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700 border border-rose-200/80">
                                  DNC
                                </span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-sm font-normal">—</span>
                        )}
                      </TableCell>

                      {/* 2. Contact ID */}
                      <TableCell className="py-4 px-6" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-flex items-center rounded-md px-2.5 py-1 font-mono text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200/80 shadow-2xs max-w-[140px] truncate"
                            title={contact.id}
                          >
                            {contact.id.length > 14 ? `${contact.id.slice(0, 14)}...` : contact.id}
                          </span>
                          <button
                            type="button"
                            aria-label="Copy Contact ID"
                            className="rounded-md p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                            onClick={() => handleCopy(contact.id, "Contact ID")}
                            title="Copy Contact ID"
                          >
                            {copiedId === contact.id ? (
                              <Check className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      </TableCell>

                      {/* 3. Conversations */}
                      <TableCell className="py-4 px-6">
                        <span className="inline-flex items-center rounded-full px-3 py-0.5 text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100/80 shadow-2xs">
                          {conversationsCount}
                        </span>
                      </TableCell>

                      {/* 4. Last Conversation */}
                      <TableCell className="py-4 px-6">
                        {contact.lastConversationAt ? (
                          <span className="text-sm font-normal text-slate-600">
                            {formatDateTime(contact.lastConversationAt)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 italic">No conversations yet</span>
                        )}
                      </TableCell>

                      {/* 5. Actions (View, Edit, Delete) */}
                      <TableCell className="py-4 px-6 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 transition-all shadow-2xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-300/40"
                            onClick={() => setSelectedContact(contact)}
                            title="View Contact Details"
                          >
                            <Eye className="h-3.5 w-3.5 text-slate-500" />
                            <span>View</span>
                          </button>

                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 transition-all shadow-2xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-300/40"
                            onClick={() => beginEdit(contact)}
                            title="Edit Contact"
                          >
                            <Pencil className="h-3.5 w-3.5 text-slate-500" />
                            <span>Edit</span>
                          </button>

                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium text-rose-600 bg-rose-50/70 border border-rose-200/80 hover:bg-rose-100 hover:text-rose-700 hover:border-rose-300 transition-all shadow-2xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                            onClick={() => setArchivingContact(contact)}
                            title="Delete Contact"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-rose-500" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* 4. Pagination bar */}
        {contactsPagination.totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 bg-slate-50/60 border-t border-slate-100 text-sm">
            <span className="text-slate-500 text-xs sm:text-sm">
              Showing page <strong className="text-slate-900 font-semibold">{contactsPagination.page}</strong> of{" "}
              <strong className="text-slate-900 font-semibold">{contactsPagination.totalPages}</strong> ({contactsPagination.total} total)
            </span>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-2xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-3.5 w-3.5 text-slate-500" />
                <span>Previous</span>
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-2xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={currentPage >= contactsPagination.totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
              >
                <span>Next</span>
                <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Contact Details Slide-over Panel */}
      {selectedContact && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="contact-detail-title"
            className="flex h-full w-full max-w-xl flex-col bg-background shadow-2xl border-l border-border animate-in slide-in-from-right duration-200"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-muted/20">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold shadow-sm ${getAvatarColor(
                    selectedContact.firstName + (selectedContact.lastName || ""),
                  )}`}
                >
                  {getInitials(selectedContact.firstName, selectedContact.lastName)}
                </div>
                <div>
                  <h2 id="contact-detail-title" className="text-lg font-semibold text-foreground">
                    {selectedContact.firstName} {selectedContact.lastName ?? ""}
                  </h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <StatusBadge status={selectedContact.status} />
                    {selectedContact.doNotCall && (
                      <span className="inline-flex items-center gap-1 rounded bg-rose-500/10 px-2 py-0.5 text-xs font-semibold text-rose-600 dark:text-rose-400">
                        <PhoneOff className="h-3 w-3" /> Do Not Call
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                aria-label="Close details"
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setSelectedContact(null)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
              {/* Primary Contact Details Grid */}
              <div className="grid grid-cols-2 gap-4 rounded-xl border border-border/70 bg-card p-4 shadow-sm">
                <div>
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Phone Number</span>
                  <div className="mt-1 flex items-center gap-2 font-mono text-sm font-medium text-foreground">
                    <span>{selectedContact.phone || "Not available"}</span>
                    {selectedContact.phone && (
                      <button
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => handleCopy(selectedContact.phone!, "Phone number")}
                        title="Copy phone"
                      >
                        {copiedId === selectedContact.phone ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Email Address</span>
                  <div className="mt-1 text-sm font-medium text-foreground truncate">
                    {selectedContact.email || "Not available"}
                  </div>
                </div>

                <div>
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Company</span>
                  <div className="mt-1 text-sm font-medium text-foreground">
                    {selectedContact.company || "Not available"}
                  </div>
                </div>

                <div>
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Title / Role</span>
                  <div className="mt-1 text-sm font-medium text-foreground">
                    {selectedContact.title || "Not available"}
                  </div>
                </div>

                <div className="col-span-2 border-t border-border/60 pt-3 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Contact ID</span>
                  <div className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
                    <span>{selectedContact.id}</span>
                    <button
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => handleCopy(selectedContact.id, "Contact ID")}
                      title="Copy ID"
                    >
                      {copiedId === selectedContact.id ? (
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Consent and Compliance Panel */}
              <div className="rounded-xl border border-border/70 bg-card p-4 shadow-sm space-y-3">
                <div className="flex items-center gap-2 font-medium text-sm text-foreground">
                  <ShieldCheck className="h-4 w-4 text-indigo-600" />
                  <span>Voice Call Consent & Compliance</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground">Consent Status:</span>
                    <span className="block mt-0.5 font-semibold text-foreground">
                      {selectedContact.voiceConsentAt && !selectedContact.doNotCall
                        ? "Granted"
                        : selectedContact.doNotCall
                        ? "Revoked / Do Not Call"
                        : "Not available"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Consent Source:</span>
                    <span className="block mt-0.5 font-medium text-foreground capitalize">
                      {selectedContact.voiceConsentSource || "Not available"}
                    </span>
                  </div>
                  {selectedContact.voiceConsentEvidence && (
                    <div className="col-span-2 rounded bg-muted/40 p-2.5 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">Evidence note: </span>
                      {selectedContact.voiceConsentEvidence}
                    </div>
                  )}
                </div>
              </div>

              {/* Associated Conversations / Calls Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">
                    Associated Conversations ({selectedContact.calls?.length || 0})
                  </h3>
                  {selectedContact.lastConversationAt && (
                    <span className="text-xs text-muted-foreground">
                      Latest: {formatDateTime(selectedContact.lastConversationAt)}
                    </span>
                  )}
                </div>

                {!selectedContact.calls || selectedContact.calls.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground">
                    <p className="text-sm font-medium">No conversations yet</p>
                    <p className="text-xs mt-1">There are no call records associated with this contact.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedContact.calls.map((call) => {
                      const displayCallId = call.externalCallId || call.id;
                      return (
                        <div
                          key={call.id}
                          className="rounded-xl border border-border/70 bg-card p-4 shadow-sm space-y-2 hover:border-indigo-500/40 transition-colors"
                        >
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 font-mono">
                              <span className="font-semibold text-foreground">ID:</span>
                              <span className="text-muted-foreground">{displayCallId}</span>
                              <button
                                className="text-muted-foreground hover:text-foreground"
                                onClick={() => handleCopy(displayCallId, "Call ID")}
                                title="Copy Call ID"
                              >
                                {copiedId === displayCallId ? (
                                  <Check className="h-3 w-3 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </button>
                            </div>
                            <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-medium capitalize text-slate-700 dark:text-slate-300">
                              {call.direction || "outbound"}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                            <span>
                              Status: <strong className="text-foreground capitalize">{call.status}</strong>
                            </span>
                            <span>
                              Duration: <strong className="text-foreground">{formatDuration(call.durationSeconds)}</strong>
                            </span>
                            <span>Date: {formatDateTime(call.startedAt || call.createdAt)}</span>
                          </div>

                          {call.outcome && (
                            <div className="text-xs text-muted-foreground">
                              Outcome: <span className="text-foreground font-medium">{call.outcome}</span>
                            </div>
                          )}

                          {call.transcript && (
                            <div className="rounded-md bg-muted/40 p-2.5 text-xs text-muted-foreground line-clamp-3">
                              <span className="font-semibold text-foreground">Transcript: </span>
                              {call.transcript}
                            </div>
                          )}

                          <div className="pt-1 flex justify-end">
                            <a
                              href={`#/call-history`}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:underline"
                            >
                              <span>View in Call History</span>
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div
              className="flex items-center justify-between border-t px-6 py-4"
              style={{ backgroundColor: "#f8fafc", borderColor: "#e2e8f0" }}
            >
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer hover:bg-red-50 transition-colors shadow-xs"
                style={{
                  backgroundColor: "#ffffff",
                  color: "#dc2626",
                  border: "1px solid #fca5a5",
                }}
                onClick={() => setArchivingContact(selectedContact)}
              >
                <Archive className="h-4 w-4" style={{ color: "#dc2626" }} />
                <span>Archive</span>
              </button>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  className="inline-flex items-center px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer hover:bg-slate-100 transition-colors shadow-xs"
                  style={{
                    backgroundColor: "#ffffff",
                    color: "#0f172a",
                    border: "1px solid #cbd5e1",
                  }}
                  onClick={() => setSelectedContact(null)}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-white cursor-pointer hover:opacity-90 transition-opacity shadow-sm"
                  style={{
                    backgroundColor: "#4f46e5",
                    color: "#ffffff",
                  }}
                  onClick={() => {
                    beginEdit(selectedContact);
                  }}
                >
                  <Pencil className="h-4 w-4 text-white" />
                  <span>Edit Contact</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Contact Modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="contact-form-title"
            className="w-full max-w-xl rounded-xl border border-border bg-background p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 id="contact-form-title" className="text-lg font-semibold text-foreground">
                {editing ? "Edit Contact" : "Add Contact"}
              </h2>
              <button
                aria-label="Close"
                onClick={() => setFormOpen(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
              <label className="grid gap-1.5 text-sm font-medium">
                <span>First name *</span>
                <input
                  required
                  minLength={1}
                  className="h-9 rounded-lg border border-border bg-background px-3 font-normal focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                />
              </label>

              <label className="grid gap-1.5 text-sm font-medium">
                <span>Last name</span>
                <input
                  className="h-9 rounded-lg border border-border bg-background px-3 font-normal focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                />
              </label>

              <label className="grid gap-1.5 text-sm font-medium">
                <span>Email address</span>
                <input
                  type="email"
                  className="h-9 rounded-lg border border-border bg-background px-3 font-normal focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </label>

              <label className="grid gap-1.5 text-sm font-medium">
                <span>Phone number (E.164)</span>
                <input
                  type="tel"
                  placeholder="+919876543210 or +14155552671"
                  className="h-9 rounded-lg border border-border bg-background px-3 font-normal font-mono focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </label>

              <label className="grid gap-1.5 text-sm font-medium">
                <span>Company</span>
                <input
                  className="h-9 rounded-lg border border-border bg-background px-3 font-normal focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                />
              </label>

              <label className="grid gap-1.5 text-sm font-medium">
                <span>Title / Role</span>
                <input
                  className="h-9 rounded-lg border border-border bg-background px-3 font-normal focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </label>

              {/* Voice Consent Safeguard Panel */}
              <div className="sm:col-span-2 rounded-xl border border-border/80 bg-muted/20 p-4 space-y-3">
                <label className="flex items-center gap-2.5 text-sm font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border text-indigo-600 focus:ring-indigo-500"
                    checked={form.voiceConsentGranted}
                    disabled={form.doNotCall}
                    onChange={(e) => setForm({ ...form, voiceConsentGranted: e.target.checked })}
                  />
                  <span>I verified this contact explicitly consented to AI voice calls.</span>
                </label>

                {form.voiceConsentGranted && (
                  <div className="grid gap-3 pt-2">
                    <label className="grid gap-1 text-xs font-medium">
                      <span>Consent source</span>
                      <select
                        className="h-9 rounded-lg border border-border bg-background px-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
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

                    <label className="grid gap-1 text-xs font-medium">
                      <span>Consent evidence note *</span>
                      <textarea
                        required
                        minLength={5}
                        maxLength={500}
                        className="rounded-lg border border-border bg-background p-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        value={form.voiceConsentEvidence}
                        onChange={(e) => setForm({ ...form, voiceConsentEvidence: e.target.value })}
                        placeholder="Record where/how consent was obtained"
                        rows={2}
                      />
                    </label>
                  </div>
                )}

                <label className="flex items-center gap-2.5 text-sm font-medium cursor-pointer pt-1 text-rose-600 dark:text-rose-400">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border text-rose-600 focus:ring-rose-500"
                    checked={form.doNotCall}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        doNotCall: e.target.checked,
                        voiceConsentGranted: e.target.checked ? false : form.voiceConsentGranted,
                      })
                    }
                  />
                  <span>Do not call this contact (revokes stored voice-call consent).</span>
                </label>
              </div>

              <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
                <span>Status</span>
                <select
                  className="h-9 rounded-lg border border-border bg-background px-3 text-sm font-normal focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
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

              <div className="col-span-full flex justify-end gap-3 pt-4 border-t border-slate-200 mt-2">
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer hover:bg-slate-100 transition-colors shadow-xs"
                  style={{
                    backgroundColor: "#ffffff",
                    color: "#0f172a",
                    border: "1px solid #cbd5e1",
                  }}
                  onClick={() => setFormOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-lg text-sm font-semibold text-white cursor-pointer hover:opacity-90 disabled:opacity-50 transition-opacity shadow-sm"
                  style={{
                    backgroundColor: "#4f46e5",
                    color: "#ffffff",
                  }}
                >
                  {saving ? "Saving..." : "Save Contact"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Archive Confirmation Dialog */}
      {archivingContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" role="presentation">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="archive-contact-title"
            className="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-2xl"
          >
            <h2 id="archive-contact-title" className="text-lg font-semibold text-foreground">
              Archive Contact
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Are you sure you want to archive{" "}
              <strong className="text-foreground">
                {archivingContact.firstName} {archivingContact.lastName ?? ""}
              </strong>
              ? This will mark their status as inactive.
            </p>
            <div className="mt-6 flex justify-end gap-3 pt-2">
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer hover:bg-slate-100 transition-colors shadow-xs"
                style={{
                  backgroundColor: "#ffffff",
                  color: "#0f172a",
                  border: "1px solid #cbd5e1",
                }}
                onClick={() => setArchivingContact(null)}
                disabled={archiving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white cursor-pointer hover:opacity-90 disabled:opacity-50 transition-opacity shadow-sm"
                style={{
                  backgroundColor: "#dc2626",
                  color: "#ffffff",
                }}
                onClick={() => void handleArchiveConfirm()}
                disabled={archiving}
              >
                {archiving ? "Archiving..." : "Archive"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default ContactsView;
