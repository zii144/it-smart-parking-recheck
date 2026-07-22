# Design System — 停車單稽查系統

本文件描述 IT-Smart Parking Recheck 的視覺語言與元件規範。互動式展示頁請在開發環境開啟 **`/design`**。

## 設計理念

這是一套為**現場稽查**設計的公務工具介面：

- **溫暖專業**：金色 (#e6a020) 點綴 + 奶油底 (#f5f2ec)，避免冷硬科技感
- **判定可讀**：成功／警告／錯誤色彩直接對應業務判定（COMPLIANT、OVERDUE、DATA_ERROR）
- **行動優先**：大觸控目標、底部步驟列、離線狀態列
- **高對比 CTA**：主要按鈕使用深炭色面板；金色保留給品牌與警示

## 檔案結構

```
src/design/
├── tokens.css          # 設計 token（色彩、字體、間距、圓角、陰影）
├── design-system.css   # 展示頁版面樣式
└── DesignSystemApp.jsx # 互動式展示頁（/design）
```

`styles.css` 透過 `@import "./design/tokens.css"` 載入 token，其餘元件類別維持在 `styles.css` 與 `admin/admin.css`。

## 色彩 Token

| Token | 值 | 用途 |
|-------|-----|------|
| `--color-primary` | `#e6a020` | 品牌金、步驟進度、圖示徽章 |
| `--color-primary-dark` | `#c9861a` | Hover、warning 文字 |
| `--color-primary-light` | `#fbeecd` | Focus ring、選取狀態 |
| `--color-ink` | `#1b1d21` | 主要文字 |
| `--color-muted` | `#8b8f98` | 標籤、次要文字 |
| `--color-bg` | `#f5f2ec` | 頁面背景 |
| `--color-surface` | `#ffffff` | 卡片背景 |
| `--color-panel` | `#1c1e22` | 主要 CTA、admin active tab、KPI 面板 |
| `--color-success` | `#159a63` | 符合規定 |
| `--color-warning` | `#c9861a` | 開單逾時 |
| `--color-danger` | `#e0483f` | 資料異常、錯誤 |

## 元件類別

### 按鈕

| 類別 | 用途 |
|------|------|
| `.btn-primary` | 主要確認動作（深炭色） |
| `.btn-secondary` | 次要／取消 |
| `.btn-ghost` | 標頭輕量動作 |
| `.btn-link` | 文字連結 |
| `.btn-danger` | 刪除等危險動作 |

### 狀態

| 類別 | 用途 |
|------|------|
| `.badge-ok` / `.pill-ok` | 符合規定、成功 |
| `.badge-warn` / `.pill-warn` | 逾時、待複核 |
| `.badge-error` / `.pill-error` | 異常、錯誤 |
| `.pill-neutral` | 中性狀態 |

### 版面

| 類別 | 用途 |
|------|------|
| `.card` | 主要內容容器 |
| `.card-icon-heading` + `.icon-badge` | 帶圖示的卡片標題 |
| `.app-main` | 稽查 APP 窄版 (640px) |
| `.app-main-wide` / `.admin-main` | 後台寬版 (1040px) |
| `.stepper-*` | 六步精靈進度 |

## 圖示

使用 [Lucide React](https://lucide.dev/)，全域 `strokeWidth={2.5}`。

| 場景 | 圖示 |
|------|------|
| 稽查 APP | `ParkingCircle` |
| 後台 | `ShieldHalf` |
| 判定 | `Gauge`, `CheckCircle2`, `AlertTriangle`, `FileWarning` |

## 開發

```bash
cd prototype/frontend
npm run dev
# 開啟 http://localhost:5173/design
```

修改 token 時只需編輯 `src/design/tokens.css`；展示頁會即時反映變更。
