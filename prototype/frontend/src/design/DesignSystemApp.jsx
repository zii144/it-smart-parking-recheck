import { useEffect, useState } from "react";
import {
  Sun,
  Smartphone,
  Eye,
  Gauge,
  CheckCircle2,
  AlertTriangle,
  FileWarning,
  LogIn,
  ArrowRight,
  QrCode,
  Camera,
  MapPin,
  Wifi,
  WifiOff,
  BarChart3,
  Palette,
} from "lucide-react";
import StepProgress from "../components/StepProgress";
import AppLogo from "../components/AppLogo";
import "../styles.css";
import "../admin/admin.css";
import "./design-system.css";

const SECTIONS = [
  { id: "principles", label: "設計原則" },
  { id: "colors", label: "色彩" },
  { id: "typography", label: "字體" },
  { id: "shape", label: "形狀與間距" },
  { id: "buttons", label: "按鈕" },
  { id: "forms", label: "表單" },
  { id: "cards", label: "卡片與面板" },
  { id: "status", label: "狀態與判定" },
  { id: "stepper", label: "精靈步驟" },
  { id: "admin", label: "後台樣式" },
  { id: "layout", label: "版面配置" },
];

const COLORS = [
  { name: "Primary Gold", token: "--color-primary", hex: "#e6a020", bg: "var(--color-primary)" },
  { name: "Primary Dark", token: "--color-primary-dark", hex: "#c9861a", bg: "var(--color-primary-dark)" },
  { name: "Primary Light", token: "--color-primary-light", hex: "#fbeecd", bg: "var(--color-primary-light)" },
  { name: "Ink", token: "--color-ink", hex: "#1b1d21", bg: "var(--color-ink)" },
  { name: "Muted", token: "--color-muted", hex: "#8b8f98", bg: "var(--color-muted)" },
  { name: "Background", token: "--color-bg", hex: "#f5f2ec", bg: "var(--color-bg)" },
  { name: "Surface", token: "--color-surface", hex: "#ffffff", bg: "var(--color-surface)" },
  { name: "Panel", token: "--color-panel", hex: "#1c1e22", bg: "var(--color-panel)" },
  { name: "Success", token: "--color-success", hex: "#159a63", bg: "var(--color-success)" },
  { name: "Warning", token: "--color-warning", hex: "#c9861a", bg: "var(--color-warning)" },
  { name: "Danger", token: "--color-danger", hex: "#e0483f", bg: "var(--color-danger)" },
];

const PRINCIPLES = [
  {
    icon: Smartphone,
    title: "現場優先",
    desc: "為稽查員的手機瀏覽器設計：大觸控目標、底部步驟列、離線狀態列。",
  },
  {
    icon: Eye,
    title: "判定可讀",
    desc: "成功／警告／錯誤色彩直接對應業務判定（符合規定、逾時、資料異常）。",
  },
  {
    icon: Sun,
    title: "溫暖專業",
    desc: "金色點綴搭配暖色奶油底，傳達可信賴的公務工具感，而非冷硬科技介面。",
  },
  {
    icon: Gauge,
    title: "高對比行動",
    desc: "主要 CTA 使用深炭色面板；金色保留給品牌、步驟進度與警示語意。",
  },
];

function Swatch({ name, token, hex, bg }) {
  return (
    <div className="ds-swatch">
      <div className="ds-swatch-color" style={{ background: bg }} />
      <div className="ds-swatch-meta">
        <span className="ds-swatch-name">{name}</span>
        <span className="ds-swatch-token">{token}</span>
        <span className="ds-swatch-hex">{hex}</span>
      </div>
    </div>
  );
}

function Section({ id, title, desc, children }) {
  return (
    <section className="ds-section" id={id}>
      <h2>{title}</h2>
      {desc && <p className="ds-section-desc">{desc}</p>}
      {children}
    </section>
  );
}

