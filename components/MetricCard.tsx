export function MetricCard({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <section className="card">
      <p className="eyebrow">{label}</p>
      <div className="stat">{value}</div>
      <p className="muted">{detail}</p>
    </section>
  );
}
