"use client";

import { PageHeader } from "@/components/shared/page-header";
import { KpiCard } from "@/components/shared/kpi-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { CallStatisticsChart } from "@/components/charts/call-statistics-chart";
import { LanguageAnalyticsChart } from "@/components/charts/language-analytics-chart";
import { RevenueOverviewChart } from "@/components/charts/revenue-overview-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button, buttonVariants } from "@/components/ui/button";
import { useAppState } from "@/context/StateContext";
import { Download, RefreshCw } from "lucide-react";
import Link from "next/link";

function formatDuration(seconds: number | null) {
  if (seconds === null) return "—";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
}

export const DashboardView = () => {
  const {
    dashboard,
    dashboardLoading,
    dashboardError,
    refreshDashboard,
    agents,
    agentsLoading,
    agentsError,
    refreshAgents,
  } = useAppState();
  const metrics = dashboard?.metrics;
  const stats = [
    { label: "Calls Today", value: metrics?.callsToday.toLocaleString() ?? "—", metric: "calls" as const },
    { label: "Active Agents", value: metrics?.activeAgents.toLocaleString() ?? "—", metric: "agents" as const },
    { label: "Contacts", value: metrics?.contacts.toLocaleString() ?? "—", metric: "crm" as const, href: "#/contacts" },
    { label: "Appointments", value: metrics?.appointments.toLocaleString() ?? "—", metric: "crm" as const, href: "#/crm" },
    { label: "Average Call Duration", value: formatDuration(metrics?.averageDurationSeconds ?? null), metric: "duration" as const },
    { label: "Total Calls", value: metrics?.totalCalls.toLocaleString() ?? "—", metric: "calls" as const },
  ];

  return (
    <div>
      <PageHeader title="Dashboard" description="Overview of activity stored for your organization">
        <Button
          variant="outline"
          size="sm"
          disabled={dashboardLoading}
          onClick={() => {
            void refreshDashboard();
            void refreshAgents();
          }}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          {dashboardLoading ? "Refreshing..." : "Refresh"}
        </Button>
        <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" disabled>
          <Download className="mr-2 h-4 w-4" />
          Export Report
        </Button>
      </PageHeader>
      {dashboardError && (
        <div role="alert" className="mb-4 flex items-center justify-between rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <span>{dashboardError}</span>
          <Button variant="outline" size="sm" onClick={() => void refreshDashboard()}>Retry</Button>
        </div>
      )}
      <div className="stats-grid">
        {stats.map((stat, index) => (
          <KpiCard key={stat.label} {...stat} index={index} />
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <CallStatisticsChart data={dashboard?.callsByDay ?? []} />
        <LanguageAnalyticsChart />
      </div>
      <div className="mt-6">
        <RevenueOverviewChart />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">Active Agents</CardTitle>
            <Link href="/agents" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              View all
            </Link>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Calls</TableHead>
                  <TableHead>Language</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agentsLoading ? (
                  <TableRow><TableCell colSpan={4} className="py-6 text-center">Loading agents...</TableCell></TableRow>
                ) : agentsError ? (
                  <TableRow><TableCell colSpan={4} role="alert" className="py-6 text-center">{agentsError}</TableCell></TableRow>
                ) : agents.filter((agent) => agent.status === "active").length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">No active agents.</TableCell></TableRow>
                ) : agents.filter((agent) => agent.status === "active").slice(0, 5).map((agent) => (
                  <TableRow key={agent.id}>
                    <TableCell className="font-medium">{agent.name}</TableCell>
                    <TableCell><StatusBadge status={agent.status} /></TableCell>
                    <TableCell>{agent.callsToday}</TableCell>
                    <TableCell>{agent.languages.join(", ") || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-semibold">Recent Calls</CardTitle>
            <Link href="/call-history" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              View all
            </Link>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Caller</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date / Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dashboardLoading ? (
                  <TableRow><TableCell colSpan={4} className="py-6 text-center">Loading calls...</TableCell></TableRow>
                ) : dashboardError ? (
                  <TableRow><TableCell colSpan={4} role="alert" className="py-6 text-center">{dashboardError}</TableCell></TableRow>
                ) : !dashboard?.recentCalls.length ? (
                  <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">No calls have been recorded.</TableCell></TableRow>
                ) : dashboard.recentCalls.map((call) => (
                  <TableRow key={call.id}>
                    <TableCell className="font-mono text-xs">{call.destination ?? call.callerNumber ?? "Unknown"}</TableCell>
                    <TableCell>{call.agent?.name ?? "Unassigned"}</TableCell>
                    <TableCell><StatusBadge status={call.outcome ?? call.status} /></TableCell>
                    <TableCell className="text-muted-foreground">{new Date(call.startedAt ?? call.createdAt).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
