import type { HomeProgramExercise, ProgramChange, LegacyPrescription } from './types';

export const parameterSpecs = {
  sets: { label: 'Sets', units: ['sets'], integer: true },
  reps: { label: 'Repetitions', units: ['reps'], integer: true },
  hold: { label: 'Hold duration', units: ['sec', 'min'] },
  rest: { label: 'Rest between sets', units: ['sec', 'min'] },
  load: { label: 'Resistance / load', units: ['kg', 'lb', '%1RM', 'level'] },
  duration: { label: 'Exercise duration', units: ['sec', 'min'] },
  frequency: { label: 'Frequency', units: ['sessions/day', 'sessions/week', 'days/week'], integer: true },
  intensity: { label: 'Target intensity', units: ['RPE/10', '%HRmax'] },
  distance: { label: 'Distance', units: ['m', 'ft', 'km', 'mi'] },
} as const;
export type ParameterKey = keyof typeof parameterSpecs;
export type DoseParameter = { value: number | null; unit: string; mode?: "exact" | "range"; min?: number | null; max?: number | null; target?: number | null };
export type Prescription = Partial<Record<ParameterKey, DoseParameter>>;
export const parameterKeys = Object.keys(parameterSpecs) as ParameterKey[];

export function validatePrescription(value: Prescription, allowRanges = true): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid prescription.');
  for (const [key, entry] of Object.entries(value)) {
    if (!parameterKeys.includes(key as ParameterKey) || !entry || typeof entry !== 'object' || Array.isArray(entry) || Object.keys(entry).some(k => !['value', 'unit', 'mode', 'min', 'max', 'target'].includes(k))) throw new Error('Invalid prescription parameter.');
    const spec = parameterSpecs[key as ParameterKey];
    if (!(spec.units as readonly string[]).includes(entry.unit)) throw new Error(`Choose a unit for ${spec.label}.`);
    if (entry.mode !== undefined && !['exact','range'].includes(entry.mode)) throw new Error('Invalid dose mode.');
    const range = entry.mode === 'range';
    if (range && (!allowRanges || entry.value !== null || entry.min == null || entry.max == null)) throw new Error(`Enter both range limits for ${spec.label}.`);
    if (!range && (entry.value === undefined || ['min','max','target'].some(k => k in entry))) throw new Error('Invalid exact dose.');
    const values = range ? [entry.min,entry.max,entry.target ?? null] : [entry.value];
    for (const v of values) {
      if (v === null) continue;
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100000 || ('integer' in spec && !Number.isInteger(v))) throw new Error(`Enter a valid number for ${spec.label}.`);
      if ((entry.unit === 'RPE/10' && v > 10) || (['%HRmax','%1RM'].includes(entry.unit) && v > 100) || (entry.unit === 'days/week' && v > 7)) throw new Error(`Check the range for ${spec.label}.`);
    }
    if (range && (entry.min! > entry.max! || (entry.target != null && (entry.target < entry.min! || entry.target > entry.max!)))) throw new Error(`Use minimum ≤ preferred target ≤ maximum for ${spec.label}.`);
  }
}

export function doseBounds(entry?: DoseParameter) {
  if (!entry) return null;
  if (entry.mode === 'range') return entry.min != null && entry.max != null ? {min: entry.min, max: entry.max} : null;
  return entry.value == null ? null : {min: entry.value, max: entry.value};
}
export function actualWithinPrescription(planned: Prescription, actual: Prescription, perSetReps?: number[]): 'within' | 'outside' | 'unknown' {
  validatePrescription(actual, false);
  if (perSetReps?.some(n => !Number.isInteger(n) || n < 0 || n > 100000)) throw new Error('Enter whole-number repetitions for each set.');
  let observed = false;
  for (const key of parameterKeys) {
    const bound = doseBounds(planned[key]);
    const values = key === 'reps' && perSetReps?.length ? perSetReps : actual[key]?.value != null ? [actual[key]!.value!] : [];
    if (!bound || !values.length || (actual[key] && actual[key]!.unit !== planned[key]!.unit)) continue;
    observed = true;
    if (values.some(v => v < bound.min || v > bound.max)) return 'outside';
  }
  return observed ? 'within' : 'unknown';
}

// Conservative legacy conversion: only single explicit values, never ranges or clinical instructions.
export function prescriptionFromLegacy(item: Pick<HomeProgramExercise, 'dosage_sets' | 'dosage_reps' | 'frequency'>): Prescription {
  const result: Prescription = {};
  const integer = (v?: string | null) => v && /^\d{1,5}$/.test(v.trim()) ? Number(v.trim()) : null;
  const sets = integer(item.dosage_sets), reps = integer(item.dosage_reps);
  if (sets !== null) result.sets = {value: sets, unit: 'sets'};
  if (reps !== null) result.reps = {value: reps, unit: 'reps'};
  const freq = item.frequency?.trim().match(/^(\d{1,2})\s*(?:x|times|sessions|days)\s*(?:\/|per)\s*(day|week)$/i);
  if (freq) {
    const unit = /days/i.test(freq[0]) ? 'days/week' : `sessions/${freq[2].toLowerCase()}`;
    if (!(unit === 'days/week' && (freq[2].toLowerCase() !== 'week' || Number(freq[1]) > 7))) result.frequency = {value: Number(freq[1]), unit};
  }
  return result;
}
export function prescriptionFor(item: HomeProgramExercise): Prescription {
  return item.prescription ?? prescriptionFromLegacy(item);
}
export function formatPrescription(value: Prescription): string {
  const text = (key: ParameterKey) => {const e=value[key], b=doseBounds(e); return b ? `${b.min === b.max ? b.min : `${b.min}–${b.max}`} ${e!.unit}` : '';};
  const counts = [text('sets'),text('reps')].filter(Boolean).join(' × ');
  return [counts,...parameterKeys.filter(k=>k!=='sets'&&k!=='reps').map(key=>text(key) ? `${key==='frequency'?'':parameterSpecs[key].label+': '}${text(key)}` : '')].filter(Boolean).join(', ');
}
export function legacyPrescriptionFor(item: HomeProgramExercise): LegacyPrescription {
  if (item.legacy_prescription) return item.legacy_prescription;
  const converted = prescriptionFromLegacy(item);
  return {dosage_sets: item.dosage_sets, dosage_reps: item.dosage_reps, frequency: item.frequency,
    review_required: !!((item.dosage_sets?.trim() && !converted.sets) || (item.dosage_reps?.trim() && !converted.reps) || (item.frequency?.trim() && !converted.frequency)), reviewed: false};
}
export function formatExercisePrescription(item: HomeProgramExercise): string {
  const structured = formatPrescription(prescriptionFor(item));
  const legacy = legacyPrescriptionFor(item);
  const original = legacy && legacy.review_required && !legacy.reviewed ? [legacy.dosage_sets && `${legacy.dosage_sets} sets`, legacy.dosage_reps, legacy.frequency].filter(Boolean).join(' · ') : null;
  return [structured, original ? `Original instructions: ${original}` : null].filter(Boolean).join(' · ') || 'Follow your therapist’s instructions';
}

export function describePrescriptionChange(change: ProgramChange): string {
  const before = change.before_value as HomeProgramExercise | null, after = change.after_value as HomeProgramExercise | null;
  return `${before ? formatExercisePrescription(before) : 'Not assigned'} → ${after ? formatExercisePrescription(after) : 'Removed'}`;
}
