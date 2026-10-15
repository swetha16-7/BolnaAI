"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useAppState } from "@/context/StateContext";
import {
  LayoutDashboard,
  Bot,
  PlusCircle,
  PhoneCall,
  History,
  BarChart3,
  Settings as SettingsIcon,
  Layers,
  Users,
  User,
  LogOut,
  Bell,
  AlertTriangle,
  Info,
  CheckCircle,
  XCircle,
} from "lucide-react";

// Views
import { DashboardView } from "@/components/views/dashboard-view";
import { AgentsView } from "@/components/views/agents-view";
import { AgentBuilderView } from "@/components/views/agent-builder-view";
import { LiveCallsView } from "@/components/views/live-calls-view";
import { CallHistoryView } from "@/components/views/call-history-view";
import { CrmView } from "@/components/views/crm-view";
import { AnalyticsView } from "@/components/views/analytics-view";
import { SettingsView } from "@/components/views/settings-view";
import { ProfileView } from "@/components/views/profile-view";
import TeamPage from "@/app/(admin)/team/page";
import BillingPage from "@/app/(admin)/billing/page";
import { AuthView } from "@/components/auth/auth-view";

type RouteProps = { editId?: string | null };
const routeConfig: Record<string, { breadcrumb: string; component: React.ComponentType<RouteProps> }> = {
  "dashboard": { breadcrumb: "Dashboard", component: DashboardView },
  "agents": { breadcrumb: "AI Agents", component: AgentsView },
  "agent-builder": { breadcrumb: "Agent Builder", component: AgentBuilderView },
  "live-calls": { breadcrumb: "Live Calls", component: LiveCallsView },
  "crm": { breadcrumb: "CRM", component: CrmView },
  "call-history": { breadcrumb: "Call History", component: CallHistoryView },
  "teams": { breadcrumb: "Teams", component: TeamPage },
  "analytics": { breadcrumb: "Analytics", component: AnalyticsView },
  "settings": { breadcrumb: "Settings & Integrations", component: SettingsView },
  "billing": { breadcrumb: "Billing", component: BillingPage },
  "profile": { breadcrumb: "Admin Profile", component: ProfileView }
};

