# 稽查員 APP + 後台管理系統原型（Prototype）

這是依據專案根目錄 `README.md` 的設計文件（活動圖／循序圖／狀態圖／使用案例圖）實作的可執行原型，包含兩個前端、共用同一組後端 API：

1. **稽查員 APP**（`/`）：登入 → 權限檢查 → 選擇地點 → 掃描 QR Code（真實相機掃描，見下方說明）→ 確認/修正資料 → 開單時效判定 → 拍照存證 → 重複檢查 → 離線暫存/上傳儲存。
2. **後台管理系統**（`/admin`）：複核佇列（處理需複核案件）、案件查詢與匯出、統計資料、稽查員帳號權限管理、路段/停車格管理、判定規則（開單逾時門檻）設定 — 對應設計文件中「管理人員」與「系統管理員」兩個角色。

後端是真實可運作的 FastAPI + SQLite API，不是純前端假資料；後台調整的判定規則（例如逾時門檻）會直接影響稽查員 APP 的即時判定結果。

## 技術棧

- 後端：Python 3 + FastAPI + SQLAlchemy（ORM）+ Alembic（資料庫遷移）；資料庫由 `DATABASE_URL` 決定，本機開發預設 SQLite、部署用 PostgreSQL（`prototype/backend`）
- 前端：React + Vite + `lucide-react`（圖示）+ `recharts`（後台統計圖表）+ `qr-scanner`（相機 QR 解碼，見下方說明）（`prototype/frontend`）
- 容器化：Docker + `docker-compose.yml`（`prototype/backend/Dockerfile`、`prototype/frontend/Dockerfile` + nginx）
- QR Code 掃描使用真實相機即時解碼（`qr-scanner` 套件），解碼出的內容仍透過 `QR_DEMO_CODES` 對照表模擬「外部查詢網站」的回應（見下方「與狀態圖／範圍的簡化說明」）
- 畫面上方會顯示新增案件流程的步驟進度條（地點→掃描→確認→判定→拍照→儲存）

## 執行方式

有三種跑法：**開發 CLI**（推薦，一個指令同時跑起前後端）、本機手動分開跑（了解底層流程用）、或用 Docker（一個指令跑完整套，不需要裝 Python/Node）。

### 方式零（推薦）：開發 CLI `dev.sh`

不想用 Docker、又懶得開兩個終端機分別啟動前後端時，用 `prototype/dev.sh`。它會用一個指令同時跑起 FastAPI 後端與 Vite 前端，日誌以 `[backend]` / `[frontend]` 標色前綴交錯輸出，按一次 <kbd>Ctrl-C</kbd> 兩者一起乾淨關閉。

```bash
cd prototype
./dev.sh setup     # 一次性：建立 venv、安裝前後端相依套件
./dev.sh up        # 同時啟動前後端（Ctrl-C 一起停）
```

啟動後會印出可直接點的網址（稽查員 APP、後台、API 文件）。其他常用子指令：

| 指令 | 說明 |
| --- | --- |
| `./dev.sh doctor` | 檢查 Python / Node 版本與相依套件狀態（Node 需 ≥ 20.19，CI 用 22；nvm 使用者記得 `nvm use 22`） |
| `./dev.sh backend` / `frontend` | 只跑其中一個 |
| `./dev.sh status` / `stop` | 查看 / 停止佔用開發埠的服務 |
| `./dev.sh test [backend\|frontend\|all]` | 跑測試（後端 pytest、前端 lint+build） |
| `./dev.sh reset-db` | 刪除開發用 SQLite（下次啟動重新植入示範資料） |
| `./dev.sh clean` | 移除 venv、node_modules 與開發 DB |

也提供 `Makefile` 包裝：`make setup`、`make up`、`make status`、`make test-all` 等（`make help` 看全部）。埠與主機可用環境變數覆寫，例如 `BE_PORT=9000 FE_PORT=5200 ./dev.sh up`。完整指令列表見 `./dev.sh --help`。

