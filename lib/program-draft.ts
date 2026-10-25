import type { HomeProgramExercise } from "./types";

// React's stable rendering key is local UI state, never a clinical edit.
export function programHasUnsavedChanges(draft: HomeProgramExercise[], saved: HomeProgramExercise[]): boolean {
  const clinicalState = (items: HomeProgramExercise[]) => JSON.stringify(items, (key, value) => key === "client_key" ? undefined : value);
  return clinicalState(draft) !== clinicalState(saved);
}