export default function Home() {
  const {
    activeCalls,
    notifications,
    profile,
    authStatus,
    authError,
    checkSession,
    logout,
    markAllNotificationsRead,
    toasts,
    removeToast
  } = useAppState();

  const [activeRoute, setActiveRoute] = useState("dashboard");
  const [queryParams, setQueryParams] = useState<Record<string, string>>({});
  const [clockTime, setClockTime] = useState("");
  const [isNotifDropdownOpen, setIsNotifDropdownOpen] = useState(false);

  const notifDropdownRef = useRef<HTMLDivElement>(null);

  // Hash-based routing listener
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.substring(2); // Remove '#/'
      if (!hash) {
        window.location.hash = "#/dashboard";
        return;
      }

      let routeName = hash;
      const params: Record<string, string> = {};
      if (hash.includes("?")) {
        routeName = hash.split("?")[0];
        const queryStr = hash.split("?")[1];
        const pairs = queryStr.split("&");
        pairs.forEach(p => {
          const parts = p.split("=");
          params[parts[0]] = parts[1] || "";
        });
      }

      if (routeConfig[routeName]) {
        setActiveRoute(routeName);
        setQueryParams(params);
      } else {
        window.location.hash = "#/dashboard";
      }
      setIsNotifDropdownOpen(false);
    };

    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  // Clock updating loop
  useEffect(() => {
    const updateClock = () => {
      const d = new Date();
      setClockTime(
        d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Close notifications dropdown if clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (notifDropdownRef.current && !notifDropdownRef.current.contains(e.target as Node)) {
        setIsNotifDropdownOpen(false);
      }
    };
    document.addEventListener("click", handleOutsideClick);
    return () => document.removeEventListener("click", handleOutsideClick);
  }, []);

  const unreadNotifsCount = useMemo(() => {
    return notifications.filter(n => !n.read).length;
  }, [notifications]);

  const currentView = useMemo(() => {
    const viewObj = routeConfig[activeRoute];
    if (viewObj) {
      const Component = viewObj.component as React.ComponentType<RouteProps>;
      if (activeRoute === "agent-builder") {
        return <Component editId={queryParams.edit || null} />;
      }
      return <Component />;
    }
    return <DashboardView />;
  }, [activeRoute, queryParams]);

  const navigateToRoute = (routeName: string) => {
    if (!routeConfig[routeName]) return;
    setActiveRoute(routeName);
    setQueryParams({});
    setIsNotifDropdownOpen(false);
    window.location.hash = `#/${routeName}`;
  };

  const handleToggleNotifDropdown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsNotifDropdownOpen(prev => !prev);
  };

  if (authStatus === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
        Verifying session...
      </main>
    );
  }

  if (authStatus === "error") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 px-4 text-center text-slate-200">
        <p role="alert">{authError ?? "Unable to verify your session."}</p>
        <button className="primary-btn" onClick={() => void checkSession()}>Try again</button>
      </main>
    );
  }

  if (authStatus === "unauthenticated") {
    return <AuthView />;
  }

  return (
    <div className="app-shell">
      {/* Toast Notification Overlay */}
      <div id="toast-container" className="toast-container">
        {toasts.map(t => {
          let Icon = CheckCircle;
          if (t.type === "error") Icon = XCircle;
          if (t.type === "info") Icon = Info;
          return (
            <div key={t.id} className={`toast toast-${t.type}`} onClick={() => removeToast(t.id)}>
              <Icon size={16} />
              <span>{t.message}</span>
            </div>
          );
        })}
      </div>

      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo-wrapper">
            <div className="logo-orb"></div>
            <div className="logo-wave">
              <span></span>
              <span></span>
              <span></span>
              <span></span>
            </div>
            <span className="logo-text">
              BolnaAI
            </span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <ul>
            <li>
              <a
                href="#/dashboard"
                className={`nav-item ${activeRoute === "dashboard" ? "active" : ""}`}
                data-page="dashboard"
              >
                <LayoutDashboard size={18} />
                <span>Dashboard</span>
              </a>
            </li>
            <li>
              <a
                href="#/agents"
                className={`nav-item ${
                  activeRoute === "agents" || activeRoute === "agent-builder" ? "active" : ""
                }`}
                data-page="agents"
              >
                <Bot size={18} />
                <span>AI Agents</span>
              </a>
              {/* Sub Navigation for Agent Builder */}
              <ul className="sub-nav">
                <li>
                  <a
                    href="#/agent-builder"
                    className={`sub-nav-item ${
                      activeRoute === "agent-builder" && !queryParams.edit ? "active" : ""
                    }`}
                    data-page="agent-builder"
                  >
                    <PlusCircle size={14} />
                    <span>Agent Builder</span>
                  </a>
                </li>
              </ul>
            </li>
            <li>
              <a
                href="#/live-calls"
                className={`nav-item ${activeRoute === "live-calls" ? "active" : ""}`}
                data-page="live-calls"
              >
                <PhoneCall
                  size={18}
                  className={activeRoute === "live-calls" && activeCalls.length > 0 ? "icon-live" : ""}
                />
                <span>Live Calls</span>
                {activeCalls.length > 0 && (
                  <span className="badge badge-live" id="live-calls-badge">
                    {activeCalls.length}
                  </span>
                )}
              </a>
            </li>
            <li>
              <a
                href="#/call-history"
                className={`nav-item ${activeRoute === "call-history" ? "active" : ""}`}
                data-page="call-history"
              >
                <History size={18} />
                <span>Call History</span>
              </a>
            </li>
            <li>
              <a
                href="#/crm"
                className={`nav-item ${activeRoute === "crm" ? "active" : ""}`}
                data-page="crm"
              >
                <Layers size={18} />
                <span>CRM</span>
              </a>
            </li>
            <li>
              <a
                href="#/teams"
                className={`nav-item ${activeRoute === "teams" ? "active" : ""}`}
                data-page="teams"
              >
                <Users size={18} />
                <span>Teams</span>
              </a>
            </li>
            <li>
              <a
                href="#/analytics"
                className={`nav-item ${activeRoute === "analytics" ? "active" : ""}`}
                data-page="analytics"
              >
                <BarChart3 size={18} />
                <span>Analytics</span>
              </a>
            </li>
            <li>
              <a
                href="#/settings"
                className={`nav-item ${activeRoute === "settings" ? "active" : ""}`}
                data-page="settings"
              >
                <SettingsIcon size={18} />
                <span>Settings</span>
              </a>
            </li>
            <li>
              <a
                href="#/billing"
                onClick={(e) => {
                  e.preventDefault();
                  navigateToRoute("billing");
                }}
                className={`nav-item ${activeRoute === "billing" ? "active" : ""}`}
                data-page="billing"
              >
                <Layers size={18} />
                <span>Billing</span>
              </a>
            </li>
            <li>
              <a
                href="#/profile"
                className={`nav-item ${activeRoute === "profile" ? "active" : ""}`}
                data-page="profile"
              >
                <User size={18} />
                <span>Profile</span>
              </a>
            </li>
          </ul>
        </nav>

        {/* Sidebar Footer User Card */}
        <div className="sidebar-footer">
          <div className="user-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=100&auto=format&fit=crop&q=80"
              alt="Admin Avatar"
              className="user-avatar"
              id="sidebar-avatar"
            />
            <div className="user-info">
              <span className="user-name" id="sidebar-username">
                {profile.username || profile.email}
              </span>
              <span className="user-role">{profile.role}</span>
            </div>
            <button className="logout-btn" title="Sign Out" onClick={() => void logout()}>
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {/* Top Header Navigation Bar */}
        <header className="topbar">
          <div className="header-breadcrumb">
            <span className="breadcrumb-root">Console</span>
            <span className="breadcrumb-separator">/</span>
            <span className="breadcrumb-active" id="active-breadcrumb">
              {routeConfig[activeRoute]?.breadcrumb || "Dashboard"}
            </span>
          </div>

          <div className="topbar-actions">
            {/* System Health Indicator */}
            <div className="system-status-indicator">
              <span className="status-pulse pulse-green"></span>
              <span className="status-text">All Systems Operational</span>
            </div>

            {/* Notification Dropdown */}
            <div className="notification-wrapper" ref={notifDropdownRef}>
              <button className="topbar-btn" id="notification-trigger" onClick={handleToggleNotifDropdown}>
                <Bell size={18} />
                {unreadNotifsCount > 0 && (
                  <span className="btn-badge" id="notification-count">
                    {unreadNotifsCount}
                  </span>
                )}
              </button>
              <div className={`dropdown-panel ${isNotifDropdownOpen ? "active" : ""}`} id="notification-dropdown">
                <div className="dropdown-header">
                  <h3>Notifications</h3>
                  <button className="text-btn" id="mark-all-read" onClick={markAllNotificationsRead}>
                    Mark all read
                  </button>
                </div>
                <ul className="notification-list" id="notification-list">
                  {notifications.length === 0 ? (
                    <li className="notification-empty">No notifications</li>
                  ) : (
                    notifications.map(n => {
                      let Icon = Bell;
                      if (n.type === "warning") Icon = AlertTriangle;
                      if (n.type === "info") Icon = Info;
                      return (
                        <li className={`notification-item ${n.read ? "read" : ""}`} key={n.id}>
                          <div className={`notif-icon ${n.type}`}>
                            <Icon size={14} />
                          </div>
                          <div className="notif-content">
                            <p className="notif-msg">{n.message}</p>
                            <span className="notif-time">{n.time}</span>
                          </div>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>
            </div>

            {/* Global Clock */}
            <div className="global-clock" id="global-clock">
              {clockTime}
            </div>
          </div>
        </header>

        {/* Page Views Container */}
        <div className="page-viewport">{currentView}</div>
      </main>
    </div>
  );
}
