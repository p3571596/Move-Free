import { buildTrendPoints } from "@/lib/pilot-insights";
import { formatDate } from "@/lib/format";
import type { DailyCheckin, ExerciseAdherenceLog } from "@/lib/types";

export function PilotTrendCharts({ checkins, logs, compact = false }: { checkins: DailyCheckin[]; logs: ExerciseAdherenceLog[]; compact?: boolean }) {
  const points = buildTrendPoints(checkins, logs);
  if (!points.length) return <p className="muted">Trends will appear after the first check-in or exercise session.</p>;

  return (
    <div className={`pilot-trends${compact ? " compact" : ""}`}>
      <Trend title="Pain" points={points.map((point) => ({ date: point.date, value: point.pain }))} max={10} tone="pain" />
      <Trend title="Exercise completion" points={points.map((point) => ({ date: point.date, value: point.adherence }))} max={100} suffix="%" tone="adherence" />
      <Trend title="Confidence / function" points={points.map((point) => ({ date: point.date, value: point.confidence }))} max={10} tone="confidence" />
      <div className="trend-context">
        <p className="eyebrow">Context from the patient</p>
        <ul className="list">
          {points.flatMap((point) => point.comments.map((comment, index) => ({ id: `${point.date}-${index}`, date: point.date, comment }))).slice(-5).reverse().map((item) => (
            <li className="list-item" key={item.id}><strong>{formatDate(item.date)}</strong><p>{item.comment}</p></li>
          ))}
        </ul>
        {!points.some((point) => point.comments.length) ? <p className="muted">No patient comments in this period.</p> : null}
      </div>
    </div>
  );
}

function Trend({ title, points, max, suffix = "", tone }: { title: string; points: Array<{ date: string; value: number | null }>; max: number; suffix?: string; tone: string }) {
  const available = points.filter((point) => point.value != null);
  return (
    <section className="mini-trend" aria-label={`${title} over the last 14 days`}>
      <div className="section-header"><h4>{title}</h4><small>{available.length ? `${available.at(-1)!.value}${suffix} latest` : "No entries"}</small></div>
      <div className="mini-trend-bars">
        {points.map((point) => (
          <div className="mini-trend-column" key={`${title}-${point.date}`} title={`${formatDate(point.date)}: ${point.value ?? "No entry"}${point.value == null ? "" : suffix}`}>
            <span className={`mini-trend-bar trend-${tone}`} style={{ height: point.value == null ? 2 : `${Math.max(5, Math.min(100, point.value / max * 100))}%` }} />
            <small>{new Date(`${point.date}T12:00:00`).toLocaleDateString(undefined, { month: "numeric", day: "numeric" })}</small>
          </div>
        ))}
      </div>
    </section>
  );
}
