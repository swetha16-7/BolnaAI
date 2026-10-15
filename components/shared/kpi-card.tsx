"use client";

import { motion } from "framer-motion";
import {
  Phone,
  Users,
  Clock,
  TrendingUp,
  DollarSign,
  Star,
  TrendingDown,
  Layers,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type KpiMetric =
  | "calls"
  | "crm"
  | "agents"
  | "duration"
  | "conversion"
  | "revenue"
  | "satisfaction";

interface KpiCardProps {
  label: string;
  value: string;
  change?: string;
  trend?: "up" | "down";
  metric: KpiMetric;
  index?: number;
}

const metricIcons: Record<KpiMetric, React.ElementType> = {
  calls: Phone,
  crm: Layers,
  agents: Users,
  duration: Clock,
  conversion: TrendingUp,
  revenue: DollarSign,
  satisfaction: Star,
};

const metricBorder = {
  calls: "border-l-4 border-l-[#3B82F6] border-t-[4px] border-t-[#3B82F6]",
  crm: "border-l-4 border-l-[#8b5cf6] border-t-[4px] border-t-[#8b5cf6]",
  agents: "border-l-4 border-l-[#6366F1] border-t-[4px] border-t-[#6366F1]",
  duration: "border-l-4 border-l-[#F59E0B] border-t-[4px] border-t-[#F59E0B]",
  conversion: "border-l-4 border-l-[#10B981] border-t-[4px] border-t-[#10B981]",
  revenue: "border-l-4 border-l-[#059669] border-t-[4px] border-t-[#059669]",
  satisfaction: "border-l-4 border-l-[#8B5CF6] border-t-[4px] border-t-[#8B5CF6]",
};

const iconColors = {
  calls: "text-[#3B82F6]",
  crm: "text-[#8B5CF6]",
  agents: "text-[#6366F1]",
  duration: "text-[#F59E0B]",
  conversion: "text-[#10B981]",
  revenue: "text-[#059669]",
  satisfaction: "text-[#8B5CF6]",
};

const extractRating = (value: string) => {
  const rating = Number(value.split("/")[0]);
  return Number.isFinite(rating) ? rating : 0;
};

export function KpiCard({ label, value, change, trend, metric, index = 0 }: KpiCardProps) {
  const Icon = metricIcons[metric];
  const borderClass = metricBorder[metric];
  const iconClass = iconColors[metric];
  const rating = metric === "satisfaction" ? extractRating(value) : 0;
  const filledStars = Math.round(rating);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
    >
      <Card
        className={cn(
          "stat-card border border-[#E5E7EB] bg-white/95 shadow-sm",
          borderClass,
          metric === "revenue" && "kpi-highlight"
        )}
      >
        <CardContent className="flex h-full flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
            </div>
            <div className={cn("stat-icon-wrapper rounded-2xl", iconClass)}>
              <Icon className="h-5 w-5" />
            </div>
          </div>
          <div className="flex items-end justify-between gap-3">
            <p className="text-[36px] font-semibold tracking-tight text-slate-950 leading-none">{value}</p>
            {change && trend && (
              <div
                className={cn(
                  "flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold",
                  trend === "up" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                )}
              >
                {trend === "up" ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                <span>{change}</span>
              </div>
            )}
          </div>
          {metric === "satisfaction" && (
            <div className="flex items-center gap-1 text-amber-500">
              {Array.from({ length: 5 }).map((_, index) => (
                <Star
                  key={index}
                  className={cn(
                    "h-4 w-4",
                    index < filledStars ? "fill-amber-400 text-amber-400" : "text-slate-200"
                  )}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
