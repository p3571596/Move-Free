import type { HomeProgramExercise } from "./types";
export const prescriptionFields = [
  "name",
  "instructions",
  "cues",
  "equipment",
  "category",
  "frequency",
  "intensity",
  "sets",
  "reps",
  "hold",
  "duration",
  "rest",
  "type",
] as const;
export type PrescriptionField = (typeof prescriptionFields)[number];
export type Prescription = Record<PrescriptionField, string>;
export const emptyPrescription = (): Prescription =>
  Object.fromEntries(prescriptionFields.map((k) => [k, ""])) as Prescription;
export function prescriptionFromItem(item: HomeProgramExercise): Prescription {
  if (item.prescription)
    return { ...emptyPrescription(), ...item.prescription };
  return {
    ...emptyPrescription(),
    name: item.exercise?.name ?? "",
    instructions:
      item.exercise?.patient_instructions ??
      item.exercise?.instructions ??
      item.exercise?.description ??
      "",
    cues: item.notes ?? "",
    category: item.category ?? item.exercise?.category ?? "other",
    frequency: item.frequency ?? "",
    sets: String(item.dosage_sets ?? item.sets ?? ""),
    reps: String(item.dosage_reps ?? item.reps ?? ""),
    type: item.exercise?.category ?? "",
  };
}
export function validatePrescription(value: unknown): Prescription {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid exercise draft.");
  const v = value as Record<string, unknown>,
    result = emptyPrescription();
  for (const key of prescriptionFields) {
    if (
      typeof v[key] !== "string" ||
      String(v[key]).length >
        (key === "instructions" ? 4000 : key === "cues" ? 2000 : 300)
    )
      throw new Error("Invalid exercise field.");
    result[key] = String(v[key]).trim();
  }
  return result;
}
export type AIEvidence = {
  field: PrescriptionField;
  source: "context" | "speech" | "visual";
  quote: string;
  certainty: "supported" | "uncertain";
};
export function supportedDraft(
  content: unknown,
  evidence: AIEvidence[],
  context: string,
  transcript: string,
): Prescription {
  const draft = validatePrescription(content);
  // Prescription dosage is never inferred from demonstrated movement, repetition counts or timing.
  const dosage = new Set([
    "frequency",
    "intensity",
    "sets",
    "reps",
    "hold",
    "duration",
    "rest",
  ]);
  for (const key of prescriptionFields) {
    const supported = evidence.some(
      (e) =>
        e.field === key &&
        e.certainty === "supported" &&
        e.quote.trim() &&
        (e.source === "visual"
          ? !dosage.has(key)
          : (e.source === "context" ? context : transcript)
              .toLowerCase()
              .includes(e.quote.trim().toLowerCase())),
    );
    if (!supported) draft[key] = "";
  }
  return draft;
}
export const fieldLabels: Record<PrescriptionField, string> = {
  name: "Exercise name",
  instructions: "Patient-friendly instructions",
  cues: "Key cues",
  equipment: "Equipment",
  category: "Category",
  frequency: "Frequency · sessions/day, days/week",
  intensity: "Intensity · load, effort, assistance, tempo or symptom limit",
  sets: "Sets",
  reps: "Repetitions",
  hold: "Hold time",
  duration: "Exercise duration",
  rest: "Rest between sets",
  type: "Type · activity or movement",
};
