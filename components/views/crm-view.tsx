"use client";

import React, { useMemo } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAppState } from "@/context/StateContext";
import {
  Layers,
  UserRoundSearch,
  CalendarCheck,
  MessageSquareText,
  Contact as ContactIcon,
  ShieldCheck,
  RefreshCw,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  Sparkles,
  PhoneCall,
  CheckCircle2,
} from "lucide-react";

export const CrmView: React.FC = () => {
  const {
    contacts,
    contactsLoading,
    loadContacts,
    appointments,
    messages,
  } = useAppState();

  const complianceStats = useMemo(() => {
    let activeConsent = 0;
    let dncCount = 0;
    let newLeads = 0;
    let contactedLeads = 0;
    let qualifiedLeads = 0;
    let convertedLeads = 0;

    contacts.forEach((contact) => {
      const hasConsent = Boolean(
        contact.voiceConsentAt &&
          (!contact.voiceConsentRevokedAt ||
            new Date(contact.voiceConsentAt) > new Date(contact.voiceConsentRevokedAt)) &&
          !contact.doNotCall,
      );
      if (hasConsent) activeConsent++;
      if (contact.doNotCall) dncCount++;

      const st = (contact.status || "").toLowerCase().trim();
      if (st === "new") newLeads++;
      else if (st === "contacted") contactedLeads++;
      else if (st === "qualified") qualifiedLeads++;
      else if (st === "converted") convertedLeads++;
    });

    return {
      activeConsent,
      dncCount,
      newLeads,
      contactedLeads,
      qualifiedLeads,
      convertedLeads,
    };
  }, [contacts]);

  return (
    <div className="space-y-6 w-full max-w-full pb-8">
      {/* Header */}
      <PageHeader
        title="CRM Workspace"
        description="Unified hub for managing customer relationships, communications, and sales pipeline workflows."
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadContacts()}
          disabled={contactsLoading}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${contactsLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </PageHeader>

      {/* Overview KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <div className="bg-[#FCFAFF] rounded-[16px] border border-[#E9D5FF] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex flex-col items-center justify-center text-center">
          <div className="h-[44px] w-[44px] rounded-[12px] bg-[#F1EDFF] border border-[#DDD6FE]/70 flex items-center justify-center text-[#6D28D9] mb-2.5">
            <Layers className="h-5 w-5" />
          </div>
          <p className="text-[14px] font-semibold text-[#111827]">Total CRM Records</p>
          <p className="text-[30px] font-bold text-[#111827] mt-1">{contacts.length}</p>
        </div>

        <div className="bg-[#FFFDF5] rounded-[16px] border border-[#FDE68A] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex flex-col items-center justify-center text-center">
          <div className="h-[44px] w-[44px] rounded-[12px] bg-[#FEF3C7] border border-[#FDE68A]/60 flex items-center justify-center text-[#D97706] mb-2.5">
            <Sparkles className="h-5 w-5" />
          </div>
          <p className="text-[14px] font-semibold text-[#111827]">New Inbound Leads</p>
          <p className="text-[30px] font-bold text-[#111827] mt-1">{complianceStats.newLeads}</p>
        </div>

        <div className="bg-[#F7FDF9] rounded-[16px] border border-[#BBF7D0] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex flex-col items-center justify-center text-center">
          <div className="h-[44px] w-[44px] rounded-[12px] bg-[#DCFCE7] border border-[#86EFAC]/50 flex items-center justify-center text-[#16A34A] mb-2.5">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <p className="text-[14px] font-semibold text-[#111827]">Voice Consent Verified</p>
          <p className="text-[30px] font-bold text-[#111827] mt-1">{complianceStats.activeConsent}</p>
        </div>

        <div className="bg-[#FFF8F8] rounded-[16px] border border-[#FECACA] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03)] flex flex-col items-center justify-center text-center">
          <div className="h-[44px] w-[44px] rounded-[12px] bg-[#FEE2E2] border border-[#FECACA]/60 flex items-center justify-center text-[#DC2626] mb-2.5">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <p className="text-[14px] font-semibold text-[#111827]">Do Not Call (DNC)</p>
          <p className="text-[30px] font-bold text-[#111827] mt-1">{complianceStats.dncCount}</p>
        </div>
      </div>

      {/* CRM Navigation Hub */}
      <div>
        <h3 className="text-[17px] font-bold text-[#111827] mb-4">
          Dedicated CRM Modules
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 1. Leads Hub Card */}
          <a
            href="#/leads"
            className="group block p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-2xs hover:border-[#6D28D9]/50 hover:shadow-md transition-all cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3.5">
                <div className="h-11 w-11 rounded-xl bg-[#F1EDFF] border border-[#DDD6FE] text-[#6D28D9] flex items-center justify-center group-hover:scale-105 transition-transform">
                  <UserRoundSearch className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-[16px] font-bold text-[#111827] group-hover:text-[#6D28D9] transition-colors">
                    Leads Management
                  </h4>
                  <p className="text-[13px] text-[#64748B] mt-0.5">
                    Track prospective customers, property interests, and sales status
                  </p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-slate-400 group-hover:text-[#6D28D9] group-hover:translate-x-1 transition-all" />
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[13px]">
              <span className="text-[#64748B]">Active Leads in Pipeline</span>
              <span className="font-semibold text-[#6D28D9]">{contacts.length} total</span>
            </div>
          </a>

          {/* 2. Bookings Hub Card */}
          <a
            href="#/bookings"
            className="group block p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-2xs hover:border-[#6D28D9]/50 hover:shadow-md transition-all cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3.5">
                <div className="h-11 w-11 rounded-xl bg-[#EDE8FF] border border-[#DDD6FE] text-[#6D28D9] flex items-center justify-center group-hover:scale-105 transition-transform">
                  <CalendarCheck className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-[16px] font-bold text-[#111827] group-hover:text-[#6D28D9] transition-colors">
                    Bookings & Viewings
                  </h4>
                  <p className="text-[13px] text-[#64748B] mt-0.5">
                    Manage scheduled appointments, Cal.com meetings, and site visits
                  </p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-slate-400 group-hover:text-[#6D28D9] group-hover:translate-x-1 transition-all" />
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[13px]">
              <span className="text-[#64748B]">Scheduled Appointments</span>
              <span className="font-semibold text-[#6D28D9]">{appointments.length} total</span>
            </div>
          </a>

          {/* 3. Follow-Ups Hub Card */}
          <a
            href="#/follow-ups"
            className="group block p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-2xs hover:border-[#6D28D9]/50 hover:shadow-md transition-all cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3.5">
                <div className="h-11 w-11 rounded-xl bg-[#FEF3C7] border border-[#FDE68A] text-[#D97706] flex items-center justify-center group-hover:scale-105 transition-transform">
                  <MessageSquareText className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-[16px] font-bold text-[#111827] group-hover:text-[#D97706] transition-colors">
                    Follow-Ups & Enquiries
                  </h4>
                  <p className="text-[13px] text-[#64748B] mt-0.5">
                    Review pending caller requests, notes, and agent follow-up items
                  </p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-slate-400 group-hover:text-[#D97706] group-hover:translate-x-1 transition-all" />
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[13px]">
              <span className="text-[#64748B]">Logged Caller Messages</span>
              <span className="font-semibold text-[#D97706]">{messages.length} total</span>
            </div>
          </a>

          {/* 4. Contacts Directory Card */}
          <a
            href="#/contacts"
            className="group block p-5 rounded-2xl bg-white border border-[#E2E8F0] shadow-2xs hover:border-[#6D28D9]/50 hover:shadow-md transition-all cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3.5">
                <div className="h-11 w-11 rounded-xl bg-[#DBEAFE] border border-[#BFDBFE] text-[#2563EB] flex items-center justify-center group-hover:scale-105 transition-transform">
                  <ContactIcon className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-[16px] font-bold text-[#111827] group-hover:text-[#2563EB] transition-colors">
                    Contacts Directory
                  </h4>
                  <p className="text-[13px] text-[#64748B] mt-0.5">
                    Authoritative customer directory with Retell integration
                  </p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-slate-400 group-hover:text-[#2563EB] group-hover:translate-x-1 transition-all" />
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[13px]">
              <span className="text-[#64748B]">Organization Phonebook</span>
              <span className="font-semibold text-[#2563EB]">View all contacts</span>
            </div>
          </a>
        </div>
      </div>

      {/* Pipeline Status Distribution */}
      <Card className="border-[#E2E8F0] rounded-2xl">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-[#6D28D9]" />
              <h3 className="text-[16px] font-bold text-[#111827]">
                Sales Pipeline Distribution
              </h3>
            </div>
            <a
              href="#/leads"
              className="text-[13px] font-semibold text-[#6D28D9] hover:underline"
            >
              Open Leads Page →
            </a>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200/70">
              <span className="text-[12px] font-medium text-amber-700">New Stage</span>
              <p className="text-[22px] font-bold text-amber-900 mt-1">{complianceStats.newLeads}</p>
            </div>
            <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-200/70">
              <span className="text-[12px] font-medium text-blue-700">Contacted</span>
              <p className="text-[22px] font-bold text-blue-900 mt-1">{complianceStats.contactedLeads}</p>
            </div>
            <div className="p-3.5 rounded-xl bg-purple-50/60 border border-purple-200/70">
              <span className="text-[12px] font-medium text-purple-700">Qualified</span>
              <p className="text-[22px] font-bold text-purple-900 mt-1">{complianceStats.qualifiedLeads}</p>
            </div>
            <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200/70">
              <span className="text-[12px] font-medium text-emerald-700">Converted</span>
              <p className="text-[22px] font-bold text-emerald-900 mt-1">{complianceStats.convertedLeads}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CrmView;
