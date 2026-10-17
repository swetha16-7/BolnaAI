"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function RevenueOverviewChart() {
  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Revenue Overview</CardTitle>
      </CardHeader>
      <CardContent className="flex h-[280px] items-center justify-center text-center text-sm text-muted-foreground">
        Revenue data is not available because revenue is not stored in the current database model.
      </CardContent>
    </Card>
  );
}
