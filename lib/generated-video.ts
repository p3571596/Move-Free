export const GENERATION_MODEL = 'google/veo-3.1-fast-generate-001';
export const GENERATION_BUCKET = 'exercise-generation-private';
export const GENERATION_COST_CENTS = 40;
export const movements = {
  squat: {name:'Squat', instructions:'Stand with your feet comfortably apart. Bend your hips and knees, then return to standing.', motion:'standing squat, bending hips and knees and returning to standing'},
  heel_raise: {name:'Heel raise', instructions:'Stand beside a stable support. Rise onto your toes, then lower your heels slowly.', motion:'standing heel raise beside a stable support, rising onto toes and lowering heels'},
  sit_to_stand: {name:'Sit to stand', instructions:'Start seated on a stable chair. Lean forward and stand, then sit down with control.', motion:'rising from a stable chair to standing and sitting back down'},
  wall_push_up: {name:'Wall push-up', instructions:'Place your hands on a wall. Bend your elbows to move toward the wall, then press away.', motion:'standing wall push-up with hands against a wall, bending and extending elbows'},
} as const;
export type Movement = keyof typeof movements;
export function isMovement(value: unknown): value is Movement { return typeof value === 'string' && Object.hasOwn(movements,value); }
export function generationPrompt(movement: Movement) {
  return `A fictional adult demonstrating ${movements[movement].motion}. Full body visible throughout, static side-oblique camera, plain neutral studio, comfortable ordinary exercise clothes. One slow continuous movement. No text, no speech, no audio, no logos, no real person reference. This is an unverified exercise illustration for clinician review.`;
}
export type GeneratedVideoJob = {id:string;movement:Movement;status:'starting'|'generating'|'ready'|'reviewed'|'approved'|'failed';object_path:string|null;error_code:string|null;reviewed_content:import('./ai-exercise-content').AIExerciseContent|null;created_at:string;cost_cents:number;asset_id:string|null};
