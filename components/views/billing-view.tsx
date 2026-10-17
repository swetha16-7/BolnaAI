"use client";

import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { CreditCard } from "lucide-react";

export const BillingView: React.FC = () => {
  return (
    <div>
      <PageHeader
        title="Billing & Subscriptions"
        description="Manage your billing information and subscription plan"
      />

      <Card className="border-border/60">
        <CardContent className="p-6">
          <div className="flex flex-col items-center justify-center gap-4 py-12">
            <CreditCard className="h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-semibold">Billing Information</h3>
            <p className="text-sm text-muted-foreground">View your subscription details and billing history</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BillingView;
