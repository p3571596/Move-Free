import {
  parameterKeys,
  parameterSpecs,
  validatePrescription,
  type Prescription,
} from "./prescription";
export const contentFields = [
  "name",
  "exercise_type",
  "instructions",
  "cues",
  "equipment",
] as const;
export type AIExerciseContent = Record<
  (typeof contentFields)[number],
  string
> & { prescription: Prescription };
export type DraftEvidence = {
  field: string;
  source: "speech" | "visual";
  quote: string;
  certainty: "supported" | "uncertain";
};
export const blankAIExercise = (): AIExerciseContent => ({
  name: "",
  exercise_type: "",
  instructions: "",
  cues: "",
  equipment: "",
  prescription: {},
});
export function validateAIExercise(value: unknown): AIExerciseContent {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("AI_INVALID");
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).some((k) => ![...contentFields, "prescription"].includes(k))
  )
    throw new Error("AI_INVALID");
  const result = blankAIExercise();
  for (const k of contentFields) {
    if (
      typeof v[k] !== "string" ||
      v[k].length > (k === "instructions" ? 4000 : k === "cues" ? 1400 : 200)
    )
      throw new Error("AI_INVALID");
    result[k] = v[k].trim();
  }
  validatePrescription(v.prescription as Prescription);
  result.prescription = v.prescription as Prescription;
  return result;
}
export function explicitDose(
  field: string,
  quote: string,
): { value: number; unit: string } | null {
  let q = quote
    .toLowerCase()
    .replace(
      /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|once|twice)\b/g,
      (w) =>
        String(
          (
            {
              zero: 0,
              one: 1,
              two: 2,
              three: 3,
              four: 4,
              five: 5,
              six: 6,
              seven: 7,
              eight: 8,
              nine: 9,
              ten: 10,
              once: 1,
              twice: 2,
            } as Record<string, number>
          )[w],
        ),
    );
  if (
    !/\b(perform|prescri\w*|recommend|instruct\w*|do|complete|repeat)\b/.test(
      q,
    ) ||
    /\b(demonstrat\w*|show\w*|example|observed)\b/.test(q) ||
    /\d\s*(?:-|–|to)\s*\d/.test(q)
  )
    return null;
  q = q
    .replace(/\bseconds?\b/g, "sec")
    .replace(/\bminutes?\b/g, "min")
    .replace(/\bpounds?\b/g, "lb")
    .replace(/\bkilograms?\b/g, "kg");
  const patterns: Record<string, RegExp> = {
    sets: /\b(\d+)\s+sets?\b/g,
    reps: /\b(\d+)\s+(?:reps?|repetitions?)\b/g,
    hold: /\bhold\s+(?:for\s+)?(\d+(?:\.\d+)?)\s+(sec|min)\b/g,
    rest: /\brest\s+(?:for\s+)?(\d+(?:\.\d+)?)\s+(sec|min)\b/g,
    duration:
      /\b(?:exercise|perform|do)\s+for\s+(\d+(?:\.\d+)?)\s+(sec|min)\b/g,
    load: /\b(\d+(?:\.\d+)?)\s+(lb|kg)\b/g,
    intensity: /\brpe\s+(\d+(?:\.\d+)?)(?:\s*\/\s*10)?\b/g,
    frequency:
      /\b(\d+)\s*(?:times?\s*)?(daily|weekly|(?:times?\s*)?per day|(?:times?\s*)?per week|days?\s*(?:per|\/)\s*week)\b/g,
  };
  const matches = [...q.matchAll(patterns[field] ?? /(?!)/g)];
  if (matches.length !== 1) return null;
  const m = matches[0];
  const unit =
    field === "sets"
      ? "sets"
      : field === "reps"
        ? "reps"
        : field === "intensity"
          ? "RPE/10"
          : field === "frequency"
            ? /days?/.test(m[2]) && /week/.test(m[2])
              ? "days/week"
              : /week/.test(m[2])
                ? "sessions/week"
                : "sessions/day"
            : m[2];
  return { value: Number(m[1]), unit };
}
// Never turn observed movement counts into numerical prescriptions.
export function supportedAIExercise(
  content: unknown,
  evidence: DraftEvidence[],
  transcript: string,
): AIExerciseContent {
  const result = validateAIExercise(content);
  if (!Array.isArray(evidence) || evidence.length > 100)
    throw new Error("AI_INVALID");
  const supported = (field: string, numeric = false) =>
    evidence.some(
      (e) =>
        e.field === field &&
        e.certainty === "supported" &&
        typeof e.quote === "string" &&
        e.quote.trim() &&
        (e.source === "visual"
          ? !numeric
          : e.source === "speech" &&
            transcript.toLowerCase().includes(e.quote.trim().toLowerCase()) &&
            (!numeric ||
              (/\b(perform|prescri\w*|recommend|instruct\w*|do|complete|repeat)\b/i.test(
                e.quote,
              ) &&
                !/\b(demonstrat\w*|show\w*|example|observed)\b/i.test(
                  e.quote,
                )))),
    );
  for (const k of contentFields) if (!supported(k)) result[k] = "";
  for (const k of parameterKeys) {
    const dose = result.prescription[k];
    const sources = evidence
      .filter(
        (e) =>
          e.field === k &&
          e.source === "speech" &&
          e.certainty === "supported" &&
          typeof e.quote === "string" &&
          transcript.toLowerCase().includes(e.quote.trim().toLowerCase()),
      )
      .map((e) => explicitDose(k, e.quote));
    if (
      !dose ||
      dose.value == null ||
      !supported(k, true) ||
      !sources.length ||
      sources.some((v) => !v || v.value !== dose.value || v.unit !== dose.unit)
    )
      delete result.prescription[k];
  }
  // No dosage in prose: clinicians can add it after review. Numeric fields are the only dose source.
  for (const k of ["instructions", "cues"] as const)
    if (
      /\b\d+\b|\b(once|twice|sets?|repetitions?|reps?|daily|weekly|seconds?|minutes?)\b/i.test(
        result[k],
      )
    )
      result[k] = "";
  return result;
}
const nullableNumber = { type: ["number", "null"] };
export const aiExerciseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["content", "evidence", "limitations"],
  properties: {
    content: {
      type: "object",
      additionalProperties: false,
      required: [...contentFields, "prescription"],
      properties: {
        ...Object.fromEntries(
          contentFields.map((k) => [k, { type: "string" }]),
        ),
        prescription: {
          type: "object",
          additionalProperties: false,
          required: parameterKeys,
          properties: Object.fromEntries(
            parameterKeys.map((k) => [
              k,
              {
                type: ["object", "null"],
                additionalProperties: false,
                required: ["value", "unit"],
                properties: {
                  value: nullableNumber,
                  unit: { type: "string", enum: [...parameterSpecs[k].units] },
                },
              },
            ]),
          ),
        },
      },
    },
    evidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field", "source", "quote", "certainty"],
        properties: {
          field: { type: "string", enum: [...contentFields, ...parameterKeys] },
          source: { type: "string", enum: ["speech", "visual"] },
          quote: { type: "string" },
          certainty: { type: "string", enum: ["supported", "uncertain"] },
        },
      },
    },
    limitations: { type: "array", items: { type: "string" } },
  },
};
