// Small developer aid: surfaces the current step using the same state names
// as the state-machine diagram in the project README, so it's easy to see
// which part of the design this screen corresponds to.
export default function StepBadge({ state }) {
  if (!state) return null;
  return <div className="step-badge">狀態：{state}</div>;
}
