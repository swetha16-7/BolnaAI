export const kpiStats = [
  {
    label: "Total Calls Today",
    value: "1,284",
    change: "+12.5%",
    trend: "up" as const,
    metric: "calls" as const,
  },
  {
    label: "Active Agents",
    value: "8",
    change: "+2",
    trend: "up" as const,
    metric: "agents" as const,
  },
  {
    label: "Avg Call Duration",
    value: "4m 32s",
    change: "-8%",
    trend: "down" as const,
    metric: "duration" as const,
  },
  {
    label: "Conversion Rate",
    value: "34.2%",
    change: "+5.1%",
    trend: "up" as const,
    metric: "conversion" as const,
  },
  {
    label: "Revenue Today",
    value: "$12,450",
    change: "+18%",
    trend: "up" as const,
    metric: "revenue" as const,
  },
  {
    label: "Customer Satisfaction",
    value: "4.8/5",
    change: "+0.2",
    trend: "up" as const,
    metric: "satisfaction" as const,
  },
];

export const callStatsData = [
  { name: "Mon", inbound: 120, outbound: 80, missed: 12 },
  { name: "Tue", inbound: 145, outbound: 95, missed: 8 },
  { name: "Wed", inbound: 132, outbound: 110, missed: 15 },
  { name: "Thu", inbound: 168, outbound: 88, missed: 10 },
  { name: "Fri", inbound: 190, outbound: 120, missed: 6 },
  { name: "Sat", inbound: 95, outbound: 60, missed: 18 },
  { name: "Sun", inbound: 78, outbound: 45, missed: 22 },
];

export const languageData = [
  { name: "English", value: 45, color: "#6366f1" },
  { name: "Spanish", value: 22, color: "#8b5cf6" },
  { name: "Hindi", value: 18, color: "#a855f7" },
  { name: "French", value: 10, color: "#c084fc" },
  { name: "Other", value: 5, color: "#ef4444" },
];

export const revenueData = [
  { month: "Jan", revenue: 42000, calls: 8200 },
  { month: "Feb", revenue: 48000, calls: 9100 },
  { month: "Mar", revenue: 52000, calls: 9800 },
  { month: "Apr", revenue: 61000, calls: 11200 },
  { month: "May", revenue: 58000, calls: 10500 },
  { month: "Jun", revenue: 72000, calls: 12800 },
];

export const activeAgents = [
  { id: "1", name: "Sales Assistant", status: "active", calls: 42, language: "EN/ES", uptime: "99.2%" },
  { id: "2", name: "Support Agent", status: "active", calls: 38, language: "EN/HI", uptime: "98.8%" },
  { id: "3", name: "Booking Agent", status: "busy", calls: 15, language: "EN/FR", uptime: "97.5%" },
  { id: "4", name: "Lead Qualifier", status: "active", calls: 28, language: "EN", uptime: "99.9%" },
  { id: "5", name: "FAQ Bot", status: "idle", calls: 0, language: "Multi", uptime: "100%" },
];

export const recentCalls = [
  { id: "C-10234", caller: "+1 (555) 234-5678", agent: "Sales Assistant", duration: "5m 12s", outcome: "Converted", language: "English", time: "2 min ago" },
  { id: "C-10233", caller: "+1 (555) 876-5432", agent: "Support Agent", duration: "8m 45s", outcome: "Resolved", language: "Hindi", time: "8 min ago" },
  { id: "C-10232", caller: "+1 (555) 111-2222", agent: "Booking Agent", duration: "3m 20s", outcome: "Booked", language: "Spanish", time: "15 min ago" },
  { id: "C-10231", caller: "+1 (555) 333-4444", agent: "Lead Qualifier", duration: "2m 05s", outcome: "Qualified", language: "English", time: "22 min ago" },
  { id: "C-10230", caller: "+1 (555) 555-6666", agent: "Sales Assistant", duration: "6m 30s", outcome: "Follow-up", language: "French", time: "35 min ago" },
];

export const leads = [
  {
    id: "L-001",
    name: "John Smith",
    title: "CEO, Tech Corp",
    email: "john@techcorp.com",
    phone: "+1 (555) 123-4567",
    status: "Qualified",
    source: "Inbound Call",
    value: "$15,000",
    date: "2 hours ago",
  },
  {
    id: "L-002",
    name: "Sarah Johnson",
    title: "Manager, Startup Inc",
    email: "sarah@startup.io",
    phone: "+1 (555) 987-6543",
    status: "Contacted",
    source: "Website",
    value: "$8,500",
    date: "5 hours ago",
  },
  {
    id: "L-003",
    name: "Mike Wilson",
    title: "Director, Enterprise Co",
    email: "mike@enterprise.com",
    phone: "+1 (555) 456-7890",
    status: "New",
    source: "Referral",
    value: "$25,000",
    date: "1 day ago",
  },
  {
    id: "L-004",
    name: "Emily Brown",
    title: "Owner, Small Biz LLC",
    email: "emily@smallbiz.com",
    phone: "+1 (555) 321-0987",
    status: "Converted",
    source: "Inbound Call",
    value: "$5,000",
    date: "2 days ago",
  },
];

