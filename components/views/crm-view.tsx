"use client";

import { FormEvent, useEffect, useState } from "react";
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
import { Mail, Phone, PhoneCall, Plus, Search, Pencil, X } from "lucide-react";

const tabs = [
  { key: "leads", label: "Leads" },
  { key: "bookings", label: "Bookings" },
  { key: "followups", label: "Follow-Ups" },
  { key: "customers", label: "Customers" },
] as const;

type CrmTab = (typeof tabs)[number]["key"];
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

export const CrmView: React.FC = () => {
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
    appointments,
    appointmentsLoading,
    appointmentsError,
  } = useAppState();
  const [activeTab, setActiveTab] = useState<CrmTab>("leads");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editing, setEditing] = useState<ContactRecord | null>(null);
  const [form, setForm] = useState<ContactForm>(blankContact);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [callingContact, setCallingContact] = useState<ContactRecord | null>(null);
  const [callAgentId, setCallAgentId] = useState("");
  const [callSubmitting, setCallSubmitting] = useState(false);
  const [callConsentConfirmed, setCallConsentConfirmed] = useState(false);
  const callAgents = agents.filter((agent) => agent.status === "active" && agent.retellAgentId.trim());
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadContacts(
        search,
        activeTab === "customers" ? "converted" : statusFilter,
      );
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [search, statusFilter, activeTab, loadContacts]);

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
      if (saved) setFormOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = (contact: ContactRecord, status: string) => {
    void updateContact(contact.id, { status });
  };

  const hasActiveVoiceConsent = (contact: ContactRecord) =>
    Boolean(
      contact.voiceConsentAt &&
      (!contact.voiceConsentRevokedAt ||
        new Date(contact.voiceConsentAt) > new Date(contact.voiceConsentRevokedAt)) &&
      !contact.doNotCall,
    );

  const beginCall = (contact: ContactRecord) => {
    if (!contact.phone || !/^\+[1-9]\d{7,14}$/.test(contact.phone)) {
      showToast("Add a valid E.164 phone number before requesting a call.", "error");
      return;
    }
    if (!hasActiveVoiceConsent(contact)) {
      showToast("Recorded, unrevoked consent is required before calling this contact.", "error");
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
      const call = await createCall({
        agentId: callAgentId,
        contactId: callingContact.id,
        destination: callingContact.phone ?? "",
        consentConfirmed: callConsentConfirmed,
        idempotencyKey: window.crypto.randomUUID(),
      });
      if (call) setCallingContact(null);
    } finally {
      setCallSubmitting(false);
    }
  };

  const shownContacts = activeTab === "customers"
    ? contacts.filter((contact) => contact.status === "converted")
    : contacts;

  return (
    <div>
      <PageHeader
        title="Leads & Appointments"
        description="Manage organization contacts and appointments stored in your workspace"
      >
        {activeTab !== "bookings" && activeTab !== "followups" && (
          <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={beginCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add Contact
          </Button>
        )}
      </PageHeader>

      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Button
            key={tab.key}
            variant={activeTab === tab.key ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {(activeTab === "leads" || activeTab === "customers") && (
        <Card className="border-border/60">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-6 py-4">
            <h3 className="text-lg font-semibold">
              {activeTab === "customers" ? "Converted Contacts" : "Organization Contacts"}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  aria-label="Search contacts"
                  className="w-44 bg-transparent outline-none"
                  placeholder="Search contacts..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              {activeTab === "leads" && (
                <select
                  aria-label="Filter contacts by status"
                  className="h-9 rounded-md border border-border bg-background px-3 text-sm"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option value="">All Statuses</option>
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="qualified">Qualified</option>
                  <option value="converted">Converted</option>
                  <option value="inactive">Inactive</option>
                </select>
              )}
            </div>
          </div>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Contact</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contactsLoading ? (
                  <TableRow><TableCell colSpan={7} className="py-8 text-center">Loading contacts...</TableCell></TableRow>
                ) : contactsError ? (
                  <TableRow>
                    <TableCell colSpan={7} role="alert" className="py-8 text-center">
                      {contactsError}{" "}
                      <Button variant="outline" size="sm" onClick={() => void loadContacts(search, statusFilter)}>Retry</Button>
                    </TableCell>
                  </TableRow>
                ) : shownContacts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      {activeTab === "customers"
                        ? "No contacts are marked as converted."
                        : contacts.length === 0
                          ? "No contacts have been added to this organization."
                          : "No contacts match your search."}
                    </TableCell>
                  </TableRow>
                ) : shownContacts.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell className="font-medium">
                      {contact.firstName} {contact.lastName}
                      {contact.title && <span className="block text-xs text-muted-foreground">{contact.title}</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-xs">
                        {contact.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{contact.email}</span>}
                        {contact.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{contact.phone}</span>}
                      </div>
                    </TableCell>
                    <TableCell>{contact.company ?? "—"}</TableCell>
                    <TableCell>{contact.source ?? "—"}</TableCell>
                    <TableCell>
                      <select
                        aria-label={`Status for ${contact.firstName}`}
                        className="rounded-md border border-border bg-background px-2 py-1 text-sm"
                        value={contact.status}
                        onChange={(event) => updateStatus(contact, event.target.value)}
                      >
                        <option value="new">New</option>
                        <option value="contacted">Contacted</option>
                        <option value="qualified">Qualified</option>
                        <option value="converted">Converted</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </TableCell>
                    <TableCell className="text-sm">
                      {contact.lastContactAt ? new Date(contact.lastContactAt).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!contact.phone || !hasActiveVoiceConsent(contact) || callAgents.length === 0}
                        onClick={() => beginCall(contact)}
                        title={
                          contact.doNotCall || !hasActiveVoiceConsent(contact)
                            ? "Recorded, unrevoked voice-call consent is required"
                            : callAgents.length === 0
                              ? "No active agent has a Retell mapping"
                              : undefined
                        }
                      >
                        <PhoneCall className="mr-1 h-3.5 w-3.5" /> Call
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => beginEdit(contact)}>
                        <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                      </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {activeTab === "bookings" && (
        <Card className="border-border/60">
          <div className="border-b border-border/60 px-6 py-4">
            <h3 className="text-lg font-semibold">Appointments</h3>
          </div>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contact</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Date &amp; Time</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {appointmentsLoading ? (
                  <TableRow><TableCell colSpan={4} className="py-8 text-center">Loading appointments...</TableCell></TableRow>
                ) : appointmentsError ? (
                  <TableRow><TableCell colSpan={4} role="alert" className="py-8 text-center">{appointmentsError}</TableCell></TableRow>
                ) : appointments.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">No appointments have been recorded.</TableCell></TableRow>
                ) : appointments.map((appointment) => (
                  <TableRow key={appointment.id}>
                    <TableCell>{appointment.contact
                      ? `${appointment.contact.firstName} ${appointment.contact.lastName ?? ""}`.trim()
                      : "Unlinked contact"}</TableCell>
                    <TableCell>{appointment.serviceName ?? "—"}</TableCell>
                    <TableCell>{new Date(appointment.startsAt).toLocaleString()}</TableCell>
                    <TableCell><StatusBadge status={appointment.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {activeTab === "followups" && (
        <Card className="border-border/60">
          <CardContent className="py-10 text-center text-muted-foreground">
            Follow-up tasks are not connected: the current database schema has no follow-up records.
          </CardContent>
        </Card>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="contact-form-title" className="w-full max-w-xl rounded-xl border border-border bg-background p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 id="contact-form-title" className="text-lg font-semibold">{editing ? "Edit Contact" : "Add Contact"}</h2>
              <button aria-label="Close" onClick={() => setFormOpen(false)}><X className="h-5 w-5" /></button>
            </div>
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
              <label className="grid gap-1 text-sm">First name
                <input required minLength={1} className="rounded-md border border-border bg-background px-3 py-2" value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
              </label>
              <label className="grid gap-1 text-sm">Last name
                <input className="rounded-md border border-border bg-background px-3 py-2" value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
              </label>
              <label className="grid gap-1 text-sm">Email
                <input type="email" className="rounded-md border border-border bg-background px-3 py-2" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
              </label>
              <label className="grid gap-1 text-sm">Phone (E.164)
                <input type="tel" placeholder="+919876543210 or +14155552671" className="rounded-md border border-border bg-background px-3 py-2" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
              </label>
              <label className="grid gap-1 text-sm">Company
                <input className="rounded-md border border-border bg-background px-3 py-2" value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} />
              </label>
              <label className="grid gap-1 text-sm">Title
                <input className="rounded-md border border-border bg-background px-3 py-2" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
              </label>
              <label className="grid gap-1 text-sm">Source
                <input className="rounded-md border border-border bg-background px-3 py-2" value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} />
              </label>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.voiceConsentGranted}
                  disabled={form.doNotCall}
                  onChange={(event) => setForm({ ...form, voiceConsentGranted: event.target.checked })}
                />
                I verified this contact explicitly consented to AI voice calls.
              </label>
              {form.voiceConsentGranted && (
                <>
                  <label className="grid gap-1 text-sm">Consent source
                    <select
                      className="rounded-md border border-border bg-background px-3 py-2"
                      value={form.voiceConsentSource}
                      onChange={(event) => setForm({ ...form, voiceConsentSource: event.target.value as ContactForm["voiceConsentSource"] })}
                    >
                      <option value="written">Written</option>
                      <option value="verbal">Verbal</option>
                      <option value="web_form">Web form</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm">Consent evidence note
                    <textarea
                      required
                      minLength={5}
                      maxLength={500}
                      className="rounded-md border border-border bg-background px-3 py-2"
                      value={form.voiceConsentEvidence}
                      onChange={(event) => setForm({ ...form, voiceConsentEvidence: event.target.value })}
                      placeholder="Record where/how consent was obtained"
                    />
                  </label>
                </>
              )}
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.doNotCall}
                  onChange={(event) => setForm({
                    ...form,
                    doNotCall: event.target.checked,
                    voiceConsentGranted: event.target.checked ? false : form.voiceConsentGranted,
                  })}
                />
                Do not call this contact (revokes stored voice-call consent).
              </label>
              <label className="grid gap-1 text-sm">Status
                <select className="rounded-md border border-border bg-background px-3 py-2" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="qualified">Qualified</option>
                  <option value="converted">Converted</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
              <div className="col-span-full flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save Contact"}</Button>
              </div>
            </form>
          </section>
        </div>
      )}

      {callingContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="call-confirm-title" className="w-full max-w-lg rounded-xl border border-border bg-background p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 id="call-confirm-title" className="text-lg font-semibold">Confirm outbound call</h2>
              <button aria-label="Close" onClick={() => setCallingContact(null)} disabled={callSubmitting}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              You are requesting a real call to {callingContact.firstName} {callingContact.lastName ?? ""} at {callingContact.phone}. Confirm only if you have verified the consent evidence and applicable calling rules.
            </p>
            <label className="mb-5 grid gap-1 text-sm">Active agent
              <select
                className="rounded-md border border-border bg-background px-3 py-2"
                value={callAgentId}
                onChange={(event) => setCallAgentId(event.target.value)}
              >
                {callAgents.map((agent) => (
                  <option key={agent.id} value={agent.id}>{agent.name}</option>
                ))}
              </select>
            </label>
            <label className="mb-5 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={callConsentConfirmed}
                onChange={(event) => setCallConsentConfirmed(event.target.checked)}
              />
              I confirm this contact has current consent to receive an AI voice call at {callingContact.phone}.
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCallingContact(null)} disabled={callSubmitting}>Cancel</Button>
              <Button onClick={() => void handleCallSubmit()} disabled={callSubmitting || !callAgentId || !callConsentConfirmed}>
                {callSubmitting ? "Submitting..." : "Confirm call"}
              </Button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default CrmView;
