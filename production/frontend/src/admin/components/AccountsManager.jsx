import { useState } from "react";
import { Users, ShieldHalf } from "lucide-react";
import InspectorAccounts from "./InspectorAccounts";
import AdminAccounts from "./AdminAccounts";

// The 帳號管理 tab is a two-section console: field-worker (稽查員) accounts and
// back-office (管理) accounts. Both are gated to sysadmin at the API; this just
// splits them into two focused views.
const SUBTABS = [
  { key: "inspectors", label: "稽查員帳號", icon: Users },
  { key: "admins", label: "管理帳號", icon: ShieldHalf },
];

export default function AccountsManager({ admin }) {
  const [sub, setSub] = useState("inspectors");

  return (
    <div className="accounts-console">
      <div className="subtabs">
        {SUBTABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              className={`subtab ${sub === t.key ? "active" : ""}`}
              onClick={() => setSub(t.key)}
            >
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      {sub === "inspectors" ? <InspectorAccounts /> : <AdminAccounts currentAdmin={admin} />}
    </div>
  );
}
