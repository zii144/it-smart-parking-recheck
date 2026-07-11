import { Check } from "lucide-react";
import { WIZARD_STEPS, wizardIndex } from "../wizardSteps";

// Interactive stepper for the new-case wizard (取得 → 地點 → 確認 → 判定 →
// 拍照 → 儲存). Doubles as a tab bar: any already-reached step (index ≤
// maxIndex) is clickable so the inspector can jump back and forth; steps
// beyond the furthest reached are locked. Renders horizontally (mobile tab
// bar) or vertically (desktop rail) via `orientation`.
//
// Not shown outside the wizard (login/permission/list/done have their own
// screens).
export default function StepProgress({ step, maxIndex = 0, onJump, orientation = "horizontal" }) {
  const currentIndex = wizardIndex(step);
  if (currentIndex === -1) return null;

  return (
    <div className={`stepper stepper-${orientation}`} role="tablist" aria-label="開單步驟">
      {WIZARD_STEPS.map((s, i) => {
        const current = i === currentIndex;
        const reached = i <= maxIndex;
        const done = reached && !current;
        const locked = i > maxIndex;
        const clickable = reached && !current && typeof onJump === "function";

        const cls = [
          "stepper-item",
          done ? "done" : "",
          current ? "current" : "",
          locked ? "locked" : "",
          clickable ? "clickable" : "",
        ].filter(Boolean).join(" ");

        return (
          <button
            key={s.key}
            type="button"
            className={cls}
            role="tab"
            aria-selected={current}
            aria-current={current ? "step" : undefined}
            disabled={!clickable}
            onClick={clickable ? () => onJump(s.key) : undefined}
            title={locked ? "尚未能跳至此步驟" : s.label}
          >
            <span className="stepper-rail">
              <span className={`stepper-seg seg-before ${i === 0 ? "is-hidden" : ""} ${i <= currentIndex ? "is-active" : ""}`} />
              <span className="stepper-dot">{done ? <Check size={14} strokeWidth={3} /> : i + 1}</span>
              <span className={`stepper-seg seg-after ${i === WIZARD_STEPS.length - 1 ? "is-hidden" : ""} ${i < currentIndex ? "is-active" : ""}`} />
            </span>
            <span className="stepper-label">{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}
