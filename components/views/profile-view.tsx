"use client";

import React, { useState, useRef } from "react";
import { useAppState } from "@/context/StateContext";
import { Check, Upload } from "lucide-react";
import { formatDateTime } from "@/lib/utils";

export const ProfileView: React.FC = () => {
  const { profile, saveProfile, activityLogs, changePassword, showToast } = useAppState();

  // Form states
  const [username, setUsername] = useState(profile.username);
  const [email, setEmail] = useState(profile.email);
  const [mfa, setMfa] = useState(profile.mfa);

  // Password fields
  const [passCurr, setPassCurr] = useState("");
  const [passNew, setPassNew] = useState("");
  const [passConfirm, setPassConfirm] = useState("");

  // Notification preferences mock checkboxes
  const [prefSms, setPrefSms] = useState(true);
  const [prefDaily, setPrefDaily] = useState(true);
  const [prefSlack, setPrefSlack] = useState(true);

  // Avatar states
  const [avatarSrc, setAvatarSrc] = useState(
    "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200&auto=format&fit=crop&q=80"
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveProfile = () => {
    if (!username.trim() || !email.trim()) {
      showToast("Fields name and email cannot be empty", "error");
      return;
    }
    saveProfile({ username, email, mfa });
  };

  const handleUpdatePassword = () => {
    if (!passCurr || !passNew || !passConfirm) {
      showToast("Please fill all password fields", "error");
      return;
    }

    if (passNew !== passConfirm) {
      showToast("Passwords confirm matching validation failed", "error");
      return;
    }

    // Reset password fields
    setPassCurr("");
    setPassNew("");
    setPassConfirm("");

    changePassword();
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const url = event.target.result as string;
          setAvatarSrc(url);
          
          // Also try to update sidebar avatar via window listener or DOM directly
          const sidebarAvatar = document.getElementById("sidebar-avatar") as HTMLImageElement;
          if (sidebarAvatar) {
            sidebarAvatar.src = url;
          }
          const sidebarAvatarFooter = document.getElementById("sidebar-avatar-footer") as HTMLImageElement;
          if (sidebarAvatarFooter) {
            sidebarAvatarFooter.src = url;
          }

          showToast("Profile avatar uploaded", "success");
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <section id="view-profile" className="view-pane active-view">
      <div className="page-header">
        <div>
          <h1 className="page-title">Admin Profile</h1>
          <p className="page-subtitle">Configure administrator settings, password controls, security rules, and audit user logs.</p>
        </div>
        <div className="header-controls">
          <button className="primary-btn" onClick={handleSaveProfile}>
            <Check size={16} /> Save Profile Details
          </button>
        </div>
      </div>

      <div className="profile-grid">
        {/* Left Side profile card & preferences */}
        <div className="flex-column gap-6">
          {/* Card 1: Details */}
          <div className="panel-card">
            <h3 className="panel-title mb-4">Account Profile</h3>
            <div className="avatar-edit-box">
              <img src={avatarSrc} alt="Admin Large" className="avatar-large" id="profile-avatar-large" />
              <div>
                <button
                  className="secondary-btn btn-sm mb-1"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={12} style={{ marginRight: "3px" }} /> Upload Image
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={handleAvatarChange}
                />
                <p className="text-xs text-muted">Supports PNG, JPG, or GIF up to 2MB.</p>
              </div>
            </div>

            <div className="form-grid mt-4">
              <div className="form-group">
                <label className="form-label" htmlFor="prof-name">
                  Full Name
                </label>
                <input
                  type="text"
                  className="form-input"
                  id="prof-name"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="prof-email">
                  Email Address
                </label>
                <input
                  type="email"
                  className="form-input"
                  id="prof-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="prof-role">
                  Organizational Role
                </label>
                <input
                  type="text"
                  className="form-input"
                  id="prof-role"
                  value={profile.role}
                  readOnly
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="prof-mfa">
                  Two-Factor Authentication (2FA)
                </label>
                <select
                  className="form-input"
                  id="prof-mfa"
                  value={mfa}
                  onChange={(e) => setMfa(e.target.value)}
                >
                  <option value="enabled">Authenticator App (Enabled)</option>
                  <option value="disabled">Disabled (Not Recommended)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Card 2: Security & Password */}
          <div className="panel-card">
            <h3 className="panel-title mb-4">Change Password</h3>
            <div className="form-grid">
              <div className="form-group col-span-2">
                <label className="form-label" htmlFor="pass-curr">
                  Current Password
                </label>
                <input
                  type="password"
                  className="form-input"
                  id="pass-curr"
                  placeholder="••••••••"
                  value={passCurr}
                  onChange={(e) => setPassCurr(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="pass-new">
                  New Password
                </label>
                <input
                  type="password"
                  className="form-input"
                  id="pass-new"
                  placeholder="••••••••"
                  value={passNew}
                  onChange={(e) => setPassNew(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="pass-confirm">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  className="form-input"
                  id="pass-confirm"
                  placeholder="••••••••"
                  value={passConfirm}
                  onChange={(e) => setPassConfirm(e.target.value)}
                />
              </div>
            </div>
            <button className="secondary-btn btn-sm mt-3" onClick={handleUpdatePassword}>
              Update Password
            </button>
          </div>

          {/* Card 3: Notifications Preferences */}
          <div className="panel-card">
            <h3 className="panel-title mb-4">Notification Preferences</h3>
            <div className="preferences-list">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={prefSms}
                  onChange={(e) => setPrefSms(e.target.checked)}
                />
                <div className="checkbox-label-group">
                  <span className="pref-title">Critical SMS Alerts</span>
                  <span className="pref-desc">
                    Receive immediate text notices for high-risk sentiment phone spikes or system service down.
                  </span>
                </div>
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={prefDaily}
                  onChange={(e) => setPrefDaily(e.target.checked)}
                />
                <div className="checkbox-label-group">
                  <span className="pref-title">Daily Summary Emails</span>
                  <span className="pref-desc">
                    A detailed daily PDF digest detailing call count, active agent performance charts, and cost totals.
                  </span>
                </div>
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={prefSlack}
                  onChange={(e) => setPrefSlack(e.target.checked)}
                />
                <div className="checkbox-label-group">
                  <span className="pref-title">Slack Pipeline Webhook Notifications</span>
                  <span className="pref-desc">Sync call center alert triggers to your engineering Slack channel.</span>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Right Side Audit Trail & Activity Logs */}
        <div className="panel-card flex-grow h-fit">
          <h3 className="panel-title mb-4">Security Access & Activity Log</h3>
          <p className="panel-subtitle mb-4">Audit history of profile activity, API token deployments, and telephony adjustments.</p>

          <div className="activity-timeline">
            {activityLogs.map((log, index) => {
              const formattedDate = formatDateTime(log.time);
              return (
                <div className={`activity-item ${index === 0 ? "active-dot" : ""}`} key={index}>
                  <span className="activity-dot"></span>
                  <span className="activity-desc">{log.text}</span>
                  <span className="activity-time">{formattedDate}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
