"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function LanguageAnalyticsChart() {
  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Language Analytics</CardTitle>
      </CardHeader>
      <CardContent className="flex h-[280px] items-center justify-center text-center text-sm text-muted-foreground">
        Language is not recorded in the current call database model.
      </CardContent>
    </Card>
  );
}