### 方式一：本機直接跑（手動）

**後端**

```bash
cd prototype/backend
pip install -r requirements.txt   # 或 pip install --break-system-packages -r requirements.txt
./run.sh                          # 等同 uvicorn app.main:app --reload --port 8000
```

首次啟動會自動建立 `parking.db` 並植入示範資料（稽查員帳號、管理員帳號、路段/停車格、系統設定、QR 示範代碼、一筆既有案件）。若你有從更早版本跑過的 `parking.db`，重新啟動時會自動幫 `cases` 表補齊新增的複核相關欄位，不需要手動刪除資料庫。

**前端**（另開一個終端機）

```bash
cd prototype/frontend
npm install
npm run dev                       # http://localhost:5173
```

前端預設呼叫 `http://localhost:8000`（見 `.env` 的 `VITE_API_BASE`）。瀏覽器開啟 `http://localhost:5173/` 是稽查員 APP，`http://localhost:5173/admin` 是後台管理系統；兩邊畫面上也都有連結可以互相切換。

> **相機權限提醒**：瀏覽器只允許在「安全來源」（HTTPS，或 `http://localhost`）使用相機。在自己電腦上用 `localhost` 開發完全沒問題；但如果之後要用手機連到區網 IP（例如 `http://192.168.x.x:5173`）測試，瀏覽器會直接封鎖相機權限，這不是本專案的 bug，而是瀏覽器規範——正式部署（或用手機做區網測試）必須走 HTTPS。

### 方式二：Docker

```bash
cd prototype
docker compose up --build
```

啟動後開啟：

- `http://localhost:8080/` — 稽查員 APP
- `http://localhost:8080/admin` — 後台管理系統
- `http://localhost:8000/docs` — FastAPI 互動式 API 文件（後端也直接對外開了 8000 port，方便直接呼叫 API 或除錯）

架構上，`frontend` 容器是 nginx 服務編譯後的靜態檔案，並把 `/api/` 與 `/uploads/` 反向代理到 `backend` 容器，所以瀏覽器只需要跟 8080 port 溝通（因此 Docker 版的前端是用相對路徑呼叫 API，跟本機開發用 `.env` 裡絕對路徑的方式不同，見 `frontend/nginx.conf` 與 `frontend/Dockerfile` 的註解）。資料庫與照片存在 `parking_data` 這個 named volume，`docker compose down` 不會清掉資料，要重置的話用 `docker compose down -v`。

> **限制說明**：這次的 Dockerfile / `docker-compose.yml` / `nginx.conf` 是在沒有 Docker 的環境中撰寫的（此對話所在的沙盒沒有安裝 Docker，也裝不了，所以沒辦法在這裡實際執行 `docker compose up` 驗證）。內容是依照標準、常見的 Python/FastAPI 與 Vite/nginx 多階段建置寫法，並且驗證過 `docker-compose.yml` 的 YAML 語法正確、路徑與既有程式碼（`requirements.txt`、`package.json`、`PARKING_DB_PATH`/`PARKING_UPLOADS_DIR` 環境變數）都對得起來，但**你在自己機器上第一次執行 `docker compose up --build` 時，這是真正的首次驗證**，如果遇到問題請回報，我可以繼續除錯。

## Demo 帳號

**稽查員 APP**

| 帳號 | 密碼 | 稽查權限 |
| --- | --- | --- |
| `insp01` | `pass123` | 有（可正常跑完整流程） |
| `insp02` | `pass123` | 無（示範「無稽查權限」中止流程） |

**後台管理系統**

| 帳號 | 密碼 | 角色 | 可用功能 |
| --- | --- | --- | --- |
| `manager01` | `manager123` | 管理人員 | 複核佇列、案件查詢、統計資料、CSV 匯出 |
| `sysadmin01` | `sysadmin123` | 系統管理員 | 稽查員帳號管理、路段管理、系統設定 |

## Demo QR Code

