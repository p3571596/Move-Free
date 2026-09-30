# Stage 1 automatic clinical review

## Gap fixed
The old review seeded only symptom direction and required every v0.1 field before evaluation. Stored exercise feedback was displayed nearby but never normalized into the engine. Clinicians therefore had to duplicate available data.

The decision screen now initializes an explainable review immediately, using the current authorized patient's workspace. AUTO fields cannot be overwritten in the observation form. Missing findings remain UNKNOWN. Valid supplementary observations are CLINICIAN-ADDED; editing them recalculates the review and clears its prior disposition.

## Data contract
- Window: latest 14 days, shortened to after the latest clinical decision. Only current-program exercise logs and matching patient/episode check-ins enter the automatic inputs. Future, stale and unrelated records are excluded. Session/exercise retries are deduplicated.
- Symptom direction: latest explicit report, otherwise comparison of the two latest valid daily pain ratings. Daily pain is never labeled exercise pain.
- Exercise pain: maximum valid during-exercise rating in the review window, with source IDs. Skipped exercise ratings are excluded.
- Pain increase: only equivalent paired before/after/during fields, if available. The inspected production schema has no pain_before field, so this remains unknown in current production.
- Function: recently updated numeric goal baseline/current/target, with direction oriented toward the target. Conflicting goals and free-text values remain unknown. This is baseline-to-current progress, not an invented since-last-review change.
- Context: completed/partial/skipped counts, full completion among reported exercises, earlier/later-window reported completion rates, repeated difficulty for the same exercise across sessions, comments, current dosage/frequency, goals, metrics, barriers and latest clinical decision.
- Prescribed adherence remains unknown because free-text frequency and submitted logs do not define every prescribed opportunity. Reported completion is shown separately, without giving partial exercises invented fractional credit.
- Limits: existing workspace reads load at most 30 check-ins and 250 logs; these are summaries of available reports, not exhaustive adherence estimates. Metrics now load the latest 50 instead of the oldest 12.

## Rules and clinical limitations
The recovered v0.1 evaluator, branch order and thresholds are unchanged. Its reference parity suite tests all eight branches and 1,000 deterministic combinations. The integration adds explicitly labeled partial-evidence review routing, not a generic AI model:
1. Positive safety findings retain original urgent escalation.
2. Known changed-pattern/adverse-response evidence uses v0.1 categories and thresholds.
3. Incomplete exposure prompts execution/barrier review without declaring treatment failure.
4. Worsening symptoms or repeated difficulty prompt response/load review.
5. Otherwise, review missing information. Unknown findings cannot authorize full progression.

Mixed improving function/worsening symptoms are stated explicitly. The integration also prevents the legacy progression branch from bypassing assessed adherence below 90%; this is versioned as integration.execution_before_progression. Partial evidence is stored as assessmentScope=partial_evidence with unresolved fields, so future analytics can distinguish it from a complete v0.1 assessment.

Examination, red flags/neurology, swelling, recovery hours, technique/movement quality, RPE, contextual factors and expected stage of recovery still require assessment where unavailable. Comments are displayed verbatim, never interpreted automatically as a safety clearance.

## Storage, authorization and publication
No migration is required. Existing clinical_engine_reviews JSON snapshots capture normalized inputs, each field's state/source/record IDs, window, contextual data, recommendation, rules, clinician disposition/final action, optional disagreement and modification. Existing transactional record_engine_review saves the decision and review together. Existing program-change triggers and response-history queries retain later actions/outcomes; temporal linkage does not prove causation.

Approve fills an editable clinician final action/rationale. Modify requires modification text. Record the review before saving program changes to link the existing audit to that review. Auth/RLS remain unchanged, and saving rechecks the patient records, goals, metrics, program and previous decision for intervening changes. Only the separately approved guidance publication or explicit Program Builder save affects the patient.

## Verification and manual acceptance
Automated: mapping/unknown/source tests, original rule parity, synthetic browser contract tests, PGlite persistence and RLS tests, lint, type check, production build. The browser contract test intercepts API requests and is NOT a live Supabase end-to-end test. The older live test accounts are banned, so the updated live e2e suite requires fresh authorized synthetic accounts before release.

1. On preview with a test patient, complete one exercise, partially complete one and skip one. Submit pain, difficulty and a comment.
2. Open that patient's clinician decision page. Confirm a recommendation appears immediately, AUTO symptom/exercise values and reported completion are present, and comments can be inspected without re-entry.
3. Confirm neurological findings and recovery remain not assessed. Add an observation; check that reasoning recalculates and any previous approval clears. A positive neurological finding must surface safety escalation.
4. Try Approve, Modify (with text) and Reject in separate saved reviews. Check final decision, reasons and history. For a mixed case, use numeric goal improvement plus worsening symptoms; confirm both signals are shown.
5. Save a review, then explicitly approve authored guidance or save an exercise/dosage edit. Verify the intended patient sees that approved change. A review alone must not publish a suggestion.
6. Submit a later patient response and inspect response history. Confirm an unrelated clinician cannot load this patient or engine review.
