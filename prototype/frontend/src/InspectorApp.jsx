import { useEffect, useRef, useState } from "react";
import { ParkingCircle, LogOut, ArrowLeft, Save, Loader2, PartyPopper, ListChecks, ShieldHalf } from "lucide-react";
import "./styles.css";
import { api, ApiError, clearAuthToken } from "./api";
import { loadQueue, enqueue, removeFromQueue } from "./offlineQueue";

import Login from "./components/Login";
import PermissionCheck from "./components/PermissionCheck";
import LocationSelect from "./components/LocationSelect";
import AcquireStep from "./components/AcquireStep";
import ConfirmForm from "./components/ConfirmForm";
import JudgmentBanner from "./components/JudgmentBanner";
import PhotoCapture from "./components/PhotoCapture";
import DuplicateModal from "./components/DuplicateModal";
import OfflineBar from "./components/OfflineBar";
import CaseList from "./components/CaseList";
import StepBadge from "./components/StepBadge";
import StepProgress from "./components/StepProgress";
import DraftSummary from "./components/DraftSummary";
import { wizardIndex } from "./wizardSteps";
import { sourceLabel } from "./format";

const STEP_STATE_LABEL = {
  permission: "檢查權限中",
  list: "待命中",
  location: "已選擇地點",
  qr: "取得停車單資料中",
  confirm: "確認資料中",
  judgment: "計算開單時效中",
  photo: "已拍照存證",
  save: "準備儲存",
  done: "已結案／待複核",
};

const emptyDraft = () => ({
  district: null,
  road: null,
  spot_no: null,
  gps_lat: null,
  gps_lng: null,
  scanResult: null,
  fields: null,
  manualCorrected: false,
  originalValues: null,
  judgmentPreview: null,
  photo_base64: null,
  photo_filename: null,
});

