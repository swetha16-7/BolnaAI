"use client";

import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { invoices, usageStats } from "@/lib/mock-data";
import { CreditCard, Download } from "lucide-react";

export default function BillingPage() {
  return (
    <div className="billing-page space-y-6">
      <PageHeader
        title="Billing"
        description="Manage your subscription, usage, and invoices with a clear view of plan details and spend."
      />

      <div className="billing-grid grid gap-6 lg:grid-cols-3">
        <Card className="billing-card border-indigo-200 bg-gradient-to-br from-indigo-50 to-white lg:col-span-1 border-border/60">
          <CardHeader>
            <CardTitle className="text-base">Current Subscription</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-3xl font-bold">Pro Plan</p>
              <p className="text-sm text-muted-foreground">$499 / month</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Next billing date: July 1, 2026
            </p>
            <Button className="w-full billing-action-btn">
              <CreditCard className="mr-2 h-4 w-4" />
              Upgrade Plan
            </Button>
          </CardContent>
        </Card>

        <Card className="billing-card billing-usage-card border-border/60 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Usage This Month</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {usageStats.map((stat) => (
              <div key={stat.label} className="usage-row space-y-2">
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span>{stat.label}</span>
                  <span className="font-medium text-sm">
                    {stat.used.toLocaleString()} / {stat.limit.toLocaleString()} {stat.unit}
                  </span>
                </div>
                <Progress value={(stat.used / stat.limit) * 100} className="h-2" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="billing-card billing-invoices-card mt-6 border-border/60">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Invoices</CardTitle>
            <p className="text-sm text-muted-foreground">Review paid and pending invoices for the current period.</p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice ID</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id} className="invoice-row">
                  <TableCell className="font-mono text-xs">{invoice.id}</TableCell>
                  <TableCell>{invoice.date}</TableCell>
                  <TableCell className="font-medium">{invoice.amount}</TableCell>
                  <TableCell>
                    <StatusBadge status={invoice.status} />
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" className="invoice-download-btn">
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
