export default function Spinner({ label }) {
  return (
    <div className="spinner-row">
      <span className="spinner" />
      {label && <span>{label}</span>}
    </div>
  );
}