掃描畫面（`src/components/QRScan.jsx`）主要流程是用手機或筆電相機即時掃描真實 QR Code；畫面下方也保留了示範按鈕，在沒有相機、相機權限被拒絕，或想直接跳到特定情境時可以點選使用。兩種方式解碼/選取出的內容，最後都會送進同一支 `POST /api/qr/scan`，對照 `backend/app/seed.py` 的 `QR_DEMO_CODES`：

| 代碼 | 情境 |
| --- | --- |
| `QR-A1001` | 讀取成功、**符合規定**，且會與預先植入的既有案件**帳單編號重複**（示範重複警示） |
| `QR-A1002` | 讀取成功、**開單逾時**（時間差約 85 分鐘） |
| `QR-A1003` | 讀取成功、**資料異常**（開單時間早於停車開始時間） |
| `QR-A1004` | 讀取成功、符合規定、無重複（乾淨案例） |
| `QR-A1005` | QR 解碼成功但查詢頁**讀取失敗**，需依畫面文字人工填寫（`MANUAL_FROM_QR_PAGE`） |
| 任意其他文字（如 `QR-BAD-SCAN`） | 視為**掃描失敗**，直接人工輸入（`MANUAL_FROM_TICKET`） |

**用真實相機測試**：`prototype/frontend/public/demo-qr/` 底下有對應上述代碼、真的可以被掃描的 QR Code PNG（用 `qrcode` 套件產生，內容就是代碼文字本身），在瀏覽器開啟 `/demo-qr.html`（本機開發是 `http://localhost:5173/demo-qr.html`）可以看到整理好的頁面。在另一台裝置（例如筆電）顯示這個頁面，再用手機上的稽查員 APP 對準畫面掃描，就能走一次完整的「相機掃描 → 解碼 → 呼叫 API」流程，而不是只點選示範按鈕。若之後 `seed.py` 的示範代碼有異動，於 `prototype/frontend` 執行 `npm run generate-demo-qr` 即可重新產生圖片。

其他可手動測試的情境：在人工輸入時填一個不符合格式的帳單編號（例如 `BADTICKET123`）可觸發 `PARSE_ERROR`；用畫面上「模擬離線」開關可測試離線暫存與之後的「立即同步」補傳。

## 後台管理系統（`/admin`）

| 分頁 | 對應使用案例 | 功能 |
| --- | --- | --- |
| 複核佇列 | 複核異常/重複/人工填寫案件 → 更新複核狀態 | 列出 `REVIEW_REQUIRED` / `REVIEW_NEED_INFO` 案件，點「複核」開啟詳情並選擇複核結果 |
| 案件查詢 | 查詢稽查案件 → 查看案件明細 | 依狀態/判定/關鍵字篩選所有案件，可檢視詳情與照片 |
| 統計資料 | 查看統計資料 | KPI 卡片（總案件數、待複核數、重複數、平均時間差、逾時率）+ 圖表：依判定結果（圓餅圖）、依狀態/來源/行政區（長條圖，`recharts`），皆為目前資料的快照（無時間趨勢） |
| 帳號管理 | 管理帳號權限 | 列出稽查員帳號、切換是否具稽查權限、新增帳號 |
| 路段管理 | 管理路段資料 | 新增/刪除行政區、路段、停車格，會即時反映在稽查員 APP 的地點選單 |
| 系統設定 | 設定判定規則、管理系統參數 | 調整「開單逾時判定門檻（分鐘）」，會立即套用到後續所有判定計算 |

**複核結果與狀態機的對應**：選擇「需補充資料」時，案件會停留在待複核佇列（狀態變為 `REVIEW_NEED_INFO`），之後可以再次複核並選擇其他結果來結案；選擇「資料錯誤／重複開單／確認異常／排除異常」則會直接將案件標記為 `CLOSED`，對應狀態圖中五個複核結果最終都會收斂到 `CLOSED` 的設計。

## 對應設計文件的判定規則

