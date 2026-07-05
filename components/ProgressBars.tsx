import type { ProgressMetric } from "@/lib/types";

export function ProgressBars({ metrics }: { metrics: ProgressMetric[] }) {
  const values = metrics.map((metric) => metric.value ?? 0);
  const max = Math.max(10, ...values);

  return (
    <div className="chart" aria-label="Progress metrics chart">
      {metrics.slice(-8).map((metric) => (
        <div
          className="bar"
          key={metric.id}
          title={`${metric.metric_name ?? "Metric"} ${metric.value ?? 0}${metric.unit ?? ""}`}
          style={{ height: `${Math.max(12, ((metric.value ?? 0) / max) * 140)}px` }}
        />
      ))}
    </div>
  );
}
