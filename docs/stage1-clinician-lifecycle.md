# Stage 1 concise clinician workspace and case lifecycle

Today presents only Alerts / Needs Attention and Recommendations to Review. On Track is an operational count of cases without an outstanding review signal in available reports, not a safety assessment. Missing activity, missing symptom updates, missing goals, inactive prescriptions and unreviewed feedback cannot silently become reassuring results. Discharged cases are excluded. The automatic clinical-review mapper/evaluator supplies the recommendation; clinicians still assess unknowns and Approve, Modify or Reject. No engine suggestion is automatically published.

Patient Summary contains since-last-review context, automatic analysis and clinical review. Progress contains baseline/current/target goal values and expandable feedback/clinical measures. Patient Log merges dated check-ins, exercise responses, function measures and messages with filters. Program shows the prescription and leads to the existing builder. All four destinations retain the same patient identity, clinical context, goal and navigation. Existing decision URLs open Summary. `/workspace/today` redirects to the existing Today route. Top navigation remains Today, Patients, Messages, More.

## Discharge and reactivation

Open a patient from Patients, then Case management in Summary. Discharge requires a reason, effective date and program plan. The operation locks the patient and episode, verifies the treating relationship, checks the current state and rejects another active episode. It atomically appends an event with goal/prescription snapshots and updates the patient and episode status. Existing goals, logs, notes, decisions and prescriptions are not deleted.

End current program archives active/draft prescriptions. Continue as independent program leaves the prescription available to the patient. Reactivate Case reopens **the same episode**, sets the patient to Needs Review and retains all discharge events. It never automatically restarts an archived prescription. The clinician must review and explicitly save the program. Profile editing no longer changes case status without a snapshot. Program Builder rejects discharged/closed episodes instead of silently creating another episode.

## Schema and access

- `20261001131749_stage1_case_lifecycle.sql`: `case_lifecycle_events`, indexes, treating-clinician-only SELECT/INSERT RLS, no client UPDATE/DELETE grants; `transition_case` runs as SECURITY INVOKER, so existing relationship RLS remains authoritative. Anonymous execution is revoked. The function captures goals and complete stored prescription rows at transition time. No patient invitation/authentication privileges change.
- `20261001132422_allow_discharged_episode_status.sql`: preserves every old episode status and adds `discharged` to the existing check constraint.

Both migrations were generated locally using the CLI; filenames match the applied MCP migration versions. Security advisor: no findings before or after application. Lifecycle RLS follows the existing treating relationship rather than giving administrators raw clinical access.

## Episode limitation and migration path

Start New Episode is explicitly described as unavailable; there is no fake creation button. Legacy patient-level goal fields, unassigned observations, care messages and engine-review history prevent a safe complete multi-episode experience in this release. Do not reactivate a completed episode for a different clinical problem. Patient identity and episode identity remain separate in the schema.

Workspace reads now restrict evidence to the selected episode. Legacy unassigned records and patient-goal fallback are used only for a patient with a single episode. Today selects the active episode and does not borrow another episode's goals or program. Messages are explicitly patient-wide. Read limits remain 30 check-ins, 250 exercise logs, 50 measures and 100 messages; the UI identifies records as the latest available data, not exhaustive history. Full episode selection/creation and historical record assignment remain follow-up work: audit and backfill unambiguous episode links, retain ambiguous history separately, bind all writes/reviews to an explicit episode, then add a one-active-episode rule and episode chooser. Never infer assignment from clinical text or overwrite completed records.

## Validation

- 30 unit tests: original engine rule parity (including 1,000 combinations), automatic mapping/provenance/unknowns, Today partitions and episode isolation, invite authorization, videos, date handling, patient reports.
- PostgreSQL/PGlite: existing relationship authorization, clinical review storage and new lifecycle suite with the live episode status constraint. Authorized transitions, archived/independent prescriptions, snapshots, history, stale/invalid/conflicting actions, append-only records, revoked relationships and anonymous/patient/unrelated clinician/admin denials.
- Live Supabase browser acceptance with newly created synthetic accounts only: all four tabs, Today counts/queues, patient completion and feedback, stored clinician rejection, discharge, Discharged filter/history, reactivation, honest new-episode limitation, live RLS, desktop/mobile fit and no runtime errors.
- Focused intercepted browser regression separately exercises all Approve/Modify/Reject paths. This is distinct from live database testing.
- ESLint, TypeScript and production build.

## Release boundary and rollback

Based solely on production `f4c0ce5e99f30797cfc2725445b2d4fceb44a0aa`. Stage 2 branch tips are not merged or changed. The pre-existing Stage 2 database migration remains untouched.

Rollback deployment: `dpl_EeTNMKkuE1TLB5LWX3DvtkkN1PuA`, `https://move-free-czvr2r09i-phmhhcynk5-2739s-projects.vercel.app` (READY production for the baseline commit). Keep additive schema and lifecycle audit records during rollback. Do not delete discharge events or rewrite statuses to make an older UI appear current. The old UI does not exclude discharged cases from Today; if a rollback becomes necessary, pause clinician Today use until that filter is restored. No rollback may weaken the relationship RLS.