export default function InspectorApp() {
  const [inspector, setInspector] = useState(null);
  const [step, setStep] = useState("login");
  const [draft, setDraft] = useState(emptyDraft());
  // Real network status from the browser (Blocker 7): seed from
  // navigator.onLine and keep it in sync with the online/offline events instead
  // of a purely manual switch. The header toggle stays as a manual override so
  // "offline" can still be forced for a demo, but real connectivity changes now
  // drive the state on their own.
  const [online, setOnline] = useState(
    () => (typeof navigator !== "undefined" ? navigator.onLine : true)
  );
  const [queue, setQueue] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState(null);
  const [saveMessage, setSaveMessage] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  // Furthest wizard step reached for the current case, so the stepper tab bar
  // can offer jump-back / jump-forward navigation among visited steps while
  // locking the ones the inspector hasn't unlocked yet.
  const [maxStep, setMaxStep] = useState(0);

  // Bump the reached watermark whenever the flow advances into a wizard step.
  useEffect(() => {
    const idx = wizardIndex(step);
    if (idx > maxStep) setMaxStep(idx);
  }, [step, maxStep]);

  function handleJump(key) {
    if (wizardIndex(key) <= maxStep) setStep(key);
  }

  // Keep a stable ref to the latest sync function so the (mount-once) network
  // listeners can trigger a flush without re-subscribing every render.
  const syncNowRef = useRef(null);

  useEffect(() => {
    setQueue(loadQueue());
  }, []);

  // Track real connectivity and auto-flush the offline queue on reconnect.
  useEffect(() => {
    function goOnline() {
      setOnline(true);
      syncNowRef.current?.();
    }
    function goOffline() {
      setOnline(false);
    }
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  function buildPayload() {
    return {
      ticket_no: draft.fields.ticket_no,
      district: draft.district,
      road: draft.road,
      spot_no: draft.spot_no,
      gps_lat: draft.gps_lat,
      gps_lng: draft.gps_lng,
      plate_no: draft.fields.plate_no,
      amount: draft.fields.amount,
      due_date: draft.fields.due_date,
      parking_date: draft.fields.parking_date,
      parking_start: draft.fields.parking_start,
      parking_end: draft.fields.parking_end,
      data_source: draft.scanResult.dataSource,
      manual_corrected: draft.manualCorrected,
      original_values: draft.originalValues,
      inspector_username: inspector.username,
      photo_base64: draft.photo_base64,
      photo_filename: draft.photo_filename,
    };
  }

  async function handleSave() {
    setSaving(true);
    setSaveMessage(null);
    const payload = buildPayload();

    if (!online) {
      enqueue(payload);
      setQueue(loadQueue());
      setSaveMessage({ type: "info", text: "目前無網路，案件已於本機暫存 (PENDING_UPLOAD)，待網路恢復後自動補傳。" });
      setSaving(false);
      setStep("done");
      return;
    }

    try {
      const saved = await api.createCase(payload);
      setSaveMessage({ type: "success", text: `案件已儲存並入庫，狀態：${saved.status}` });
      setRefreshKey((k) => k + 1);
      setStep("done");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setDuplicateInfo(err.payload.existing_case);
      } else {
        setSaveMessage({ type: "error", text: "儲存失敗，請稍後再試。" });
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAnyway() {
    setSaving(true);
    try {
      const saved = await api.createCase({ ...buildPayload(), save_anyway: true });
      setSaveMessage({ type: "success", text: `已標記 DUPLICATE_WARNING 並儲存，狀態：${saved.status}` });
      setDuplicateInfo(null);
      setRefreshKey((k) => k + 1);
      setStep("done");
    } catch {
      setSaveMessage({ type: "error", text: "儲存失敗，請稍後再試。" });
    } finally {
      setSaving(false);
    }
  }

  function handleCancelDuplicate() {
    setDuplicateInfo(null);
    setSaveMessage({ type: "info", text: "已取消儲存 (CANCELLED)。" });
    setDraft(emptyDraft());
    setStep("list");
  }

  // Exposed to the network-status listener via a ref (assigned below) so a
  // reconnect can auto-flush the queue.
  async function handleSyncNow() {
    if (syncing) return;
    setSyncing(true);
    const items = loadQueue();
    for (const item of items) {
      try {
        // Simplification: on background sync we always resubmit with
        // save_anyway=true so a queued batch doesn't get stuck waiting for a
        // duplicate-resolution dialog. See PROTOTYPE.md.
        await api.createCase({ ...item.payload, offline_submitted: true, save_anyway: true });
        removeFromQueue(item.queueId);
      } catch {
        // leave it in the queue, try again next time
      }
    }
    setQueue(loadQueue());
    setRefreshKey((k) => k + 1);
    setSyncing(false);
  }
  // Refresh the ref every render so the network listener always calls the
  // latest closure (current queue/syncing state).
  syncNowRef.current = handleSyncNow;

  function startNewCase() {
    setDraft(emptyDraft());
    setSaveMessage(null);
    setMaxStep(0);
    setStep("qr");
  }

  if (step === "login") {
    return (
      <div className="app-shell centered">
        <Login onLoggedIn={(insp) => { setInspector(insp); setStep("permission"); }} />
        <a className="btn-link app-switch-link" href="/admin">
          <ShieldHalf size={13} /> 後台管理系統登入
        </a>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-icon">
            <ParkingCircle size={20} />
          </span>
          <div>
            <div>停車單稽查 APP</div>
            {inspector && <span className="inspector-name">{inspector.display_name}</span>}
          </div>
        </div>
        {inspector && (
          <div className="header-actions">
            <a className="btn-ghost" href="/admin">
              <ShieldHalf size={15} /> 後台管理
            </a>
            <button
              className="btn-ghost"
              onClick={() => { clearAuthToken(); setInspector(null); setStep("login"); setDraft(emptyDraft()); }}
            >
              <LogOut size={15} /> 登出
            </button>
          </div>
        )}
      </header>

      {inspector && (
        <OfflineBar
          online={online}
          onToggle={setOnline}
          pendingCount={queue.length}
          onSyncNow={handleSyncNow}
          syncing={syncing}
        />
      )}

      <main
        className={`app-main${step === "list" ? " app-main-wide" : ""}${
          wizardIndex(step) !== -1 ? " app-main-workspace" : ""
        }`}
      >
        <StepBadge state={STEP_STATE_LABEL[step]} />

        {step === "permission" && (
          <PermissionCheck inspector={inspector} onPassed={() => setStep("list")} />
        )}

        {step === "list" && (
          <CaseList inspector={inspector} refreshKey={refreshKey} onNewCase={startNewCase} />
        )}

        {wizardIndex(step) !== -1 && (
          <>
          <div className="case-workspace">
            {/* Desktop rail: vertical step nav + running draft summary. */}
            <div className="case-rail">
              <StepProgress step={step} maxIndex={maxStep} onJump={handleJump} orientation="vertical" />
              <DraftSummary draft={draft} online={online} />
            </div>

            <div className="case-stage">
              {step === "qr" && (
                <AcquireStep
                  onResult={(res) => {
                    setDraft((d) => ({ ...d, scanResult: res }));
                    setStep("location");
                  }}
                  onManualFallback={() => {
                    setDraft((d) => ({ ...d, scanResult: { status: "scan_failed", dataSource: "MANUAL_FROM_TICKET" } }));
                    setStep("location");
                  }}
                />
              )}

              {step === "location" && (
                <LocationSelect
                  initialDistrict={draft.district}
                  initialRoad={draft.road}
                  initialSpot={draft.spot_no}
                  onBack={() => setStep("qr")}
                  onSelected={(loc) => {
                    setDraft((d) => ({ ...d, ...loc }));
                    setStep("confirm");
                  }}
                />
              )}

              {step === "confirm" && (
                <ConfirmForm
                  scanResult={draft.scanResult}
                  savedFields={draft.fields}
                  onBack={() => setStep("location")}
                  onConfirmed={({ fields, manualCorrected, originalValues }) => {
                    setDraft((d) => ({ ...d, fields, manualCorrected, originalValues }));
                    setStep("judgment");
                  }}
                />
              )}

              {step === "judgment" && (
                <JudgmentBanner
                  fields={draft.fields}
                  onBack={() => setStep("confirm")}
                  onNext={(preview) => {
                    setDraft((d) => ({ ...d, judgmentPreview: preview }));
                    setStep("photo");
                  }}
                />
              )}

              {step === "photo" && (
                <PhotoCapture
                  initialBase64={draft.photo_base64}
                  initialFilename={draft.photo_filename}
                  onBack={() => setStep("judgment")}
                  onNext={({ photo_base64, photo_filename }) => {
                    setDraft((d) => ({ ...d, photo_base64, photo_filename }));
                    setStep("save");
                  }}
                />
              )}

              {step === "save" && (
                <div className="card">
                  <div className="card-icon-heading">
                    <span className="icon-badge">
                      <Save size={18} />
                    </span>
                    <h2>確認儲存</h2>
                  </div>
                  <ul className="kv-list">
                    <li><span>地點</span><span>{draft.district} {draft.road} {draft.spot_no}</span></li>
                    <li><span>帳單編號</span><span>{draft.fields.ticket_no}</span></li>
                    <li><span>車牌</span><span>{draft.fields.plate_no}</span></li>
                    <li><span>判定</span><span>{draft.judgmentPreview?.judgement}</span></li>
                    <li><span>資料來源</span><span>{sourceLabel(draft.scanResult.dataSource)}{draft.manualCorrected ? " (稽查員已修正)" : ""}</span></li>
                    <li><span>目前網路狀態</span><span>{online ? "有網路" : "無網路（將離線暫存）"}</span></li>
                  </ul>
                  <div className="button-row">
                    <button className="btn-secondary" onClick={() => setStep("photo")}>
                      <ArrowLeft size={15} /> 返回
                    </button>
                    <button className="btn-primary" disabled={saving} onClick={handleSave}>
                      {saving ? <Loader2 size={15} className="spin-icon" /> : <Save size={15} />}
                      {saving ? "處理中…" : "確認儲存"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Mobile: fixed bottom step tab bar (hidden on desktop, where the
              vertical rail takes over). Tap a reached step to jump. */}
          <StepProgress step={step} maxIndex={maxStep} onJump={handleJump} orientation="bottom" />
          </>
        )}

        {step === "done" && (
          <div className="card">
            <div className="card-icon-heading">
              <span className="icon-badge">
                <PartyPopper size={18} />
              </span>
              <h2>完成</h2>
            </div>
            {saveMessage && <div className={`info-box ${saveMessage.type}`}>{saveMessage.text}</div>}
            <button className="btn-primary btn-block" onClick={() => { setDraft(emptyDraft()); setStep("list"); }}>
              <ListChecks size={15} /> 回到案件列表
            </button>
          </div>
        )}
      </main>

      {duplicateInfo && (
        <DuplicateModal
          existingCase={duplicateInfo}
          saving={saving}
          onSaveAnyway={handleSaveAnyway}
          onCancel={handleCancelDuplicate}
        />
      )}
    </div>
  );
}
