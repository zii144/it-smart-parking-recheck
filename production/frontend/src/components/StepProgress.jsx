const STEPS = [
  { key: "location", label: "地點" },
  { key: "qr", label: "掃描" },
  { key: "confirm", label: "確認" },
  { key: "judgment", label: "判定" },
  { key: "photo", label: "拍照" },
  { key: "save", label: "儲存" },
];

// Visual stepper for the new-case wizard (location -> qr -> confirm ->
// judgment -> photo -> save). Not shown outside that flow (login/permission/
// list/done have their own screens).
export default function StepProgress({ step }) {
  const currentIndex = STEPS.findIndex((s) => s.key === step);
  if (currentIndex === -1) return null;

  return (
    <div>
      <div className="step-progress">
        {STEPS.map((s, i) => (
          <div key={s.key} className={`step ${i < currentIndex ? "done" : ""} ${i === currentIndex ? "current" : ""}`}>
            <div className="step-circle">{i + 1}</div>
            {i < STEPS.length - 1 && <div className="step-line" />}
          </div>
        ))}
      </div>
      <div className="step-progress-labels">
        {STEPS.map((s) => (
          <span key={s.key}>{s.label}</span>
        ))}
      </div>
    </div>
  );
}
