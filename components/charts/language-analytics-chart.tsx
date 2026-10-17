"use client";

import React, { useMemo } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppState } from "@/context/StateContext";

const PALETTE = ["#8b5cf6", "#10b981", "#3b82f6", "#f97316", "#06b6d4", "#ec4899"];

export function LanguageAnalyticsChart() {
  const { agents } = useAppState();

  const data = useMemo(() => {
    const langMap = new Map<string, number>();
    for (const agent of agents) {
      const langs = agent.languages && agent.languages.length > 0 ? agent.languages : ["English"];
      for (const lang of langs) {
        const normalized = lang.trim();
        if (normalized) {
          langMap.set(normalized, (langMap.get(normalized) ?? 0) + 1);
        }
      }
    }

    if (langMap.size === 0) {
      langMap.set("English", 1);
    }

    return Array.from(langMap.entries()).map(([name, value], i) => ({
      name,
      value,
      color: PALETTE[i % PALETTE.length],
    }));
  }, [agents]);

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Language Analytics</CardTitle>
      </CardHeader>
      <CardContent className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius="55%"
              outerRadius="80%"
              dataKey="value"
              paddingAngle={3}
            >
              {data.map((entry, index) => (
                <Cell key={`lang-cell-${entry.name}-${index}`} fill={entry.color} stroke="none" />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
              }}
            />
            <Legend wrapperStyle={{ fontSize: "12px" }} />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
