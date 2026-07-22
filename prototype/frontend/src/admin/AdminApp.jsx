import { useState } from "react";
import {
  ShieldHalf, LogOut, ParkingCircle, ClipboardList, Search, LayoutDashboard, Users, MapPinned, Settings, FileUp,
} from "lucide-react";
import "../styles.css";
import "./admin.css";

import { clearAuthToken } from "../api";
import AdminLogin from "./components/AdminLogin";
import ReviewQueue from "./components/ReviewQueue";
import CaseSearch from "./components/CaseSearch";
import StatsDashboard from "./components/StatsDashboard";
import AccountsManager from "./components/AccountsManager";
import LocationsManager from "./components/LocationsManager";
import ImportManager from "./components/ImportManager";
import SettingsPanel from "./components/SettingsPanel";

// Tabs are gated by the two design roles: 管理人員 (manager) handles
// review/search/stats; 系統管理員 (sysadmin) handles accounts/locations/settings.
const TABS = [
  { key: "queue", label: "複核佇列", icon: ClipboardList, roles: ["manager"] },
  { key: "search", label: "案件查詢", icon: Search, roles: ["manager"] },
  { key: "stats", label: "統計資料", icon: LayoutDashboard, roles: ["manager"] },
  { key: "accounts", label: "帳號管理", icon: Users, roles: ["sysadmin"] },
  { key: "locations", label: "路段管理", icon: MapPinned, roles: ["sysadmin"] },
  { key: "import", label: "資料匯入", icon: FileUp, roles: ["sysadmin"] },
  { key: "settings", label: "系統設定", icon: Settings, roles: ["sysadmin"] },
];

const ROLE_LABEL = { manager: "管理人員", sysadmin: "系統管理員" };

export default function AdminApp() {
  const [admin, setAdmin] = useState(null);
  const [tab, setTab] = useState(null);

  if (!admin) {
    return <AdminLogin onLoggedIn={setAdmin} />;
  }

  // Only the tabs this role may use; the backend enforces the same split, so
  // hidden tabs aren't just cosmetic - their APIs would 403 anyway.
  const visibleTabs = TABS.filter((t) => t.roles.includes(admin.role));
  const activeTab = visibleTabs.some((t) => t.key === tab) ? tab : visibleTabs[0]?.key;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-icon">
            <ShieldHalf size={20} />
          </span>
          <div>
            <div>後台管理系統</div>
            <span className="inspector-name">
              {admin.display_name}
              {ROLE_LABEL[admin.role] ? `（${ROLE_LABEL[admin.role]}）` : ""}
            </span>
          </div>
        </div>
        <div className="header-actions">
          <a className="btn-ghost" href="/">
            <ParkingCircle size={15} /> 稽查員 APP
          </a>
          <button className="btn-ghost" onClick={() => { clearAuthToken(); setAdmin(null); }}>
            <LogOut size={15} /> 登出
          </button>
        </div>
      </header>

      <nav className="admin-tabs">
        {visibleTabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              className={`admin-tab ${activeTab === t.key ? "active" : ""}`}
              onClick={() => setTab(t.key)}
            >
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </nav>

      <main className="app-main admin-main">
        {activeTab === "queue" && <ReviewQueue adminUsername={admin.username} />}
        {activeTab === "search" && <CaseSearch adminUsername={admin.username} />}
        {activeTab === "stats" && <StatsDashboard />}
        {activeTab === "accounts" && <AccountsManager admin={admin} />}
        {activeTab === "locations" && <LocationsManager />}
        {activeTab === "import" && <ImportManager />}
        {activeTab === "settings" && <SettingsPanel />}
      </main>
    </div>
  );
}
