// Declarative definition of every user flow the manual documents.
//
// Each step is one SCREEN: `arrive(page)` performs whatever interaction is
// needed to reach and settle on that screen; the capture harness then takes a
// screenshot. The `title` / `desc` / `tip` become the manual copy, so keep
// them written for an end user (zh-TW), not for a developer.
import { BASE_URL, DEMO_TICKET } from "./config.mjs";

// --- small locator helpers -------------------------------------------------
const btn = (page, name, exact = false) => page.getByRole("button", { name, exact });
const heading = (page, name) => page.getByRole("heading", { name }).first();
const waitHeading = (page, name) => heading(page, name).waitFor({ timeout: 20000 });

async function closeModalIfOpen(page) {
  const close = page.locator(".modal-overlay .btn-icon-only");
  if (await close.count()) {
    await close.first().click();
    await page.locator(".modal-overlay").waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});
  }
}

// ===========================================================================
export const flows = [
  // -------------------------------------------------------------------------
  {
    id: "inspector",
    title: "稽查員 APP：完整開單流程",
    subtitle: "從登入到案件入庫，稽查員在現場的每一步操作。",
    actor: "稽查員（手機）",
    device: "mobile",
    account: "insp01 / pass123",
    intro:
      "稽查員 APP 以「一次一步」的精靈式流程設計，讓現場人員即使單手操作、" +
      "在陽光下或網路不穩的環境，也能依序完成一張停車單的稽查與存證。以下示範" +
      "以「開單逾時」情境（示範 QR 代碼 QR-A1002）走完整條流程。",
    steps: [
      {
        key: "login",
        title: "登入稽查員 APP",
        desc:
          "開啟 APP 後首先進行身分驗證。輸入配發的稽查員帳號與密碼並點選「登入」。" +
          "系統會回傳該帳號是否具備稽查權限，作為後續流程的第一道關卡。",
        tip: "示範帳號 insp01 / pass123（具稽查權限）。若使用 insp02 則會示範「無權限」被擋下的情境。",
        async arrive(page) {
          await page.goto(BASE_URL + "/", { waitUntil: "networkidle" });
          await waitHeading(page, "停車單稽查 APP");
        },
      },
      {
        key: "permission",
        title: "系統檢查稽查權限",
        desc:
          "登入後，系統自動檢查帳號權限、相機、定位與網路狀態。通過後顯示歡迎訊息，" +
          "點選「開始稽查」即進入待命畫面。若帳號無稽查權限，此處會直接擋下並提示聯繫管理員。",
        async arrive(page) {
          await btn(page, "登入").click();
          await waitHeading(page, "權限檢查通過");
        },
      },
      {
        key: "list",
        title: "案件列表（待命）",
        desc:
          "此畫面列出目前稽查員已建立的案件，並顯示帳單編號、地點、判定、狀態與來源等欄位。" +
          "要開立新案件，點選右上角「新增稽查案件」。",
        tip: "在桌面寬度下會以表格呈現；在手機上會自動轉為易讀的卡片式版面。",
        async arrive(page) {
          await btn(page, "開始稽查").click();
          await waitHeading(page, "我的稽查案件");
        },
      },
      {
        key: "acquire",
        title: "取得停車單資料（掃描 QR / 拍照辨識）",
        desc:
          "取得停車單資料有兩種方式：掃描停車單上的 QR Code，或改用「拍照辨識」以 OCR 讀取。" +
          "若沒有相機或要測試特定情境，可直接點選下方的示範 QR 代碼。也可選「直接人工輸入帳單資料」。",
        tip: "示範以 QR-A1002（成功讀取・開單逾時）進入，用來走完需複核的完整流程。",
        async arrive(page) {
          await btn(page, "新增稽查案件").click();
          await waitHeading(page, "掃描停車單 QR Code");
        },
      },
      {
        key: "location",
        title: "選擇稽查地點",
        desc:
          "確認稽查發生的行政區、路段與停車格編號。行政區可搜尋選取，路段與停車格支援輸入與建議清單。" +
          "系統同時取得 GPS 輔助定位座標（供後台地圖分析使用），完成後點選「下一步：確認資料」。",
        async arrive(page) {
          await btn(page, /QR-A1002/).click();
          await waitHeading(page, "選擇稽查地點");
        },
      },
      {
        key: "confirm",
        title: "確認資料內容",
        desc:
          "系統已將 QR 查詢頁的帳單資料自動帶入（帳單編號、車牌、金額、繳費期限、停車起訖時間等）。" +
          "稽查員核對無誤即可送出；若現場發現需修正，直接編輯欄位——系統會標記本案為「人工修正」並保留原始值供稽核。",
        async arrive(page) {
          await btn(page, /下一步：確認資料/).click();
          await waitHeading(page, "確認資料內容");
        },
      },
      {
        key: "judgment",
        title: "開單時效判定",
        desc:
          "系統解析帳單編號、計算開單時間差，並依後台設定的逾時門檻自動判定結果——" +
          "符合規定、開單逾時、資料異常或格式錯誤。非「符合規定」的案件會標記為需後台複核。確認後點選「繼續：拍照存證」。",
        tip: "判定門檻（例如逾時分鐘數）由系統管理員在後台「系統設定」調整，此處即時套用。",
        async arrive(page) {
          await btn(page, /確認資料，計算開單時效/).click();
          await waitHeading(page, "開單時效判定");
        },
      },
      {
        key: "photo",
        title: "拍攝佐證照片",
        desc:
          "拍攝或選取一張停車單照片作為稽查佐證（原型以檔案選取模擬拍照）。照片會隨案件一併存檔，" +
          "作為日後複核與申訴處理的依據。選好後點選「下一步：確認儲存」。",
        async arrive(page) {
          await btn(page, /繼續：拍照存證/).click();
          await waitHeading(page, "拍攝停車單照片作為佐證");
          await page.locator('input[type="file"]').setInputFiles(DEMO_TICKET);
          await page.locator("img.photo-preview").waitFor({ timeout: 10000 });
        },
      },
      {
        key: "save",
        title: "確認儲存",
        desc:
          "送出前的最後檢視：地點、帳單編號、車牌、判定結果、資料來源與目前網路狀態一次確認。" +
          "點選「確認儲存」即送出。若目前無網路，案件會在本機暫存（PENDING_UPLOAD），待網路恢復後自動補傳。",
        async arrive(page) {
          await btn(page, /下一步：確認儲存/).click();
          await waitHeading(page, "確認儲存");
        },
      },
      {
        key: "done",
        title: "完成",
        desc:
          "案件已入庫並顯示其狀態（例如需複核的案件為「待複核」）。若儲存時偵測到重複帳單，" +
          "系統會跳出重複警示讓稽查員決定是否仍要儲存。點選「回到案件列表」可開始下一件。",
        async arrive(page) {
          await btn(page, "確認儲存", true).click();
          await waitHeading(page, "完成");
        },
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "admin",
    title: "後台管理（管理人員）：複核、查詢與統計",
    subtitle: "管理人員審核案件、查詢資料並檢視數據分析。",
    actor: "管理人員（桌面）",
    device: "desktop",
    account: "manager01 / manager123",
    intro:
      "「管理人員」角色負責案件的後端把關：複核需審核的案件、查詢與匯出資料，" +
      "以及透過統計儀表板掌握整體稽查狀況（含 3D 地圖熱區分析）。以下為其日常操作流程。",
    steps: [
      {
        key: "login",
        title: "登入後台管理系統",
        desc:
          "於 /admin 進入後台。輸入管理人員帳號密碼登入。後台依角色分權：管理人員可用「複核佇列 / 案件查詢 / 統計資料」，" +
          "系統管理員則負責帳號、路段與系統設定。",
        tip: "示範帳號 manager01 / manager123（管理人員）。",
        async arrive(page) {
          await page.goto(BASE_URL + "/admin", { waitUntil: "networkidle" });
          await waitHeading(page, "後台管理系統");
        },
      },
      {
        key: "queue",
        title: "待複核佇列",
        desc:
          "開單逾時、資料異常、重複帳單、以及人工輸入 / 人工修正的案件會自動集中於此，等待複核。" +
          "清單顯示帳單編號、地點、判定、狀態、是否重複、稽查員與建立時間；點選案件右側「複核」開啟詳情。",
        async arrive(page) {
          await btn(page, "登入").click();
          await waitHeading(page, "待複核佇列");
        },
      },
      {
        key: "review",
        title: "複核案件詳情",
        desc:
          "案件詳情彈窗完整呈現該案的所有欄位、判定結果與佐證照片。管理人員可在此填寫複核結論" +
          "（結案 / 需補充資料等）並送出，也可編輯或刪除資料。複核結果會即時回寫案件狀態。",
        async arrive(page) {
          // Exact match: "複核" as a substring would also match the "複核佇列" tab.
          await btn(page, "複核", true).first().click();
          await page.locator(".modal-card").waitFor({ timeout: 10000 });
          await page.getByText(/案件詳情/).first().waitFor();
        },
      },
      {
        key: "search",
        title: "案件查詢與匯出",
        desc:
          "「案件查詢」提供跨全庫的檢索：可依行政區、稽查員、日期或帳單編號 / 車牌關鍵字過濾，" +
          "並支援「匯出 CSV」批次下載。每列可點「檢視」開啟與複核相同的詳情彈窗。",
        async arrive(page) {
          await closeModalIfOpen(page);
          await btn(page, "案件查詢").click();
          await waitHeading(page, "案件查詢");
        },
      },
      {
        key: "stats",
        title: "統計儀表板",
        desc:
          "統計資料頁彙整關鍵指標（總案件數、待複核、重複帳單、平均開單時間差、逾時率），" +
          "並以多種圖表呈現：每日趨勢、判定結果、案件狀態、開單時段、時間差分佈、依行政區 / 稽查員 / 資料來源等。",
        async arrive(page) {
          await closeModalIfOpen(page);
          await btn(page, "統計資料").click();
          await page.getByText("總案件數").first().waitFor({ timeout: 15000 });
          await page.waitForTimeout(4500); // let base-map tiles + 3D columns render
        },
      },
      {
        key: "map",
        title: "3D 熱區地圖與操作面板",
        desc:
          "案件分佈以 3D 熱區地圖呈現，柱體高度與顏色代表各區域案件密度。點選左上角設定鈕可開啟操作面板，" +
          "切換「六角密度 / 判定散點」視覺化模式、篩選判定類別、調整聚合半徑與柱體高度，並切換深色 / 淺色底圖。",
        tip: "面板底部即時顯示「顯示 N / M 筆定位案件」，方便鎖定想分析的資料範圍。",
        async arrive(page) {
          await page.locator(".map3d-wrap").scrollIntoViewIfNeeded();
          await page.waitForTimeout(600);
          await page.getByRole("button", { name: "地圖設定" }).click();
          await page.locator(".map3d-hud").waitFor({ timeout: 8000 });
          await page.waitForTimeout(600);
        },
      },
    ],
  },

  // -------------------------------------------------------------------------
  {
    id: "sysadmin",
    title: "後台管理（系統管理員）：帳號、路段與系統設定",
    subtitle: "系統管理員維護基礎資料與判定規則。",
    actor: "系統管理員（桌面）",
    device: "desktop",
    account: "sysadmin01 / sysadmin123",
    intro:
      "「系統管理員」角色負責系統的基礎維運：稽查員帳號與權限、可稽查的路段 / 停車格清單，" +
      "以及影響全系統判定的參數規則。這些設定會即時套用到稽查員 APP 與管理人員的複核作業。",
    steps: [
      {
        key: "accounts",
        title: "稽查員帳號權限管理",
        desc:
          "以系統管理員身分登入後，預設進入「帳號管理」。可新增稽查員、設定顯示名稱與是否具稽查權限，" +
          "或輪換既有帳號的密碼。無稽查權限的帳號在 APP 端會於權限檢查步驟被擋下。",
        tip: "示範帳號 sysadmin01 / sysadmin123（系統管理員）。",
        async arrive(page) {
          await page.goto(BASE_URL + "/admin", { waitUntil: "networkidle" });
          await waitHeading(page, "後台管理系統");
          await page.getByLabel("帳號").fill("sysadmin01");
          await page.getByLabel("密碼").fill("sysadmin123");
          await btn(page, "登入").click();
          await waitHeading(page, "稽查員帳號權限管理");
        },
      },
      {
        key: "locations",
        title: "路段 / 停車格管理",
        desc:
          "維護稽查員 APP「選擇稽查地點」步驟所使用的行政區、路段與停車格清單。" +
          "在此新增或移除路段 / 停車格，稽查員端的建議清單會同步更新。",
        async arrive(page) {
          await btn(page, "路段管理").click();
          await waitHeading(page, "路段 / 停車格管理");
        },
      },
      {
        key: "settings",
        title: "系統參數 / 判定規則設定",
        desc:
          "設定影響全系統的判定規則，例如「開單逾時門檻（分鐘）」。調整後，稽查員 APP 的開單時效判定會" +
          "立即依新門檻計算——同一張停車單可能因門檻改變而由「開單逾時」變為「符合規定」。",
        async arrive(page) {
          await btn(page, "系統設定").click();
          await waitHeading(page, "系統參數 / 判定規則設定");
        },
      },
    ],
  },
];
