"use client";

import React from "react";
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

export const AnalyticsView: React.FC = () => {
  // Chart 1 Data: Calls Per Day (14 Days)
  const callsPerDayData = [
    { date: "June 10", calls: 420 },
    { date: "June 11", calls: 510 },
    { date: "June 12", calls: 480 },
    { date: "June 13", calls: 590 },
    { date: "June 14", calls: 620 },
    { date: "June 15", calls: 580 },
    { date: "June 16", calls: 640 },
    { date: "June 17", calls: 710 },
    { date: "June 18", calls: 830 },
    { date: "June 19", calls: 790 },
    { date: "June 20", calls: 690 },
    { date: "June 21", calls: 730 },
    { date: "June 22", calls: 810 },
    { date: "June 23", calls: 842 },
  ];

  // Chart 2 Data: Calls Per Language
  const callsPerLangData = [
    { name: "English", value: 2400, color: "#8b5cf6" },
    { name: "Spanish", value: 1850, color: "#10b981" },
    { name: "Hindi", value: 920, color: "#3b82f6" },
    { name: "Telugu", value: 724, color: "#f97316" },
  ];

  // Chart 3 Data: Peak Calling Hours (24h Distribution)
  const peakHoursData = [
    { hour: "0:00", load: 45 },
    { hour: "2:00", load: 20 },
    { hour: "4:00", load: 15 },
    { hour: "6:00", load: 30 },
    { hour: "8:00", load: 95 },
    { hour: "10:00", load: 240 },
    { hour: "12:00", load: 310 },
    { hour: "14:00", load: 280 },
    { hour: "16:00", load: 190 },
    { hour: "18:00", load: 340 },
    { hour: "20:00", load: 110 },
    { hour: "22:00", load: 60 },
  ];

  // Chart 4 Data: Average Duration Trend
  const avgDurationData = [
    { week: "Week 1", minutes: 3.1 },
    { week: "Week 2", minutes: 2.9 },
    { week: "Week 3", minutes: 2.8 },
    { week: "Week 4", minutes: 2.7 },
    { week: "Week 5", minutes: 2.65 },
  ];

  // Chart 5 Data: Missed Calls Trend
  const missedCallsData = [
    { week: "Week 1", rate: 4.5 },
    { week: "Week 2", rate: 3.8 },
    { week: "Week 3", rate: 3.1 },
    { week: "Week 4", rate: 2.8 },
    { week: "Week 5", rate: 2.1 },
  ];

  // Chart 6 Data: Agent Performance & Conversion
  const agentPerformanceData = [
    {
      name: "Sarah (Receptionist)",
      "Conversion Success (%)": 88,
      "Average Sentiment (%)": 82,
    },
    {
      name: "Vikram (Support)",
      "Conversion Success (%)": 79,
      "Average Sentiment (%)": 75,
    },
    {
      name: "Elena (Sales)",
      "Conversion Success (%)": 64,
      "Average Sentiment (%)": 59,
    },
  ];

  const gridColor = "rgba(255,255,255,0.05)";
  const textFill = "#71717a";

  const renderTooltip = (props: TooltipContentProps) => {
    const payload = props.payload;
    const { active } = props;

    if (active && payload.length) {
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
          {payload.map((pld, index) => (
            <p key={index} style={{ margin: 0, color: pld.color || pld.fill }}>
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
            Deep business intelligence regarding call rates, language distribution, peak load and success metrics.
          </p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="analytics-kpis-grid">
        <div className="kpi-box">
          <span className="kpi-label">Weekly Volume</span>
          <h3 className="kpi-value">
            5,894 <span className="text-xs text-green">+4.1%</span>
          </h3>
        </div>
        <div className="kpi-box">
          <span className="kpi-label">Conversion Rate</span>
          <h3 className="kpi-value">
            72.4% <span className="text-xs text-green">+1.8%</span>
          </h3>
        </div>
        <div className="kpi-box">
          <span className="kpi-label">Avg Hold / Latency</span>
          <h3 className="kpi-value">
            120ms <span className="text-xs text-green">-15ms</span>
          </h3>
        </div>
        <div className="kpi-box">
          <span className="kpi-label">Avg Call Duration</span>
          <h3 className="kpi-value">
            2m 45s <span className="text-xs text-muted">Stable</span>
          </h3>
        </div>
      </div>

      {/* Main Grid Charts */}
      <div className="analytics-charts-grid mt-6">
        {/* Chart 1: Calls Per Day */}
        <div className="panel-card chart-card">
          <div className="panel-header">
            <h3 className="panel-title">Calls Per Day (14 Days)</h3>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={callsPerDayData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="callsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2} />
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
                  name="Calls Completed"
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
                  paddingAngle={2}
                >
                  {callsPerLangData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
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
                <Bar dataKey="load" name="Inbound Load (Calls/Hr)" fill="#06b6d4" radius={[4, 4, 0, 0]} />
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
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
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
                  name="Avg Minutes"
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
            <h3 className="panel-title">Missed Calls Trend</h3>
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
                  name="Missed Calls Rate (%)"
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
            <h3 className="panel-title">Agent Call Success Rate & Conversion (%)</h3>
          </div>
          <div className="chart-container-large">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={agentPerformanceData}
                layout="vertical"
                margin={{ top: 10, right: 10, left: 40, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                <XAxis type="number" tickLine={false} tick={{ fill: textFill, fontSize: 10 }} />
                <YAxis dataKey="name" type="category" tickLine={false} tick={{ fill: textFill, fontSize: 9 }} />
                <Tooltip content={renderTooltip} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: "11px" }} />
                <Bar dataKey="Conversion Success (%)" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                <Bar dataKey="Average Customer Sentiment (%)" fill="#06b6d4" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </section>
  );
};
