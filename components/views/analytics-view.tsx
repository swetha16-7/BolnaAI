"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  type TooltipContentProps,
} from "recharts";
import { RefreshCw } from "lucide-react";
import { useAppState } from "@/context/StateContext";
import { api, type ApiRetellCall } from "@/lib/api-client";

const COLOR_PALETTE = [
  "#8b5cf6", // Violet
  "#10b981", // Emerald
  "#3b82f6", // Blue
  "#f97316", // Orange
  "#06b6d4", // Cyan
  "#ec4899", // Pink
  "#eab308", // Yellow
];

const gridColor = "rgba(255,255,255,0.05)";
const textFill = "#71717a";

export const AnalyticsView: React.FC = () => {
  const { agents, dashboard, activeCalls } = useAppState();
  const [retellCalls, setRetellCalls] = useState<ApiRetellCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const fetchCalls = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.retellCalls.list(new URLSearchParams({ pageSize: "100" }));
      setRetellCalls(result.calls);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load Retell analytics data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadInitial = async () => {
      try {
        const result = await api.retellCalls.list(new URLSearchParams({ pageSize: "100" }));
        if (!cancelled) {
          setRetellCalls(result.calls);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load Retell analytics data.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void loadInitial();
    return () => {
      cancelled = true;
    };
  }, []);

  // 1. Strict deduplication of calls by unique callId
  const uniqueCalls = useMemo(() => {
    const map = new Map<string, ApiRetellCall>();
    for (const call of retellCalls) {
      if (call.callId && !map.has(call.callId)) {
        map.set(call.callId, call);
      }
    }
    return Array.from(map.values());
  }, [retellCalls]);

  // 2. High-level KPI computations from deduplicated data
  const kpis = useMemo(() => {
    const totalCalls = uniqueCalls.length > 0 ? uniqueCalls.length : (dashboard?.metrics.totalCalls ?? 0);
    const completedCalls = uniqueCalls.filter((c) => c.status === "completed").length;
    const conversionRate = uniqueCalls.length > 0
      ? ((completedCalls / uniqueCalls.length) * 100).toFixed(1)
      : "100.0";

    const callsWithDuration = uniqueCalls.filter(
      (c) => typeof c.durationSeconds === "number" && c.durationSeconds > 0,
    );
    const totalDurationSeconds = callsWithDuration.reduce(
      (acc, c) => acc + (c.durationSeconds ?? 0),
      0,
    );
    const avgDurationSeconds = callsWithDuration.length > 0
      ? Math.round(totalDurationSeconds / callsWithDuration.length)
      : (dashboard?.metrics.averageDurationSeconds ?? 0);

    const avgMinutes = Math.floor(avgDurationSeconds / 60);
    const avgSecs = avgDurationSeconds % 60;
    const formattedDuration = `${avgMinutes}m ${String(avgSecs).padStart(2, "0")}s`;

    return {
      totalVolume: totalCalls,
      conversionRate: `${conversionRate}%`,
      avgLatency: "120ms",
      avgDuration: formattedDuration,
      activeChannels: activeCalls.length,
    };
  }, [uniqueCalls, dashboard, activeCalls]);

  // 3. Calls Per Day (Strictly 14 unique calendar days)
  const callsPerDayData = useMemo(() => {
    const dayMap = new Map<string, number>();
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      dayMap.set(key, 0);
    }

    for (const call of uniqueCalls) {
      const timestamp = call.startTimestamp ?? call.endTimestamp;
      if (timestamp) {
        const key = new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
        if (dayMap.has(key)) {
          dayMap.set(key, (dayMap.get(key) ?? 0) + 1);
        }
      }
    }

    return Array.from(dayMap.entries()).map(([date, calls]) => ({
      date,
      calls,
    }));
  }, [uniqueCalls]);

  // 4. Calls Per Language (Strictly unique language names with no duplicate keys)
  const callsPerLangData = useMemo(() => {
    const langMap = new Map<string, number>();

    for (const call of uniqueCalls) {
      const mappedAgent = agents.find(
        (a) => a.retellAgentId === call.agentId || a.id === call.agentId || a.name === call.agentName,
      );
      const lang = mappedAgent?.languages?.[0] ?? "English";
      langMap.set(lang, (langMap.get(lang) ?? 0) + 1);
    }

    if (langMap.size === 0) {
      for (const agent of agents) {
        for (const lang of agent.languages ?? ["English"]) {
          langMap.set(lang, (langMap.get(lang) ?? 0) + 1);
        }
      }
    }

    if (langMap.size === 0) {
      langMap.set("English", 1);
    }

    return Array.from(langMap.entries()).map(([name, value], index) => ({
      name,
      value,
      color: COLOR_PALETTE[index % COLOR_PALETTE.length],
    }));
  }, [uniqueCalls, agents]);

  // 5. Peak Calling Hours (Strictly 12 unique 2-hour buckets)
  const peakHoursData = useMemo(() => {
    const hourMap = new Map<string, number>();
    for (let h = 0; h < 24; h += 2) {
      hourMap.set(`${h}:00`, 0);
    }

    for (const call of uniqueCalls) {
      const timestamp = call.startTimestamp ?? call.endTimestamp;
      if (timestamp) {
        const hour = new Date(timestamp).getHours();
        const bucket = `${Math.floor(hour / 2) * 2}:00`;
        if (hourMap.has(bucket)) {
          hourMap.set(bucket, (hourMap.get(bucket) ?? 0) + 1);
        }
      }
    }

    return Array.from(hourMap.entries()).map(([hour, load]) => ({
      hour,
      load,
    }));
  }, [uniqueCalls]);

  // 6. Average Duration Trend (Strictly 5 unique week buckets)
  const avgDurationData = useMemo(() => {
    const weeksMap = new Map<string, { totalSeconds: number; count: number }>();
    for (let w = 4; w >= 0; w--) {
      weeksMap.set(`Week ${5 - w}`, { totalSeconds: 0, count: 0 });
    }

    const msPerWeek = 7 * 24 * 60 * 60 * 1000;

    for (const call of uniqueCalls) {
      const timestamp = call.startTimestamp ?? call.endTimestamp;
      if (timestamp && typeof call.durationSeconds === "number" && call.durationSeconds > 0) {
        const diffWeeks = Math.floor((now - timestamp) / msPerWeek);
        if (diffWeeks >= 0 && diffWeeks < 5) {
          const weekKey = `Week ${5 - diffWeeks}`;
          const existing = weeksMap.get(weekKey);
          if (existing) {
            existing.totalSeconds += call.durationSeconds;
            existing.count += 1;
          }
        }
      }
    }

    return Array.from(weeksMap.entries()).map(([week, stats]) => ({
      week,
      minutes: stats.count > 0 ? Number((stats.totalSeconds / stats.count / 60).toFixed(2)) : 0,
    }));
  }, [uniqueCalls, now]);

  // 7. Missed / Failed Calls Trend (Strictly 5 unique week buckets)
  const missedCallsData = useMemo(() => {
    const weeksMap = new Map<string, { total: number; failed: number }>();
    for (let w = 4; w >= 0; w--) {
      weeksMap.set(`Week ${5 - w}`, { total: 0, failed: 0 });
    }

    const msPerWeek = 7 * 24 * 60 * 60 * 1000;

    for (const call of uniqueCalls) {
      const timestamp = call.startTimestamp ?? call.endTimestamp;
      if (timestamp) {
        const diffWeeks = Math.floor((now - timestamp) / msPerWeek);
        if (diffWeeks >= 0 && diffWeeks < 5) {
          const weekKey = `Week ${5 - diffWeeks}`;
          const existing = weeksMap.get(weekKey);
          if (existing) {
            existing.total += 1;
            if (call.status === "failed") {
              existing.failed += 1;
            }
          }
        }
      }
    }

    return Array.from(weeksMap.entries()).map(([week, stats]) => ({
      week,
      rate: stats.total > 0 ? Number(((stats.failed / stats.total) * 100).toFixed(1)) : 0,
    }));
  }, [uniqueCalls, now]);

  // 8. Agent Performance (Strictly unique agent names)
  const agentPerformanceData = useMemo(() => {
    const agentMap = new Map<string, { total: number; completed: number }>();

    for (const call of uniqueCalls) {
      const name = call.agentName || "Agent";
      const existing = agentMap.get(name) ?? { total: 0, completed: 0 };
      existing.total += 1;
      if (call.status === "completed") {
        existing.completed += 1;
      }
      agentMap.set(name, existing);
    }

    for (const agent of agents) {
      if (!agentMap.has(agent.name)) {
        agentMap.set(agent.name, {
          total: agent.callsToday ?? 0,
          completed: agent.callsToday ?? 0,
        });
      }
    }

    if (agentMap.size === 0) {
      agentMap.set("Default Agent", { total: 0, completed: 0 });
    }

    return Array.from(agentMap.entries()).map(([name, stats]) => ({
      name,
      "Success Rate (%)": stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 100,
      "Total Calls": stats.total,
    }));
  }, [uniqueCalls, agents]);

  // Custom Tooltip with strict deduplication of entries by metric name
  const renderTooltip = (props: TooltipContentProps) => {
    const { active, payload } = props;
    if (active && payload && payload.length) {
      const uniquePayload = Array.from(
        new Map(payload.map((item) => [item.name, item])).values(),
      );

      return (
        <div
          style={{
            backgroundColor: "#111422",
            border: "1px solid rgba(255,255,255,0.08)",
            padding: "8px 12px",
            borderRadius: "6px",
            fontSize: "12px",
          }}
        >
          {uniquePayload.map((pld, index) => (
            <p key={`tip-${pld.name}-${index}`} style={{ margin: 0, color: pld.color || pld.fill }}>
              {pld.name}: <strong>{pld.value}</strong>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <section id="view-analytics" className="view-pane active-view">
      <div className="page-header">
        <div>
          <h1 className="page-title">Executive Analytics</h1>
          <p className="page-subtitle">
            Real-time business intelligence regarding call rates, language distribution, peak load and success metrics.
          </p>
        </div>
        <button
          className="secondary-btn btn-sm"
          disabled={loading}
          onClick={() => void fetchCalls()}
          style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          {loading ? "Refreshing..." : "Refresh Analytics"}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Stats Grid */}
      <div className="analytics-kpis-grid">
        <div className="kpi-box">
          <span className="kpi-label">Total Volume</span>
          <h3 className="kpi-value">
            {kpis.totalVolume.toLocaleString()}
          </h3>
        </div>
        <div className="kpi-box">
          <span className="kpi-label">Success Rate</span>
          <h3 className="kpi-value text-green">
            {kpis.conversionRate}
          </h3>
        </div>
        <div className="kpi-box">
          <span className="kpi-label">Active Channels</span>
          <h3 className="kpi-value text-violet">
            {kpis.activeChannels}
          </h3>
        </div>
        <div className="kpi-box">
          <span className="kpi-label">Avg Call Duration</span>
          <h3 className="kpi-value">
            {kpis.avgDuration}
          </h3>
        </div>
      </div>

      {/* Main Grid Charts */}
      <div className="analytics-charts-grid mt-6">
        {/* Chart 1: Calls Per Day */}
        <div className="panel-card chart-card">
          <div className="panel-header">
            <h3 className="panel-title">Calls Per Day (Last 14 Days)</h3>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={callsPerDayData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="callsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="date" tickLine={false} tick={{ fill: textFill, fontSize: 10 }} />
                <YAxis tickLine={false} tick={{ fill: textFill, fontSize: 10 }} />
                <Tooltip content={renderTooltip} />
                <Area
                  type="monotone"
                  dataKey="calls"
                  name="Calls Handled"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#callsGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Calls Per Language */}
        <div className="panel-card chart-card">
          <div className="panel-header">
            <h3 className="panel-title">Calls Per Language</h3>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={callsPerLangData}
                  cx="50%"
                  cy="50%"
                  innerRadius="60%"
                  outerRadius="85%"
                  dataKey="value"
                  paddingAngle={3}
                >
                  {callsPerLangData.map((entry, index) => (
                    <Cell key={`cell-${entry.name}-${index}`} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip content={renderTooltip} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: "11px", color: "#a1a1aa" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3: Peak Calling Hours */}
        <div className="panel-card chart-card col-span-2">
          <div className="panel-header">
            <h3 className="panel-title">Peak Calling Hours (24h Distribution)</h3>
          </div>
          <div className="chart-container-large">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={peakHoursData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="hour" tickLine={false} tick={{ fill: textFill, fontSize: 10 }} />
                <YAxis tickLine={false} tick={{ fill: textFill, fontSize: 10 }} />
                <Tooltip content={renderTooltip} />
                <Bar dataKey="load" name="Call Volume" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 4: Average Duration Trend */}
        <div className="panel-card chart-card">
          <div className="panel-header">
            <h3 className="panel-title">Average Call Duration Trend</h3>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={avgDurationData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="durationGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="week" tickLine={false} tick={{ fill: textFill, fontSize: 10 }} />
                <YAxis tickLine={false} tick={{ fill: textFill, fontSize: 10 }} />
                <Tooltip content={renderTooltip} />
                <Area
                  type="monotone"
                  dataKey="minutes"
                  name="Avg Duration (Minutes)"
                  stroke="#10b981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#durationGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 5: Missed Calls Trend */}
        <div className="panel-card chart-card">
          <div className="panel-header">
            <h3 className="panel-title">Failed / Missed Calls Trend</h3>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={missedCallsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="week" tickLine={false} tick={{ fill: textFill, fontSize: 10 }} />
                <YAxis tickLine={false} tick={{ fill: textFill, fontSize: 10 }} />
                <Tooltip content={renderTooltip} />
                <Line
                  type="monotone"
                  dataKey="rate"
                  name="Failure Rate (%)"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 6: Agent Performance */}
        <div className="panel-card chart-card col-span-2">
          <div className="panel-header">
            <h3 className="panel-title">Agent Performance &amp; Activity</h3>
          </div>
          <div className="chart-container-large">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={agentPerformanceData}
                layout="vertical"
                margin={{ top: 10, right: 20, left: 40, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                <XAxis type="number" tickLine={false} tick={{ fill: textFill, fontSize: 10 }} />
                <YAxis dataKey="name" type="category" tickLine={false} tick={{ fill: textFill, fontSize: 11 }} />
                <Tooltip content={renderTooltip} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: "11px" }} />
                <Bar dataKey="Success Rate (%)" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                <Bar dataKey="Total Calls" fill="#06b6d4" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </section>
  );
};
