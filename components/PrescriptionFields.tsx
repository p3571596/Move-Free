"use client";
import {
  fieldLabels,
  type Prescription,
  type PrescriptionField,
} from "@/lib/prescription";
export function PrescriptionFields({
  value,
  onChange,
  prefix,
  disabled = false,
}: {
  value: Prescription;
  onChange: (p: Prescription) => void;
  prefix: string;
  disabled?: boolean;
}) {
  const field = (key: PrescriptionField) => (
    <label className="field" key={key} htmlFor={`${prefix}-${key}`}>
      {fieldLabels[key]}
      {key === "instructions" || key === "cues" ? (
        <textarea
          id={`${prefix}-${key}`}
          disabled={disabled}
          maxLength={key === "instructions" ? 4000 : 2000}
          value={value[key]}
          onChange={(e) => onChange({ ...value, [key]: e.target.value })}
        />
      ) : (
        <input
          id={`${prefix}-${key}`}
          disabled={disabled}
          maxLength={300}
          placeholder={
            [
              "name",
              "instructions",
              "cues",
              "equipment",
              "category",
              "type",
            ].includes(key)
              ? ""
              : "Not specified"
          }
          value={value[key]}
          onChange={(e) => onChange({ ...value, [key]: e.target.value })}
        />
      )}
    </label>
  );
  return (
    <div className="form">
      {field("name")}
      {field("instructions")}
      {field("cues")}
      <div className="grid two">
        {field("equipment")}
        {field("category")}
      </div>
      <fieldset className="form">
        <legend>FITT prescription</legend>
        {field("frequency")}
        {field("intensity")}
        <strong>Time · complete only relevant fields</strong>
        <div className="grid two">
          {(
            ["sets", "reps", "hold", "duration", "rest"] as PrescriptionField[]
          ).map(field)}
        </div>
        {field("type")}
      </fieldset>
    </div>
  );
}
export function PrescriptionSummary({ value }: { value: Prescription }) {
  const time = [
    value.sets && `${value.sets} sets`,
    value.reps && `${value.reps} reps`,
    value.hold && `Hold: ${value.hold}`,
    value.duration && `Duration: ${value.duration}`,
    value.rest && `Rest: ${value.rest}`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="form">
      <h4>{value.name}</h4>
      <p style={{ whiteSpace: "pre-wrap" }}>{value.instructions}</p>
      {value.cues && (
        <p>
          <strong>Cues:</strong> {value.cues}
        </p>
      )}
      <dl>
        {[
          ["Frequency", value.frequency],
          ["Intensity", value.intensity],
          ["Time", time],
          ["Type", value.type],
          ["Equipment", value.equipment],
        ]
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k}>
              <dt>
                <strong>{k}</strong>
              </dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
    </div>
  );
}