export const bookings = [
  {
    id: "B-001",
    customer: "John Smith",
    service: "Product Demo",
    date: "2026-06-25",
    time: "2:00 PM",
    agent: "Sales Assistant",
    status: "Confirmed",
  },
  {
    id: "B-002",
    customer: "Maria Garcia",
    service: "Consultation",
    date: "2026-06-26",
    time: "10:00 AM",
    agent: "Booking Agent",
    status: "Pending",
  },
  {
    id: "B-003",
    customer: "Sophie Martin",
    service: "Onboarding",
    date: "2026-06-27",
    time: "3:30 PM",
    agent: "Support Agent",
    status: "Confirmed",
  },
];

export const followUps = [
  {
    id: "F-001",
    customer: "Raj Patel",
    task: "Send pricing proposal",
    due: "2026-06-24",
    priority: "High",
    assigned: "Sales Team",
  },
  {
    id: "F-002",
    customer: "John Smith",
    task: "Demo follow-up call",
    due: "2026-06-25",
    priority: "Medium",
    assigned: "Sales Assistant",
  },
  {
    id: "F-003",
    customer: "Maria Garcia",
    task: "Contract review",
    due: "2026-06-26",
    priority: "Low",
    assigned: "Account Manager",
  },
];

export const crmKpiStats = [
  {
    label: "Total Leads",
    value: "1,251",
    change: "+15.3%",
    trend: "up" as const,
    metric: "crm" as const,
  },
  {
    label: "Appointments Booked",
    value: "384",
    change: "+6.7%",
    trend: "up" as const,
    metric: "crm" as const,
  },
  {
    label: "Pending Follow-Ups",
    value: "56",
    change: "0%",
    trend: "up" as const,
    metric: "crm" as const,
  },
  {
    label: "Pipeline Value",
    value: "$89,234",
    change: "+22.1%",
    trend: "up" as const,
    metric: "revenue" as const,
  },
];

export const customers = [
  {
    id: "C-001",
    name: "Acme Corp",
    email: "contact@acme.com",
    phone: "+1 555-123-4567",
    status: "Active",
    value: "$50,000",
    lastContact: "2026-06-23",
  },
  {
    id: "C-002",
    name: "Tech Innovations Ltd",
    email: "info@techinnovations.com",
    phone: "+1 555-234-5678",
    status: "Active",
    value: "$35,000",
    lastContact: "2026-06-22",
  },
  {
    id: "C-003",
    name: "Global Services Inc",
    email: "sales@globalservices.com",
    phone: "+1 555-345-6789",
    status: "Inactive",
    value: "$28,000",
    lastContact: "2026-06-15",
  },
];

export const teamMembers = [
  { id: "U-001", name: "Admin User", email: "admin@voicagent.ai", role: "Super Admin", status: "Active", lastLogin: "2026-06-23" },
  { id: "U-002", name: "Sarah Chen", email: "sarah@voicagent.ai", role: "Manager", status: "Active", lastLogin: "2026-06-22" },
  { id: "U-003", name: "Mike Johnson", email: "mike@voicagent.ai", role: "Operator", status: "Active", lastLogin: "2026-06-21" },
  { id: "U-004", name: "Lisa Park", email: "lisa@voicagent.ai", role: "Viewer", status: "Inactive", lastLogin: "2026-06-10" },
];

export const roles = [
  { name: "Super Admin", permissions: "Full access", users: 1 },
  { name: "Manager", permissions: "Manage agents, view analytics", users: 2 },
  { name: "Operator", permissions: "Monitor calls, manage CRM", users: 3 },
  { name: "Viewer", permissions: "Read-only access", users: 5 },
];

export const invoices = [
  { id: "INV-2026-06", date: "2026-06-01", amount: "$499.00", status: "Paid" },
  { id: "INV-2026-05", date: "2026-05-01", amount: "$499.00", status: "Paid" },
  { id: "INV-2026-04", date: "2026-04-01", amount: "$499.00", status: "Paid" },
  { id: "INV-2026-03", date: "2026-03-01", amount: "$399.00", status: "Paid" },
];

export const usageStats = [
  { label: "Call Minutes", used: 8420, limit: 10000, unit: "min" },
  { label: "API Requests", used: 125000, limit: 200000, unit: "req" },
  { label: "Storage", used: 4.2, limit: 10, unit: "GB" },
  { label: "Active Agents", used: 8, limit: 15, unit: "agents" },
];
