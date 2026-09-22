# Stage 1: video-guided pilot candidate

This branch builds on the reviewed PWA branch (`869259e`) and includes the recovered v0.1 rules unchanged. Main and the existing open PRs are preserved. The original preview deferred schema changes. The subsequently authorized release gate applies the reviewed storage and authorization migrations; see `pilot-release-gate.md` for current release status.

## Video behavior

Exercise Library → Create/Edit Exercise accepts an optional HTTPS YouTube or Vimeo single-video URL. Clinicians load a preview and explicitly approve it before saving. Changing the URL resets approval; Remove video persists null. Updating a library video affects all assignments of that exercise; the form states this. The Program Builder also includes an inline video field on every exercise: add, change, or remove a demonstration without leaving the program. New or changed videos require preview and approval before Save Program; unchanged videos do not require approval again. Saving updates only the selected exercise’s shared video field under clinician ownership. The form explains that other programs using this library exercise are affected. A clinician must check suitability and provider embedding permissions; the app cannot establish those from URL syntax.

Patient flow: exercise name → demonstration → prescribed sets/reps or time → short instructions and patient-specific clinical cues → completion/difficulty/comment → next exercise. Video loads only after a tap, does not autoplay, supports inline/fullscreen playback, and includes an external fallback. Moving to the next exercise unmounts the previous player. No video is searched for or assigned automatically.

Provider URLs are parsed against an exact hostname/path allowlist. Arbitrary iframe URLs, insecure protocols, user-info URLs, deceptive subdomains, and malformed identities are rejected. Vimeo unlisted hashes are retained. Other URL parameters, including tracking and start-time parameters, are stripped; the preview shows the exact full video that will be used. Cross-origin referrers include the app origin, not patient paths. Third-party videos are not cached by the service worker.

Current provider guidance: [YouTube embedded player parameters](https://developers.google.com/youtube/player_parameters), [Vimeo player parameters](https://help.vimeo.com/hc/en-us/articles/12426260232977-About-Player-Parameters).

## Data model and future boundary

Stage 1 uses the existing `exercises.video_url` field. The `ExerciseMedia` discriminated union separates external video, Move Free library video, clinician-recorded video, and patient-recorded video. Only external video has a Stage 1 renderer. Future managed media needs a separate media identity/storage/authorization model; patient recordings must not be placed in the shared exercise-library URL field. Recording, uploads, analysis, and autonomous recommendations are not implemented.

Repetition and duration prescriptions use the existing text dosage field (for example `8–10` or `30 seconds`), with formatting that does not append “reps” to time. Patient-specific cues use existing program exercise notes. Video approval is an explicit UI gate, not a new database approval/audit field; the existing clinician ownership policies still govern writes.

## Current release boundaries

The release-gate work enables saved engine evaluations, authored Messages replies/history, program-change audit and aggregate founder engine metrics using the prepared migration. The authorization migration removes administrator clinical-access exceptions and prevents users from changing their own authorization role. Both migrations have been applied to the shared Supabase project, with filenames aligned to the recorded deployment versions. Follow `pilot-release-gate.md` for the validation evidence and remaining gates.

## Final clinician manual test before real patients

1. Use a synthetic patient first. Open an invitation on iPhone and Android; verify the right account links and the correct patient appears.
2. Add to Home Screen; reopen, sign out/in, and confirm no other patient's information appears. Check notch/bottom-bar layout and text size.
3. Set a meaningful baseline/current/target goal. Verify Today shows the intended goal and latest authored guidance without detailed dashboards.
4. Add your own clinically appropriate YouTube/Vimeo link in Exercise Library, load it, watch the relevant content, and approve it. Confirm owner embedding permissions, captions, sound, orientation, and fullscreen on the actual phones.
5. Change then remove a video; verify both changes on the patient account. Recheck any existing assignments affected by a library edit.
6. Assign sets and repetitions or duration, instructions, and specific cues. Preview before assignment and confirm the patient sees exactly those details.
7. Complete one exercise, partly complete another, skip another, and submit a comment. Omit optional symptom/pain ratings once and verify no normal finding is invented.
8. Review Today → Since Last Visit and exercise-specific comments. Evaluate the recovered engine using explicit assessed inputs; inspect missing data and explanations. Confirm no output reaches the patient automatically.
9. Write and approve patient guidance, update dosage, and confirm the patient sees the update in Today/Messages/Program. Submit a subsequent patient response.
10. Confirm two-way Messages and saved engine comparisons are enabled and tested in the eventual approved pilot environment. They are enabled in the release candidate database.
11. Test an unrelated clinician and an unrelated administrator against every clinical record type, including direct API requests. Both must be denied before real-patient release.
12. Agree on clinic response expectations and an urgent-contact route; do not present the app as continuously monitored. Verify invitation email delivery and an extended idle-session return on real devices.