- 帳單編號解析、開單時間組合、逾時門檻判定：`backend/app/business_rules.py`（門檻預設 60 分鐘，可在後台「系統設定」調整，實際數值存在 `settings` 表）
- `dataSource`（`AUTO_QR` / `MANUAL_FROM_QR_PAGE` / `MANUAL_FROM_TICKET`）與 `manual_corrected`、`reviewRequired`、`duplicate_warning` 標記邏輯：`backend/app/main.py` 的 `create_case`
- 案件狀態以 `status = REVIEW_REQUIRED | REVIEW_NEED_INFO | CLOSED` 儲存，複核結果存在 `review_outcome` / `review_note` / `reviewed_by` / `reviewed_at`（詳見下方「與狀態圖的對應/簡化」）

## API 一覽

**稽查員 APP**

| Method | 路徑 | 說明 |
| --- | --- | --- |
| POST | `/api/login` | 登入，回傳稽查員資料與是否具稽查權限 |
| GET | `/api/locations` | 行政區／路段／停車格清單（DB 資料，後台可編輯） |
| POST | `/api/qr/scan` | 模擬 QR 查詢頁讀取（相機即時解碼出的內容與示範按鈕都呼叫這支 API） |
| POST | `/api/cases/preview` | 僅解析帳單編號＋計算時間差，不儲存 |
| POST | `/api/cases` | 正式儲存（重新解析/計算/查重），帳單編號重複且未帶 `save_anyway` 會回傳 409 |
| GET | `/api/cases?username=` | 列出已儲存案件（稽查員本人「我的稽查案件」） |
| GET | `/api/health` | 健康檢查（Docker HEALTHCHECK 使用） |

**後台管理系統**

| Method | 路徑 | 說明 |
| --- | --- | --- |
| POST | `/api/admin/login` | 管理人員登入 |
| GET | `/api/admin/cases` | 依 `status`/`judgement`/`duplicate_warning`/`district`/`q` 篩選案件 |
| GET | `/api/admin/cases/{id}` | 單一案件詳情 |
| POST | `/api/admin/cases/{id}/review` | 送出複核結果（`DATA_ERROR`/`DUPLICATE`/`NEED_INFO`/`CONFIRMED`/`DISMISSED`） |
| GET | `/api/admin/stats` | 統計資料 |
| GET | `/api/admin/export.csv` | 匯出所有案件為 CSV |
| GET/POST | `/api/admin/inspectors` | 列出／新增稽查員帳號 |
| PATCH | `/api/admin/inspectors/{username}` | 更新姓名/密碼/稽查權限 |
| GET/POST | `/api/admin/locations` | 列出／新增停車格 |
| DELETE | `/api/admin/locations/{id}` | 刪除停車格 |
| GET/PUT | `/api/admin/settings` | 讀取／更新系統設定（目前為開單逾時門檻） |

## 與狀態圖／範圍的簡化說明（請注意）

這個原型優先驗證核心業務規則與資料流，以下地方刻意簡化，供後續正式開發參考：

