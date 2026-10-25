import {
  parameterKeys,
  prescriptionFor,
  validatePrescription,
  type ParameterKey,
  type Prescription,
} from "./prescription";
import type { HomeProgramExercise } from "./types";
import type { DayTemplate, ProgressionPlan } from "./progression";
export type CycleAdjustment = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  profileId: string;
  assignmentId: string;
  prescription: Prescription;
};
export type CycleConfig = {
  version: 2;
  endDate: string;
  mode: "fixed" | "flexible";
  pattern: string[];
  variables: Record<string, ParameterKey[]>;
  occurrenceEdits: Record<string, string>;
  futureEdits: { from: string; slot: number; profileId: string }[];
  adjustments: CycleAdjustment[];
  minHighSpacingDays: number;
  highProfileId: string;
  allowedWeekdays: number[];
  multipleSessionsPerDay: boolean;
};
export const commonParameters: ParameterKey[] = [
  "sets",
  "reps",
  "load",
  "intensity",
];
export const addDays = (date: string, n: number) =>
  new Date(Date.parse(date + "T00:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
export const dayDifference = (a: string, b: string) =>
  Math.round(
    (Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86400000,
  );
export function validDate(date: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date
  );
}
export function applicableParameters(item: HomeProgramExercise) {
  return parameterKeys.filter((k) => !!prescriptionFor(item)[k]);
}
export function newCyclePlan(
  items: HomeProgramExercise[],
  startDate = new Date().toLocaleDateString("en-CA"),
): ProgressionPlan {
  const templates: DayTemplate[] = [
    "Higher intensity",
    "Lower intensity",
    "Recovery / Rest",
  ].map((name, i) => ({
    id: ["high", "low", "recovery"][i],
    name,
    notes: "",
    weekdays: [],
    scheduledOnly: true,
    minRestHours: 0,
    fullRest: i === 2,
    exercises:
      i === 2
        ? []
        : items.map((x) => ({
            assignmentId: x.id,
            prescription: structuredClone(prescriptionFor(x)),
            notes: x.notes ?? "",
            prerequisiteIds: x.prerequisite_ids ?? [],
          })),
  }));
  return {
    startDate,
    activeWeek: 0,
    phases: [],
    weeks: [
      {
        name: "Cycle schedule",
        recovery: false,
        notes: "",
        templateIds: templates.map((t) => t.id),
        overrides: {},
      },
    ],
    templates,
    cycle: {
      version: 2,
      endDate: addDays(startDate, 27),
      mode: "fixed",
      pattern: [
        "high",
        "low",
        "recovery",
        "high",
        "low",
        "recovery",
        "recovery",
      ],
      variables: Object.fromEntries(items.map((i) => [i.id, []])),
      occurrenceEdits: {},
      futureEdits: [],
      adjustments: [],
      minHighSpacingDays: 2,
      highProfileId: "high",
      allowedWeekdays: [0, 1, 2, 3, 4, 5, 6],
      multipleSessionsPerDay: false,
    },
  };
}
export function inheritedProfile(
  plan: ProgressionPlan,
  profile: DayTemplate,
  items: HomeProgramExercise[],
): DayTemplate {
  return {
    ...profile,
    scheduledOnly: plan.cycle?.mode === "fixed",
    exercises: profile.fullRest
      ? []
      : profile.exercises.map((e) => {
          const base = prescriptionFor(
            items.find((i) => i.id === e.assignmentId)!,
          );
          const selected = plan.cycle?.variables[e.assignmentId] ?? [];
          return {
            ...e,
            prescription: {
              ...base,
              ...Object.fromEntries(
                selected
                  .filter((k) => e.prescription[k])
                  .map((k) => [k, e.prescription[k]]),
              ),
            },
          };
        }),
  };
}
export function cycleOccurrences(plan: ProgressionPlan) {
  const c = plan.cycle;
  if (!c) return [];
  const length = dayDifference(c.endDate, plan.startDate) + 1;
  if (
    !validDate(plan.startDate) ||
    !validDate(c.endDate) ||
    length < 1 ||
    length > 728 ||
    !c.pattern.length
  )
    return [];
  return Array.from({ length }, (_, index) => {
    const date = addDays(plan.startDate, index),
      slot = index % c.pattern.length;
    let profileId = c.pattern[slot];
    for (const rule of c.futureEdits)
      if (date >= rule.from && slot === rule.slot) profileId = rule.profileId;
    profileId = c.occurrenceEdits[date] ?? profileId;
    const overrides: Record<string, Prescription> = {};
    for (const rule of c.adjustments.filter(
      (a) =>
        a.startDate <= date && a.endDate >= date && a.profileId === profileId,
    )) {
      overrides[rule.assignmentId] ??= {};
      for (const key of Object.keys(rule.prescription) as ParameterKey[]) {
        if (overrides[rule.assignmentId][key])
          throw new Error(
            `Conflicting adjustments on ${date}: ${key}. Use non-overlapping dates or different parameters.`,
          );
        overrides[rule.assignmentId][key] = rule.prescription[key];
      }
    }
    return { date, profileId, overrides };
  });
}
export function cyclePrescription(
  plan: ProgressionPlan,
  date: string,
  profileId: string,
  assignmentId: string,
) {
  const entry = plan.templates
    .find((t) => t.id === profileId)
    ?.exercises.find((e) => e.assignmentId === assignmentId);
  const prescription = { ...entry?.prescription };
  const changed = new Set<string>();
  for (const adjustment of plan.cycle?.adjustments ?? [])
    if (
      adjustment.profileId === profileId &&
      adjustment.assignmentId === assignmentId &&
      date >= adjustment.startDate &&
      date <= adjustment.endDate
    )
      for (const key of Object.keys(
        adjustment.prescription,
      ) as ParameterKey[]) {
        if (changed.has(key))
          throw new Error("Conflicting dated parameter adjustments.");
        prescription[key] = adjustment.prescription[key];
        changed.add(key);
      }
  return prescription;
}
export function changeCycleOccurrence(
  plan: ProgressionPlan,
  date: string,
  profileId: string,
  scope: "one" | "future" | "template",
): ProgressionPlan {
  const next = structuredClone(plan),
    c = next.cycle!;
  const slot = dayDifference(date, plan.startDate) % c.pattern.length;
  if (scope === "one") c.occurrenceEdits[date] = profileId;
  if (scope === "future") c.futureEdits.push({ from: date, slot, profileId });
  if (scope === "template") c.pattern[slot] = profileId;
  return next;
}
export function suggestPattern(
  counts: Record<string, number>,
  highId: string,
  minSpacing: number,
  restrictions?: { blockedSlots: number[]; restIds: string[] },
): string[] {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (
    total < 1 ||
    total > 28 ||
    Object.values(counts).some((n) => !Number.isInteger(n) || n < 0)
  )
    throw new Error("Use whole day counts totaling 1–28.");
  const remaining = { ...counts },
    result: string[] = [];
  let attempts = 0;
  function search(): boolean {
    if (++attempts > 100000) return false;
    if (result.length === total) {
      const positions = result.flatMap((id, i) => (id === highId ? [i] : []));
      return (
        !positions.length ||
        total - positions.at(-1)! + positions[0] >= minSpacing
      );
    }
    const index = result.length;
    const ids = Object.keys(remaining)
      .filter((id) => remaining[id] > 0)
      .sort(
        (a, b) =>
          result.filter((x) => x === a).length / counts[a] -
          result.filter((x) => x === b).length / counts[b],
      );
    for (const id of ids) {
      if (
        restrictions?.blockedSlots.includes(index) &&
        !restrictions.restIds.includes(id)
      )
        continue;
      if (
        id === highId &&
        result.some((v, i) => v === highId && index - i < minSpacing)
      )
        continue;
      result.push(id);
      remaining[id]--;
      if (search()) return true;
      remaining[id]++;
      result.pop();
    }
    return false;
  }
  if (!search())
    throw new Error(
      "The counts cannot satisfy High-day spacing. Change counts or spacing.",
    );
  return result;
}
export function validateCycle(
  plan: ProgressionPlan,
  items: HomeProgramExercise[],
) {
  const c = plan.cycle;
  if (!c) return;
  const ids = plan.templates.map((t) => t.id),
    occurrences = cycleOccurrences(plan);
  if (
    c.version !== 2 ||
    !["fixed", "flexible"].includes(c.mode) ||
    !occurrences.length ||
    c.pattern.length > 28 ||
    c.pattern.some((id) => !ids.includes(id)) ||
    !Number.isInteger(c.minHighSpacingDays) ||
    c.minHighSpacingDays < 0 ||
    c.minHighSpacingDays > 28 ||
    !ids.includes(c.highProfileId) ||
    !c.allowedWeekdays.length ||
    c.allowedWeekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
  )
    throw new Error(
      "Check cycle dates, profiles and restrictions (up to 104 weeks / 28-day cycle).",
    );
  for (const [id, keys] of Object.entries(c.variables))
    if (
      !items.some((i) => i.id === id) ||
      new Set(keys).size !== keys.length ||
      keys.some(
        (k) =>
          !applicableParameters(items.find((i) => i.id === id)!).includes(k),
      )
    )
      throw new Error(
        "Choose only parameters prescribed in the base exercise.",
      );
  for (const profile of plan.templates)
    for (const e of profile.exercises)
      for (const key of c.variables[e.assignmentId] ?? [])
        if (
          !e.prescription[key] ||
          (e.prescription[key]?.mode !== "range" &&
            e.prescription[key]?.value == null)
        )
          throw new Error("Complete each selected profile parameter.");
  for (const [index, a] of c.adjustments.entries()) {
    if (
      c.adjustments
        .slice(0, index)
        .some(
          (b) =>
            b.profileId === a.profileId &&
            b.assignmentId === a.assignmentId &&
            b.startDate <= a.endDate &&
            b.endDate >= a.startDate &&
            Object.keys(a.prescription).some((k) => k in b.prescription),
        )
    )
      throw new Error("Conflicting dated parameter adjustments.");
    const profile = plan.templates.find((t) => t.id === a.profileId);
    if (
      !validDate(a.startDate) ||
      !validDate(a.endDate) ||
      a.startDate > a.endDate ||
      a.startDate < plan.startDate ||
      a.endDate > c.endDate ||
      !profile?.exercises.some((e) => e.assignmentId === a.assignmentId) ||
      !Object.keys(a.prescription).length
    )
      throw new Error("Check adjustment dates, exercise and profile.");
    validatePrescription(a.prescription);
    if (
      Object.keys(a.prescription).some(
        (k) => !c.variables[a.assignmentId]?.includes(k as ParameterKey),
      )
    )
      throw new Error(
        "Adjustments can change only selected variable parameters.",
      );
  }
  for (const [date, id] of Object.entries(c.occurrenceEdits))
    if (
      date < plan.startDate ||
      date > c.endDate ||
      !validDate(date) ||
      !ids.includes(id)
    )
      throw new Error("Invalid occurrence edit.");
  for (const r of c.futureEdits)
    if (
      !validDate(r.from) ||
      r.from < plan.startDate ||
      r.from > c.endDate ||
      !ids.includes(r.profileId) ||
      !Number.isInteger(r.slot) ||
      r.slot < 0 ||
      r.slot >= c.pattern.length
    )
      throw new Error("Invalid future edit.");
  let lastHigh = -Infinity;
  for (const [index, o] of occurrences.entries()) {
    const profile = plan.templates.find((t) => t.id === o.profileId)!;
    if (
      !profile.fullRest &&
      !c.allowedWeekdays.includes(new Date(o.date + "T00:00:00Z").getUTCDay())
    )
      throw new Error(`Exercise on ${o.date} conflicts with allowed weekdays.`);
    if (o.profileId === c.highProfileId) {
      if (index - lastHigh < c.minHighSpacingDays)
        throw new Error(`High days on ${o.date} violate recovery spacing.`);
      lastHigh = index;
    }
    for (const e of profile.exercises)
      validatePrescription({
        ...e.prescription,
        ...o.overrides[e.assignmentId],
      });
  }
}

export function cycleActivityMessage(
  plan: ProgressionPlan,
  profileId: string,
  date: string,
  today: string,
  logs: {
    day_template_id?: string | null;
    session_id?: string | null;
    performed_at?: string | null;
    activity_source?: string | null;
  }[],
  sessionId?: string,
) {
  const c = plan.cycle!;
  const profile = plan.templates.find((t) => t.id === profileId);
  if (!profile) return "Choose an approved profile.";
  if (profile.fullRest)
    return "Full rest. No exercise confirmation is required.";
  if (today < plan.startDate || today > c.endDate)
    return "Today is outside the approved cycle dates.";
  if (!c.allowedWeekdays.includes(new Date(today + "T00:00:00Z").getUTCDay()))
    return "Today is outside your approved exercise weekdays.";
  const occurrences = cycleOccurrences(plan),
    occurrence = occurrences.find((o) => o.date === date);
  if (!occurrence) return "Choose an approved cycle date.";
  if (
    c.mode === "fixed" &&
    (date !== today || occurrence.profileId !== profileId)
  )
    return "Your clinician has limited this session to its approved date and profile.";
  const records = logs.filter(
    (l) =>
      l.activity_source === "individual_confirmation" &&
      l.session_id !== sessionId &&
      l.performed_at,
  );
  const localDate = (s: string) => new Date(s).toLocaleDateString("en-CA");
  if (
    !c.multipleSessionsPerDay &&
    records.some((l) => localDate(l.performed_at!) === today)
  )
    return "Your clinician has approved one session per day.";
  if (
    profileId === c.highProfileId &&
    records.some(
      (l) =>
        l.day_template_id === profileId &&
        dayDifference(today, localDate(l.performed_at!)) < c.minHighSpacingDays,
    )
  )
    return "Your clinician requires more recovery time between High sessions.";
  if (c.mode === "flexible") {
    const start = addDays(
        plan.startDate,
        Math.floor(dayDifference(today, plan.startDate) / 7) * 7,
      ),
      end = addDays(start, 6);
    if (date < start || date > end)
      return "Choose a session in the current approved week.";
    const quota = occurrences.filter(
      (o) => o.date >= start && o.date <= end && o.profileId === profileId,
    ).length;
    const used = new Set(
      records
        .filter(
          (l) =>
            l.day_template_id === profileId &&
            localDate(l.performed_at!) >= start &&
            localDate(l.performed_at!) <= end,
        )
        .map((l) => l.session_id),
    ).size;
    if (used >= quota)
      return "Your approved weekly frequency for this profile has been reached.";
  }
  return "";
}
