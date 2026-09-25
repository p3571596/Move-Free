# Stage 2A/B review

This branch is a preview, not approved for production. Use the isolated Supabase branch `stage2-ai-fitt` (`hmebkyjnfawbdthiyayg`). Never apply these migrations to the Stage 1 database or merge to main without explicit approval.

## Workflows

Program Builder offers standard templates or personalized creation. Patient cards contain editable instructions, cues and flexible Frequency, Intensity, Time and Type fields. Irrelevant fields stay blank. Standard cards require preview and explicit approval before saving. Saving never writes to the exercise library.

Personalized creation stores a private draft before any assignment. Record/upload, preview locally, resumably upload, optionally request an AI draft, edit, preview, watch the recording and approve. Approval atomically creates or updates the patient assignment, with prescription history. Replacements preserve the original assignment ID and the old published video until the new draft is approved. Incomplete uploads block approval. Draft recordings can be deleted/re-recorded; deletion withdraws access before removing storage bytes. Signed URLs expire after 60 seconds; already downloaded bytes cannot be recalled.

## Schema and legacy data

`20260925002446_stage2_prescription_drafts.sql` adds a prescription snapshot/version to home_program_exercises and makes its template FK nullable for personalized assignments. New tables separate clinician-only drafts, private media metadata, immutable AI run history, prescription revision history and minimized playback events. Existing assignment IDs and Stage 1 engine/feedback data are retained. Privileged RPC implementations live in private, use an empty search_path, check current care relationships and lock draft/program/assignment rows. Public wrappers are security invoker; anonymous execution is revoked.

`20260925010424_stage2_standard_library_review.sql` adds reusable equipment and a library review flag. Existing library entries are preserved as needs_review, not guessed to be standard or deleted. Existing program references keep working. Exercise Studio offers an explicit legacy-review filter and reusable-standard confirmation. New confirmed templates enter the standard picker. Legacy default dosage is retained in the database but is not a new template input or automatically copied to new prescriptions.

## Security and audit

Drafts, AI originals/evidence and correction history are readable only by the current treating clinician, not patients or unrelated administrators. Patients can read only the currently assigned approved media object through private Storage RLS. Objects cannot be overwritten. Relationships are rechecked on upload finalization, drafting, approval and signed playback. The server validates the caller with Supabase auth before invoking AI; server credentials are never sent to the browser. The AI endpoint bounds its body and frame inputs, never fetches arbitrary caller-supplied URLs, rate-limits drafting per patient and clinician, rechecks access after inference, and saves provider results using server-only credentials. Draft/media text is never logged to analytics.

AI run history records original raw and supported drafts, evidence, populated field names, model, failures and duration. Approval history records final clinician content, corrected field names, creation time and time since AI draft. Patient playback is recorded at most once per media/account/hour. There is no aggregate AI accuracy claim.

## AI limitations

The implementation uses up to eight sampled JPEG frames, available MP4/WebM audio transcription and clinician context. This is not continuous video movement analysis. MOV audio and undecodable frame extraction have explicit fallback notices. AI may infer exercise identity incorrectly; all content remains editable and requires approval. Dosage fields require supported quoted speech/context; visual repetition counts or timing cannot populate dosage. Missing, uncertain or fabricated-quote fields are blank. Provider refusal, timeout, billing failure and invalid output leave the draft private and support manual completion.

Only clinician demonstration recordings/context should be used here. The app does not send patient chart data automatically. Review provider data-retention/health-data arrangements before any real patient rollout.

## Manual review script

1. Use synthetic accounts on the Stage 2 preview. Open a patient, then Program Builder.
2. Add a confirmed standard template. Change the name, instructions, cues and FITT. Preview and approve/save. Confirm its library entry and another patient's prescription are unchanged; reload and confirm stable assignment ID.
3. Create a personalized exercise. On a physical phone record an MP4 saying: “Do this twice a day, two sets of eight, hold five seconds.” Demonstrate five movements. Preview, upload and confirm progress. Pause/retry during a connection interruption; keep the original file selected.
4. Generate AI draft. Confirm only the stated dosage appears; the five demonstrated reps must not become dosage. Repeat with no spoken/context dosage: missing FITT stays blank. Repeat with MOV or no audio and confirm the limitations notice.
5. Edit the name, instructions, cues, intensity and one AI-populated dosage field. Save the private draft, reload, preview, play the video, check review approval and approve/assign.
6. Sign in as the patient: confirm the approved video, patient-specific instructions and FITT. Play it. Confirm drafts and AI history remain inaccessible.
7. Create a replacement for the same assignment. Confirm the patient still sees the old approved recording while replacement is a draft. Approve the replacement and confirm stable assignment ID and new playback. Delete an unapproved recording, upload another, and discard a draft.
8. Try the draft, media ID and storage path as another clinician and unrelated administrator. All access must be denied. Revoke the care relationship and verify new signed access is denied. Allow 60 seconds for existing signed links.
9. Run the existing Stage 1 program/check-in/feedback/clinical-review flows on synthetic staging data. Test iPhone Safari and Android Chrome recording, background/resume, cellular upload, video codecs and Home Screen usage before release.

## Rollout gate

Do not merge or promote. Review the PR, preview, automated results and physical-device checklist. The isolated branch incurs its separately approved recurring cost until paused/deleted by an authorized action. Production uses a different database and is unchanged.
