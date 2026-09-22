# Clinical Decision Engine v0.1 recovery and integration

Recovered from the user's `/Users/poyaohsu/Downloads/index.html` on 2026-09-20. The source identifies itself as **Move Free Clinical Decision Engine v0.1**. The original is preserved unchanged as `original-v0.1.html` (SHA-256 `f358f82a05b6540e466790eade6f2dd5950ac3c87d6f2fe4910256da749fe3a4`). The “PT Algorithm Discussion” conversation confirms the prototype and the founder's preceding reasoning. No LLM generates clinical suggestions in this integration.

`lib/clinical-engine.ts` preserves the original branch order, thresholds, reasons, suggested actions, and likely limiting factor:

1. Safety concern → refer / urgent escalation.
2. Changed symptom pattern and unexpected progress → reassess diagnosis.
3. Adverse response → regress / reduce load.
4. Unexpected progress with unproven execution → review execution / adherence.
5. Unexpected progress with contextual factors → address psychological / symptom-management factors.
6. Otherwise unexplained plateau → maintain briefly, reconsider intervention.
7. Expected progress with all readiness criteria → progress repetitions, then consider frequency.
8. Remaining cases → maintain current plan.

The source uses pain increase **>2**, exercise pain **>5**, recovery duration **>=48 hours**, RPE **<7**, and adherence **<90%** as branch conditions. Exactly 48 hours enters the adverse-response path in the executable original, even though its prose says “within 48 hours.” This boundary is deliberately preserved and tested, not silently reinterpreted. Clinical validity is not established by software parity tests.

## Deliberate integration changes

- No favorable demo defaults, example case buttons, or browser-local clinical log.
- Boolean findings are present / assessed absent / not assessed. Unknown never means absent.
- Missing, invalid, blank, or explicitly unmeasured rule inputs block evaluation. A known positive safety concern still surfaces the original safety rule, with missing inputs disclosed.
- The only initial mapped rule input is the latest explicit patient-reported symptom direction. Clinicians confirm the remaining inputs. Logged participation is not prescribed adherence; difficulty is not RPE; daily pain is not exercise pain; no recovery duration, swelling, safety finding, or movement quality is invented.
- All evaluation inputs and original reasons remain visible. Editing an input invalidates the prior result and agreement selection.
- The clinician separately chooses accept / modify / reject, documents their own final decision, and may explain disagreement. Missing-information cases are excluded from the agreement denominator.
- Only authored/approved patient guidance and messages reach the patient. Engine evaluations have separate treating-clinician-only RLS, including no administrator bypass.

## Structured evaluation storage

The unapplied additive migration creates immutable engine review records, authored message history, and an audit of actual program edits. The review stores the engine version/output/rule/reasoning/inputs, patient evidence snapshot, agreement, modification/reason, linked clinical decision, and program at review. Program edits record before/after values and the latest preceding review. Subsequent patient responses remain in the existing check-in records and are associated by patient and review interval. This is temporal association, not causation.

Founder reporting returns aggregate agreement and rule counts only. It never returns patient identifiers, notes, raw inputs, or recommendations to an unrelated founder. Existing production administrator exceptions on older clinical tables are unchanged and remain a rollout blocker for universal relationship-only access.

The migration must be approved and applied to a suitable environment before engine persistence, message replies/history, or founder engine metrics are advertised as available. Until then, these surfaces say Preview and manual clinical review and current guidance continue working.

## Verification

`npm test` compares all eight branches, critical boundaries, missing/invalid inputs, and 1,000 deterministic cases directly against the recovered executable source. A separate isolated Postgres test exercises row access, patient exclusion, unrelated clinician/admin exclusion, transaction rollback, immutable evaluation records, founder aggregate access, message authorship, and stale program publication.