export default function DesignSystemApp() {
  const [activeSection, setActiveSection] = useState("principles");
  const [segment, setSegment] = useState("qr");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: 0 }
    );

    for (const { id } of SECTIONS) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div className="ds-shell">
      <aside className="ds-sidebar">
        <div className="ds-sidebar-brand">
          <span className="brand-icon">
            <Palette size={18} />
          </span>
          <span>Design System</span>
        </div>
        <nav aria-label="設計系統章節">
          <ul className="ds-nav">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className={activeSection === s.id ? "is-active" : ""}
                  onClick={() => setActiveSection(s.id)}
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <main className="ds-main">
        <header className="ds-hero">
          <span className="ds-hero-eyebrow">
            <AppLogo size={18} className="brand-logo" />
            IT-Smart Parking Recheck
          </span>
          <h1>停車單稽查系統設計系統</h1>
          <p className="ds-hero-lead">
            以金色點綴與暖色中性色為基調的現場稽查工具視覺語言。本頁展示色彩、元件與版面模式，作為稽查 APP 與後台管理介面的共同參考。
          </p>
        </header>

        <Section
          id="principles"
          title="設計原則"
          desc="四項核心原則引導所有畫面決策——從登入、六步精靈到後台複核。"
        >
          <div className="ds-principles">
            {PRINCIPLES.map((p) => {
              const Icon = p.icon;
              return (
                <div key={p.title} className="ds-principle">
                  <span className="ds-principle-icon">
                    <Icon size={18} />
                  </span>
                  <h4>{p.title}</h4>
                  <p>{p.desc}</p>
                </div>
              );
            })}
          </div>
        </Section>

        <Section
          id="colors"
          title="色彩"
          desc="品牌金 (#e6a020) 搭配暖奶油底 (#f5f2ec)。語意色直接對應開單判定結果，不可任意替換。"
        >
          <div className="ds-subsection">
            <h3>調色盤</h3>
            <div className="ds-swatches">
              {COLORS.map((c) => (
                <Swatch key={c.token} {...c} />
              ))}
            </div>
          </div>
          <div className="ds-subsection">
            <h3>語意對應</h3>
            <table className="ds-token-table">
              <thead>
                <tr>
                  <th>判定</th>
                  <th>Badge 類別</th>
                  <th>色彩</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>符合規定 (COMPLIANT)</td>
                  <td><code>.badge-ok</code> / <code>.pill-ok</code></td>
                  <td>Success green</td>
                </tr>
                <tr>
                  <td>開單逾時 (OVERDUE)</td>
                  <td><code>.badge-warn</code> / <code>.pill-warn</code></td>
                  <td>Warning gold</td>
                </tr>
                <tr>
                  <td>資料異常 / 格式錯誤</td>
                  <td><code>.badge-error</code> / <code>.pill-error</code></td>
                  <td>Danger red</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>

        <Section
          id="typography"
          title="字體"
          desc="使用系統字體堆疊，優先 PingFang TC / Microsoft JhengHei 以確保繁中可讀性。無外部 webfont 載入。"
        >
          <div className="ds-demo">
            <div className="ds-type-specimen">
              <div className="ds-type-label">Display — 28px / 800</div>
              <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em" }}>停車單稽查系統</div>
            </div>
            <div className="ds-type-specimen">
              <div className="ds-type-label">Heading — 22px / 700</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>開單時效判定</div>
            </div>
            <div className="ds-type-specimen">
              <div className="ds-type-label">Subheading — 18px / 600</div>
              <div style={{ fontSize: 18, fontWeight: 600 }}>確認停車單資料</div>
            </div>
            <div className="ds-type-specimen">
              <div className="ds-type-label">Body — 15px / 400</div>
              <div style={{ fontSize: 15 }}>系統解析帳單編號、計算開單時間差，判定是否符合 60 分鐘規定。</div>
            </div>
            <div className="ds-type-specimen">
              <div className="ds-type-label">Label — 13px / 600 muted</div>
              <div className="muted" style={{ fontSize: 13, fontWeight: 600 }}>帳單編號 · 停車日期 · 停車開始時間</div>
            </div>
            <div className="ds-type-specimen">
              <div className="ds-type-label">Font stack</div>
              <code style={{ fontSize: 12 }}>var(--font-family)</code>
            </div>
          </div>
        </Section>

        <Section
          id="shape"
          title="形狀與間距"
          desc="圓角偏柔和（10–22px），按鈕與標籤使用全圓 pill。陰影輕量，避免過度擬物。"
        >
          <div className="ds-demo">
            <table className="ds-token-table">
              <thead>
                <tr>
                  <th>Token</th>
                  <th>值</th>
                  <th>用途</th>
                </tr>
              </thead>
              <tbody>
                <tr><td><code>--radius-sm</code></td><td>10px</td><td>輸入框、訊息框</td></tr>
                <tr><td><code>--radius-md</code></td><td>16px</td><td>圖示徽章、統計卡</td></tr>
                <tr><td><code>--radius-lg</code></td><td>22px</td><td>主要卡片</td></tr>
                <tr><td><code>--radius-pill</code></td><td>999px</td><td>按鈕、標籤、分段控制</td></tr>
                <tr><td><code>--shadow-sm</code></td><td>輕微</td><td>統計卡、小元件</td></tr>
                <tr><td><code>--shadow-md</code></td><td>中等</td><td>主要卡片</td></tr>
                <tr><td><code>--shadow-lg</code></td><td>較深</td><td>下拉面板、模態框</td></tr>
                <tr><td><code>--space-4</code></td><td>16px</td><td>標準間距</td></tr>
                <tr><td><code>--space-5</code></td><td>24px</td><td>區塊間距、卡片內距</td></tr>
              </tbody>
            </table>
          </div>
          <div className="ds-demo ds-demo-row" style={{ marginTop: 14 }}>
            <div style={{ width: 80, height: 40, background: "var(--color-primary-light)", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)" }} title="radius-sm" />
            <div style={{ width: 80, height: 40, background: "var(--color-primary-light)", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border)" }} title="radius-md" />
            <div style={{ width: 80, height: 40, background: "var(--color-primary-light)", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-border)" }} title="radius-lg" />
            <div style={{ width: 120, height: 40, background: "var(--color-primary-light)", borderRadius: "var(--radius-pill)", border: "1px solid var(--color-border)" }} title="radius-pill" />
          </div>
        </Section>

        <Section
          id="buttons"
          title="按鈕"
          desc="主要 CTA 使用深炭色 (--color-panel)，而非金色——金色同時是 warning 色，避免混淆。次要動作為白底描邊。"
        >
          <div className="ds-demo ds-demo-row">
            <button type="button" className="btn-primary">
              <LogIn size={16} /> 主要按鈕
            </button>
            <button type="button" className="btn-secondary">
              次要按鈕
            </button>
            <button type="button" className="btn-ghost">
              Ghost
            </button>
            <button type="button" className="btn-link">
              文字連結
            </button>
            <button type="button" className="btn-danger">
              危險動作
            </button>
            <button type="button" className="btn-primary" disabled>
              已停用
            </button>
          </div>
        </Section>

        <Section
          id="forms"
          title="表單"
          desc="標籤使用 muted 13px 半粗體。聚焦時金色邊框 + 淺金 focus ring。"
        >
          <div className="ds-demo" style={{ maxWidth: 400 }}>
            <label>
              帳號
              <input placeholder="insp01" />
            </label>
            <label>
              密碼
              <input type="password" placeholder="••••••••" />
            </label>
            <label>
              行政區
              <select>
                <option>請選擇</option>
                <option>中正區</option>
                <option>大安區</option>
              </select>
            </label>
          </div>
          <div className="ds-demo" style={{ maxWidth: 400, marginTop: 14 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 14 }}>分段控制 (QR / OCR)</h3>
            <div className="segmented">
              <button type="button" className={segment === "qr" ? "active" : ""} onClick={() => setSegment("qr")}>
                <QrCode size={16} /> 掃描 QR
              </button>
              <button type="button" className={segment === "ocr" ? "active" : ""} onClick={() => setSegment("ocr")}>
                <Camera size={16} /> OCR 辨識
              </button>
            </div>
          </div>
        </Section>

        <Section
          id="cards"
          title="卡片與面板"
          desc="白底圓角卡片浮於奶油背景上。icon-badge 搭配 card-icon-heading 為標準標題模式。"
        >
          <div className="ds-demo-grid">
            <div className="card" style={{ margin: 0 }}>
              <div className="card-icon-heading">
                <AppLogo size={40} className="brand-logo" />
                <h2 style={{ fontSize: 18 }}>標準卡片</h2>
              </div>
              <p className="muted small">用於精靈各步驟、登入、權限檢查等畫面。</p>
            </div>
            <div className="ds-panel-demo">
              <div className="stat-value" style={{ fontSize: 32, fontWeight: 800 }}>128</div>
              <div className="stat-label">待複核案件</div>
              <p className="small" style={{ margin: "12px 0 0", color: "rgba(255,255,255,0.55)" }}>
                深色 KPI 面板 — 後台統計首卡
              </p>
            </div>
          </div>
          <div className="ds-demo" style={{ marginTop: 14 }}>
            <div className="error-box">
              <AlertTriangle size={16} />
              <span>錯誤訊息框 — 網路失敗、驗證錯誤</span>
            </div>
            <div className="info-box">
              <CheckCircle2 size={16} />
              <span>資訊訊息框 — 提示、離線說明</span>
            </div>
            <div className="info-box success">
              <CheckCircle2 size={16} />
              <span>成功訊息框 — 案件已儲存</span>
            </div>
          </div>
        </Section>

        <Section
          id="status"
          title="狀態與判定"
          desc="Badge 用於判定結果横幅；Pill 用於表格列狀態。色彩語意與後端 judgement 欄位一致。"
        >
          <div className="ds-demo ds-demo-row">
            <span className="badge badge-ok"><CheckCircle2 size={14} /> 符合規定</span>
            <span className="badge badge-warn"><AlertTriangle size={14} /> 開單逾時</span>
            <span className="badge badge-error"><FileWarning size={14} /> 資料異常</span>
          </div>
          <div className="ds-demo ds-demo-row" style={{ marginTop: 14 }}>
            <span className="pill pill-ok">已上傳</span>
            <span className="pill pill-warn">待複核</span>
            <span className="pill pill-error">重複</span>
            <span className="pill pill-neutral">草稿</span>
          </div>
          <div className="ds-demo" style={{ marginTop: 14 }}>
            <div className="offline-bar">
              <span><Wifi size={14} /> 已連線 · 0 筆待補傳</span>
            </div>
            <div className="offline-bar offline">
              <span><WifiOff size={14} /> 離線模式 · 3 筆待補傳</span>
              <button type="button" className="btn-secondary" style={{ padding: "6px 12px", fontSize: 12 }}>
                立即同步
              </button>
            </div>
          </div>
        </Section>

        <Section
          id="stepper"
          title="精靈步驟"
          desc="六步開單流程：取得 → 地點 → 確認 → 判定 → 拍照 → 儲存。金色圓點標示進度，已完成步驟顯示勾選。"
        >
          <div className="ds-demo">
            <h3 style={{ margin: "0 0 14px", fontSize: 14, color: "var(--color-muted)" }}>水平步驟列（行動裝置頂部）</h3>
            <StepProgress step="confirm" maxIndex={3} orientation="horizontal" />
          </div>
          <div className="ds-demo" style={{ marginTop: 14, maxWidth: 220 }}>
            <h3 style={{ margin: "0 0 14px", fontSize: 14, color: "var(--color-muted)" }}>垂直步驟軌（桌面側欄）</h3>
            <StepProgress step="confirm" maxIndex={3} orientation="vertical" />
          </div>
        </Section>

        <Section
          id="admin"
          title="後台樣式"
          desc="後台共用同一套 token，但以寬版容器、統計卡網格、深色 active tab 呈現管理介面。"
        >
          <div className="ds-demo">
            <div className="admin-tabs" style={{ position: "relative", top: 0, margin: "-24px -26px 20px", borderRadius: "var(--radius-lg) var(--radius-lg) 0 0" }}>
              <button type="button" className="admin-tab active">複核佇列</button>
              <button type="button" className="admin-tab">案件查詢</button>
              <button type="button" className="admin-tab">統計資料</button>
            </div>
            <div className="stat-grid">
              <div className="stat-card">
                <BarChart3 size={18} className="stat-icon" />
                <div className="stat-value">42</div>
                <div className="stat-label">待複核</div>
              </div>
              <div className="stat-card">
                <CheckCircle2 size={18} className="stat-icon" />
                <div className="stat-value">891</div>
                <div className="stat-label">本月符合</div>
              </div>
              <div className="stat-card">
                <AlertTriangle size={18} className="stat-icon" />
                <div className="stat-value">17</div>
                <div className="stat-label">逾時案件</div>
              </div>
            </div>
          </div>
        </Section>

        <Section
          id="layout"
          title="版面配置"
          desc="稽查 APP 為窄版 (640px) 精靈 + 底部固定步驟列；後台為寬版 (1040px) 表格與儀表板。"
        >
          <div className="ds-layout-preview">
            <div className="ds-layout-phone">
              <div className="ds-layout-phone-header">
                <AppLogo size={24} className="brand-logo" />
                停車單稽查 APP
              </div>
              <div className="offline-bar" style={{ position: "relative", top: 0, borderRadius: 0 }}>
                <span><MapPin size={14} /> 大安區 · 復興南路</span>
              </div>
              <div className="ds-layout-phone-body">
                <div className="card" style={{ padding: 16, margin: 0 }}>
                  <div className="card-icon-heading" style={{ marginBottom: 10 }}>
                    <span className="icon-badge" style={{ width: 32, height: 32 }}>
                      <QrCode size={16} />
                    </span>
                    <h2 style={{ fontSize: 16 }}>取得停車單</h2>
                  </div>
                  <p className="muted small">掃描 QR 或 OCR 帶入帳單資料</p>
                  <button type="button" className="btn-primary btn-block" style={{ marginTop: 12 }}>
                    繼續 <ArrowRight size={15} />
                  </button>
                </div>
              </div>
              <div className="ds-layout-phone-stepper">
                <StepProgress step="acquire" maxIndex={0} orientation="horizontal" />
              </div>
            </div>
            <div>
              <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>品牌識別</h3>
              <div className="ds-demo-row" style={{ marginBottom: 20 }}>
                <div className="brand">
                  <AppLogo size={36} className="brand-logo" />
                  <div>
                    <div>停車單稽查 APP</div>
                    <div className="inspector-name">稽查員 · insp01</div>
                  </div>
                </div>
              </div>
              <div className="ds-demo-row">
                <div className="brand">
                  <AppLogo size={36} className="brand-logo" />
                  <div>
                    <div>後台管理系統</div>
                    <div className="inspector-name">管理人員</div>
                  </div>
                </div>
              </div>
              <p className="hint" style={{ marginTop: 20 }}>
                共用 <code>AppLogo</code> 金色圓角標章；Lucide 圖示仍用於功能操作，全域 <code>strokeWidth={2.5}</code>。
              </p>
            </div>
          </div>
        </Section>

        <footer className="ds-footer">
          <a href="/">← 稽查 APP</a>
          <a href="/admin">後台管理 →</a>
          <span className="muted">Tokens: <code>src/design/tokens.css</code></span>
        </footer>
      </main>
    </div>
  );
}
