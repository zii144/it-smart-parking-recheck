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
// list/done have their own screens). Each item is an equal-width column so the
// circle and its label stay vertically aligned; the segments beside a circle
// are the connector lines (hidden at the two ends).
export default function StepProgress({ step }) {
  const currentIndex = STEPS.findIndex((s) => s.key === step);
  if (currentIndex === -1) return null;

  return (
    <div className="stepper">
      {STEPS.map((s, i) => {
        const done = i < currentIndex;
        const current = i === currentIndex;
        return (
          <div key={s.key} className={`stepper-item ${done ? "done" : ""} ${current ? "current" : ""}`}>
            <div className="stepper-rail">
              <span className={`stepper-seg ${i === 0 ? "is-hidden" : ""} ${i <= currentIndex ? "is-active" : ""}`} />
              <span className="stepper-dot">{i + 1}</span>
              <span className={`stepper-seg ${i === STEPS.length - 1 ? "is-hidden" : ""} ${i < currentIndex ? "is-active" : ""}`} />
            </div>
            <span className="stepper-label">{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}
