import { lazy, Suspense, useEffect, useState } from "react";
import {
  LayoutDashboard, Files, ClipboardList, Copy, Timer, TrendingUp, Map, Clock, Users, Gauge, Settings2,
} from "lucide-react";
import {
  PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { adminApi } from "../../api";
import Spinner from "../../components/Spinner";
import { STATUS_TEXT, SOURCE_TEXT } from "../../format";

const MapView3D = lazy(() => import("./MapView3D"));

const GOLD = "#e6a020";

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

function SectionTitle({ icon: Icon, children }) {
  return (
    <h3 className="chart-title">
      <Icon size={15} /> {children}
    </h3>
  );
}

export default function StatsDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    adminApi
      .stats()
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch(() => {
        // Without a catch, a failed stats call left stats=null and then threw
        // a TypeError during render (stats.by_judgement) — which, with no error
        // boundary, used to white-screen the whole admin console.
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [retry]);

  if (loading) {
    return (
      <div className="card">
        <div className="card-icon-heading">
          <span className="icon-badge"><LayoutDashboard size={18} /></span>
          <h2>統計資料</h2>
        </div>
        <Spinner label="載入統計資料中…" />
      </div>
    );
  }

  if (failed || !stats) {
    return (
      <div className="card">
        <div className="card-icon-heading">
          <span className="icon-badge"><LayoutDashboard size={18} /></span>
          <h2>統計資料</h2>
        </div>
        <div className="error-box">
          <span>載入統計資料失敗，請確認網路連線後重試。</span>
        </div>
        <button className="btn-primary" onClick={() => setRetry((r) => r + 1)}>重試</button>
      </div>
    );
  }

  const judgementData = toChartData(stats.by_judgement, JUDGEMENT_LABELS, JUDGEMENT_COLORS, "#b9b3a8");
  const statusData = toChartData(stats.by_status, STATUS_TEXT, STATUS_COLORS, GOLD);
  const sourceData = toChartData(stats.by_data_source, SOURCE_TEXT, null, GOLD);
  const districtData = toChartData(stats.by_district, null, null, GOLD);
  const inspectorData = toChartData(stats.by_inspector, null, null, GOLD);
  const trendData = stats.by_day || [];
  const hourData = stats.by_hour || [];
  const histData = stats.time_diff_histogram || [];
  const mapPoints = stats.map_points || [];

  return (
    <div className="card">
      <div className="card-icon-heading">
        <span className="icon-badge"><LayoutDashboard size={18} /></span>
        <h2>統計資料</h2>
      </div>

      <div className="stat-grid">
        <StatCard icon={Files} label="總案件數" value={stats.total} />
        <StatCard icon={ClipboardList} label="待複核" value={stats.review_pending} accent="#c9861a" />
        <StatCard icon={Copy} label="重複帳單" value={stats.duplicate_count} accent="#e0483f" />
        <StatCard icon={Timer} label="平均時間差(分)" value={stats.avg_time_diff_minutes ?? "—"} />
        <StatCard icon={TrendingUp} label="逾時率" value={`${stats.overdue_rate_pct}%`} accent="#c9861a" />
      </div>

      {/* 3D map — the highlight */}
      <div className="chart-card full">
        <SectionTitle icon={Map}>案件分佈 · 3D 熱區地圖</SectionTitle>
        {mapPoints.length === 0 ? (
          <p className="muted small">尚無含 GPS 座標的案件可供繪製地圖。</p>
        ) : (
          <Suspense fallback={<div style={{ height: 460, display: "grid", placeItems: "center" }}><Spinner label="載入 3D 地圖中…" /></div>}>
            <MapView3D points={mapPoints} />
          </Suspense>
        )}
        <p className="muted small" style={{ marginTop: 10 }}>
          可拖曳旋轉、傾斜與縮放；點擊左上角
          <Settings2 size={12} style={{ verticalAlign: "-2px", margin: "0 2px" }} />
          設定鈕可切換視覺化模式、篩選判定類別並調整聚合參數。共 {mapPoints.length} 個定位點。
        </p>
      </div>

      {/* Trend over time */}
      <div className="chart-card full">
        <SectionTitle icon={TrendingUp}>每日案件趨勢</SectionTitle>
        {trendData.length === 0 ? (
          <EmptyChart />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trendData} margin={{ top: 8, right: 12, left: -14, bottom: 0 }}>
              <defs>
                <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor={GOLD} stopOpacity={0.5} />
                  <stop offset="1" stopColor={GOLD} stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => String(d).slice(5)} />
              <YAxis allowDecimals={false} width={30} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Area type="monotone" dataKey="count" name="案件數" stroke={GOLD} strokeWidth={2.5} fill="url(#trendFill)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="charts-grid">
        <div className="chart-card">
          <SectionTitle icon={Gauge}>依判定結果</SectionTitle>
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
          <SectionTitle icon={ClipboardList}>依案件狀態</SectionTitle>
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
          <SectionTitle icon={Clock}>依開單時段（小時）</SectionTitle>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={hourData} margin={{ left: -14, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={1} />
              <YAxis allowDecimals={false} width={30} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" name="案件數" fill={GOLD} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <SectionTitle icon={Timer}>開單時間差分佈（分）</SectionTitle>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={histData} margin={{ left: -14, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="bucket" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} width={30} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" name="案件數" fill={GOLD} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <SectionTitle icon={Map}>依行政區</SectionTitle>
          {districtData.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(220, districtData.length * 34)}>
              <BarChart data={districtData} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" fill={GOLD} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="chart-card">
          <SectionTitle icon={Users}>依稽查員</SectionTitle>
          {inspectorData.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(220, inspectorData.length * 34)}>
              <BarChart data={inspectorData} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" fill={GOLD} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="chart-card">
          <SectionTitle icon={Files}>依資料來源</SectionTitle>
          {sourceData.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={sourceData} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill={GOLD} radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