- **相機／網路狀態檢查**：相機權限與網路狀態仍模擬為「已授權」（稽查權限則是來自登入回應的真實檢查）。**GPS 定位已改為真實實作**：`LocationSelect` 會以 `navigator.geolocation` 取得裝置座標（權限被拒或非安全來源時退回示範座標），座標隨案件存入 `cases.gps_lat/gps_lng`，後台案件明細可點開 Google 地圖、CSV 匯出也含座標。
- **QR 掃描與查詢**：相機掃描與解碼是真的（`qr-scanner` 套件），QR 查詢網站的串接也已改為真實的抓取＋解析管線（見下方「QR 查詢網站串接」章節）——`/api/qr/scan` 會依解碼內容呼叫外部查詢頁並解析欄位，或退回內建示範代碼。**唯一未定的是真實政府查詢站的網址與回傳格式**：目前解析器同時支援 JSON 與帶標籤的 HTML/文字頁（依設計文件的查詢頁樣式），實際串接時只需把該站主機加入白名單、必要時微調解析對應即可。另外，相機掃描需要「安全來源」（HTTPS 或 `localhost`），這是瀏覽器規範而非可簡化項目，正式部署與區網測試都必須留意。
- **狀態機簡化**：設計文件中的狀態圖有 30+ 個細分狀態（`UPLOADING`、`BACKEND_VALIDATING`、`STORED`…）。原型把「上傳＋後端驗證＋入庫」收斂成一次 API 呼叫（`POST /api/cases`），案件先落在 `REVIEW_REQUIRED` 或 `CLOSED`；後台複核時選「需補充資料」會過渡到 `REVIEW_NEED_INFO`，其餘四種複核結果都直接收斂為 `CLOSED`。畫面上方的「狀態：XXX」小標籤只是對照設計文件用的前端步驟名稱，並非後端持久化的狀態欄位。
- **離線補傳**：用瀏覽器 `localStorage` 佇列＋手動「模擬離線」開關，取代真正的裝置離線偵測。背景同步時，為了讓整批補傳不被單一重複帳單卡住，一律以 `save_anyway=true` 重新送出（真正實作時，這裡應該讓稽查員或後台明確處理每一筆補傳的重複警示，而不是自動略過）。
- **帳單編號格式**：只支援範例 `Q7028435D095253` 對應的月份 1 碼（1–9）＋日期 2 碼＋開單員編號 5 碼＋時間 6 碼；10、11、12 月的編碼方式原始設計文件未定義，`business_rules.py` 裡有明確標註此限制，正式開發前需與需求方確認。
- ~~**管理人員／系統管理員合併為一個登入**~~（已拆分，見下方「後台角色分權」章節）：現在 `admin_users` 有 `role` 欄位，`manager01`（管理人員）與 `sysadmin01`（系統管理員）各自登入、各自的 JWT 角色，後端每個 `/api/admin/*` 端點依角色分別以 `require_manager` / `require_sysadmin` 把關，前端也只顯示該角色可用的分頁。
- **權限/驗證**：（已強化，見下方「生產環境強化」章節）登入回傳的是正式的簽章 JWT，所有非公開端點都有伺服器端 `require_inspector` / `require_admin` 中介層驗證與角色分權；密碼以 bcrypt 雜湊儲存、CORS 改為白名單。仍待處理：JWT 尚無 refresh／撤銷（登出僅前端清除 token）、稽查員與管理員 JWT 皆為單一密鑰 HS256、尚未加上速率限制與上傳檔案大小限制。
- **系統參數僅示範一項**：目前只有「開單逾時門檻」是真正端到端可調整、會影響判定計算的參數，用來示範「判定規則」這個概念；沒有為了湊數而加其他假的開關。

## 生產環境強化（已完成）

這一批改動把原型往「可上線」推進了一步，涵蓋四個項目：

1. **密碼儲存**：改用 **bcrypt** 加鹽雜湊（`app/security.py`），資料庫 `password` 欄位存的是 `$2b$...` 雜湊而非明碼；`seed.py` 建立示範帳號時即雜湊。示範帳密：`insp01/pass123`、`manager01/manager123`、`sysadmin01/sysadmin123`。
2. **登入 Session**：登入回傳 **簽章 JWT**（HS256，含 `sub`／`role`／`exp`），取代原本的 `base64(username)`。效期由 `JWT_EXPIRE_MINUTES` 控制（預設 12 小時）。
3. **端點權限驗證**：新增 `require_inspector` / `require_admin` 相依，**每一個非公開端點**都會驗證 Bearer token 與角色——後台 `/api/admin/*` 不再是「裸奔」狀態。同時 `/api/cases` 只回傳登入者本人的案件、儲存案件時 `inspector_username` 一律取自 token（不信任前端傳入值）。
4. **資料庫**：以 **SQLAlchemy + Alembic** 取代原生 `sqlite3`，同一套模型可跑 SQLite（本機/測試）或 **PostgreSQL**（部署，`docker compose` 已內含 `db` 服務）。schema 由 `alembic upgrade head` 建立（容器啟動時自動執行）。
5. **CORS**：由 `*` 萬用字元改為 `CORS_ALLOW_ORIGINS` 環境變數的**白名單**。

