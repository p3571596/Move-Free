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
export type Prescription = Partial<Record<ParameterKey, { value: number | null; unit: string }>>;
export const parameterKeys = Object.keys(parameterSpecs) as ParameterKey[];

export function validatePrescription(value: Prescription): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid prescription.');
  for (const [key, entry] of Object.entries(value)) {
    if (!parameterKeys.includes(key as ParameterKey) || !entry || Object.keys(entry).some(k => !['value', 'unit'].includes(k))) throw new Error('Invalid prescription parameter.');
    const spec = parameterSpecs[key as ParameterKey];
    if (!(spec.units as readonly string[]).includes(entry.unit)) throw new Error(`Choose a unit for ${spec.label}.`);
    if (entry.value !== null && (typeof entry.value !== 'number' || !Number.isFinite(entry.value) || entry.value < 0 || entry.value > 100000 || ('integer' in spec && !Number.isInteger(entry.value)))) throw new Error(`Enter a valid number for ${spec.label}.`);
    if (entry.value !== null && ((entry.unit === 'RPE/10' && entry.value > 10) || (['%HRmax', '%1RM'].includes(entry.unit) && entry.value > 100) || (entry.unit === 'days/week' && entry.value > 7))) throw new Error(`Check the range for ${spec.label}.`);
  }
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
  return parameterKeys.flatMap(key => {
    const entry = value[key];
    if (entry?.value == null) return [];
    if (key === 'sets' || key === 'reps') return [`${entry.value} ${entry.unit}`];
    if (key === 'frequency') return [`${entry.value} ${entry.unit.replace('sessions/', 'sessions / ').replace('days/', 'days / ')}`];
    return [`${parameterSpecs[key].label}: ${entry.value} ${entry.unit}`];
  }).join(' · ');
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
