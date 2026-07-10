import { useEffect, useState } from "react";
import { LayoutDashboard, Files, ClipboardList, Copy, Timer, TrendingUp } from "lucide-react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { adminApi } from "../../api";
import Spinner from "../../components/Spinner";
import { STATUS_TEXT } from "../../format";

// Mirrors the CSS custom properties in ../../styles.css. Hardcoded here
// because SVG fill attributes are more reliably rendered with literal
// colors than with var(...) across browsers/renderers.
const JUDGEMENT_COLORS = {
  COMPLIANT: "#159a63",
  OVERDUE: "#e6a020",
  DATA_ERROR: "#e0483f",
  PARSE_ERROR: "#b0651a",
  UNKNOWN: "#b9b3a8",
};

const JUDGEMENT_LABELS = {
  COMPLIANT: "符合規定",
  OVERDUE: "開單逾時",
  DATA_ERROR: "資料異常",
  PARSE_ERROR: "格式錯誤",
  UNKNOWN: "未知",
};

const STATUS_COLORS = {
  REVIEW_REQUIRED: "#e6a020",
  REVIEW_NEED_INFO: "#c9861a",
  CLOSED: "#159a63",
};

const BAR_COLOR = "#e6a020";

function StatCard({ icon: Icon, label, value, accent }) {
  return (
    <div className="stat-card">
      <div className="stat-icon" style={accent ? { color: accent } : undefined}>
        <Icon size={16} />
      </div>
      <div className="stat-value" style={accent ? { color: accent } : undefined}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function toChartData(record, labelMap, colorMap, fallbackColor) {
  return Object.entries(record || {})
    .map(([key, count]) => ({
      key,
      name: labelMap?.[key] ?? key,
      count,
      color: colorMap?.[key] ?? fallbackColor,
    }))
    .sort((a, b) => b.count - a.count);
}

function EmptyChart() {
  return <p className="muted small">尚無資料可供繪圖。</p>;
}

export default function StatsDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi.stats().then(setStats).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="card">
        <div className="card-icon-heading">
          <span className="icon-badge">
            <LayoutDashboard size={18} />
          </span>
          <h2>統計資料</h2>
        </div>
        <Spinner label="載入統計資料中…" />
      </div>
    );
  }

  const judgementData = toChartData(stats.by_judgement, JUDGEMENT_LABELS, JUDGEMENT_COLORS, "#94a3b8");
  const statusData = toChartData(stats.by_status, STATUS_TEXT, STATUS_COLORS, BAR_COLOR);
  const sourceData = toChartData(stats.by_data_source, null, null, BAR_COLOR);
  const districtData = toChartData(stats.by_district, null, null, BAR_COLOR);

  return (
    <div className="card">
      <div className="card-icon-heading">
        <span className="icon-badge">
          <LayoutDashboard size={18} />
        </span>
        <h2>統計資料</h2>
      </div>

      <div className="stat-grid">
        <StatCard icon={Files} label="總案件數" value={stats.total} />
        <StatCard icon={ClipboardList} label="待複核" value={stats.review_pending} accent="#c9861a" />
        <StatCard icon={Copy} label="重複帳單" value={stats.duplicate_count} accent="#e0483f" />
        <StatCard icon={Timer} label="平均時間差(分)" value={stats.avg_time_diff_minutes ?? "—"} />
        <StatCard icon={TrendingUp} label="逾時率" value={`${stats.overdue_rate_pct}%`} accent="#c9861a" />
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <h3>依判定結果</h3>
          {judgementData.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={judgementData} dataKey="count" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
                  {judgementData.map((entry) => (
                    <Cell key={entry.key} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
          <div className="chart-legend">
            {judgementData.map((entry) => (
              <span key={entry.key} className="legend-item">
                <span className="legend-dot" style={{ background: entry.color }} />
                {entry.name} ({entry.count})
              </span>
            ))}
          </div>
        </div>

        <div className="chart-card">
          <h3>依案件狀態</h3>
          {statusData.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={statusData} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                  {statusData.map((entry) => (
                    <Cell key={entry.key} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="chart-card">
          <h3>依資料來源</h3>
          {sourceData.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={sourceData} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill={BAR_COLOR} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="chart-card">
          <h3>依行政區</h3>
          {districtData.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(220, districtData.length * 36)}>
              <BarChart data={districtData} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" fill={BAR_COLOR} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