**部署前務必設定的環境變數**（見 `backend/.env.example`）：`JWT_SECRET`（必須換成長隨機字串，否則啟動時會印出警告）、`DATABASE_URL`、`CORS_ALLOW_ORIGINS`。

> 尚未涵蓋（後續工作）：JWT refresh／登出撤銷、HTTPS/TLS 終結、API 速率限制、上傳檔案大小/類型限制、稽查員與管理員以不同密鑰或非對稱簽章分離、稽核日誌。

### 後台角色分權（已實作）

設計文件把後台列為兩個不同角色，原型原本合併為一組帳號；現在已依角色拆分：

- **資料模型**：`admin_users` 新增 `role` 欄位（`manager` | `sysadmin`），由 Alembic migration `0002_admin_role` 建立。
- **兩組帳號**：`manager01`（管理人員）、`sysadmin01`（系統管理員），各自登入。
- **JWT 帶角色**：`/api/admin/login` 依帳號角色簽發帶 `role` 的 token。
- **端點分權**：`require_manager` 守 `複核佇列／案件查詢／統計／CSV 匯出`；`require_sysadmin` 守 `稽查員帳號／路段／系統設定`。兩者互不越權（跨角色呼叫回 403）。
- **前端分頁**：後台只顯示登入角色可用的分頁（管理人員三個、系統管理員三個），並非只是隱藏——對應 API 在後端一樣會擋。

### QR 查詢網站串接（已實作）

設計文件的循序圖中，行動 APP 掃描停車單 QR Code（其內容是一個指向外部「查詢網站」的網址），後端抓取該頁並解析出帳單資料。這條路徑已從純示範改為真實管線（`backend/app/qr_service.py`）：

- **兩種解析來源**：(1) 內建示範代碼（`QR-A1001…`，`QR_DEMO_MODE` 開啟時免連線，供展示/測試）；(2) 真實網址——後端實際以 HTTP 抓取並解析。
- **解析格式**：同時支援 **JSON** 與**帶標籤的 HTML/文字頁**（`帳單編號：…`、`停車開始時間：…`），並會把「只有時間」的欄位（如 `11:40`）與停車日期組成 ISO 時間，交給既有判定邏輯。
- **SSRF 防護（重要）**：因為要抓取的網址來自被掃描的 QR（不可信），後端只會抓取**主機在白名單內**（`QR_QUERY_ALLOWED_HOSTS`）、且非私有/loopback/保留位址（防 DNS rebinding）、scheme 為 http(s)、且不跟隨轉址的網址。**白名單預設為空 = 完全關閉真實抓取**，確保預設情況下後端絕不會去抓 QR 提供的任意網址；正式環境把真實查詢站主機加入白名單即可啟用。
- **本地示範用查詢站**：`GET /mock-qr-site/{token}` 會回傳一個擬真的停車單 HTML 頁（`QR_MOCK_SITE_ENABLED`，正式環境請關閉），讓「掃描網址 → 後端抓取 → 解析」整條路徑可在本機端到端實測。
- **前端無需改動**：相機解碼後把內容送到 `/api/qr/scan`，回傳格式（`success`／`fetch_failed`／`scan_failed`）不變。

相關環境變數見 `backend/.env.example` 的「QR query site」區塊。

### 自動化測試

後端有一組 `pytest` 測試（`backend/tests/`，共 59 個測試），涵蓋上述強化項目：密碼 bcrypt 雜湊且資料庫無明碼、JWT 登入成功/失敗、缺少/偽造/過期 token、稽查員／管理人員／系統管理員三方角色分權（含管理人員↔系統管理員互不越權）、儲存案件時 `inspector_username` 取自 token、GPS 座標存取（含未提供時為 null）、重複偵測 409／`save_anyway`、案件列表僅限本人、管理員 CRUD、CSV 匯出、「逾時門檻」設定會端到端改變判定結果，以及 QR 查詢串接（示範代碼、真實 JSON／HTML 解析、抓取逾時、以及 SSRF 白名單防護）。每個測試都用獨立、重新 seed 的 SQLite 資料庫，彼此不干擾。

執行方式：

```bash
cd prototype/backend
pip install -r requirements.txt -r requirements-dev.txt
pytest
```

## 已完成的驗證

- 後端：以腳本涵蓋稽查員登入成功/失敗/無權限、地點清單、三種 QR 情境、四種判定情境（符合/逾時/資料異常/格式錯誤）、重複偵測與 `save_anyway` 覆寫、含照片上傳的完整儲存、案件列表查詢；另外針對後台新增了管理員登入、路段 CRUD（含連動更新稽查員 APP 地點清單）、系統設定調整並確認會即時改變判定結果（OVERDUE ↔ COMPLIANT）、稽查員帳號 CRUD 與權限切換、複核佇列的 `NEED_INFO → CONFIRMED → CLOSED` 兩階段複核流程、重複複核已結案案件會被拒絕（400）、統計 API、CSV 匯出，全數通過；並重新跑過一次原本的稽查員流程測試確認沒有因為這次改動而壞掉（regression 測試）。
- 前端：`npm run build`、`oxlint` 皆無錯誤（含新增的後台程式碼、`lucide-react` 圖示與 `recharts` 圖表庫）；已在本機同時啟動後端與 `vite` dev server，確認 `/` 與 `/admin` 兩條路徑都能正確載入（含 SPA fallback）、`/api/admin/stats` 回傳的資料形狀與圖表元件預期一致、所有新模組（含 `recharts`）都能被瀏覽器正確解析與預先打包。
- **相機 QR 掃描**：`npm run build` 確認 `qr-scanner` 的 web worker 被 Vite 正確拆成獨立 chunk（不需要手動設定 `WORKER_PATH`）；用 `scripts/generate-demo-qr.mjs` 產生的 6 張示範 QR PNG，另外用 Python + OpenCV（與 `qr-scanner` 完全獨立的解碼器）逐一重新解碼，確認每張圖片解碼出的文字都與預期代碼（`QR-A1001` 等）完全一致，證明圖片本身是有效、正確編碼的 QR Code；後端 `/api/qr/scan` 邏輯未變動，重新測試過所有既有情境仍正常。**但因執行環境沒有瀏覽器（見下一點），無法實際測試「用真實相機對著畫面掃描」這個互動流程本身**——請依「Demo QR Code」章節的方式，用手機實際掃描 `/demo-qr.html` 上的圖片做最終確認，特別留意相機權限詢問、掃描框對焦、以及在非 `localhost` 網址（例如區網 IP）下相機被瀏覽器封鎖的情況。
- 因執行環境沒有可用的系統層級瀏覽器相依套件（無 root 權限安裝 Playwright/Chromium 所需的系統函式庫），沒有進行真實瀏覽器的點擊路徑自動化測試；建議實際安裝後，人工跑兩條路徑做最終確認：稽查員 APP 的「登入 → 相機掃描（或 QR-A1001 示範按鈕）→ 確認 → 查看判定 → 拍照 → 觸發重複警示 → 仍然儲存」，以及後台的「登入 → 複核佇列處理一筆案件（含 NEED_INFO 兩階段）→ 統計資料 → 案件查詢匯出 CSV → 路段管理新增/刪除 → 系統設定調整門檻後回稽查員 APP 驗證判定改變」。
- **Docker：尚未實機驗證**。撰寫環境本身沒有 Docker，所以 `docker-compose.yml`、兩個 `Dockerfile`、`nginx.conf` 只做了 YAML 語法檢查與人工核對路徑/環境變數是否對得起來，沒有真的跑過 `docker compose up --build`。這是這次交付裡風險最高、最需要你在自己機器上第一個測試的部分。
