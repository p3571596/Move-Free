# SMS patient invitations — October 16, 2026

Implementation branch: `feat/sms-patient-invitations`. Production release requires the user's explicit approval after validation.

## What changes

The existing clinician invitation control offers Email, Text Message (SMS), and Copy Secure Link. All three use the same current invitation record per patient, seven-day hashed single-use tokens, ownership checks and verified recipient email matching. Changing contact/method automatically uses replacement; the explicit Correct Contact action is also available. A replacement invalidates the old token before delivery. Existing linked accounts cannot be reassigned. Phone numbers are saved with the current invitation in E.164 form and can be corrected in the dialog.

SMS is neutral: `Move Free invitation: <secure link> Verify your email to continue. Expires in 7 days. Reply STOP to opt out.` No names, diagnosis, treatment or clinical identifiers enter the message. The invitation token is in the URL fragment, removed from the address bar after reading, and held in page memory. Do not add analytics to this page or external URL shorteners.

SMS and copy links require the clinician-recorded email as an independent identity check. A new patient creates a password and verifies an email code; existing patients sign in. The database independently checks confirmed email, matching recipient, role, current invitation, expiry and one-time claim. A forwarded SMS alone cannot activate an account. This intentionally does not offer phone-only onboarding. Clinicians must verify ownership of the recorded email/contact with the patient; email verification is not formal identity proofing and does not protect a compromised mailbox.

Public statuses are Pending, Sent, Failed, Accepted, Expired and Revoked. Sent means provider/API acceptance, not proven handset or inbox receipt; SMS delivered/undelivered callbacks update private delivery metadata. Stale sending attempts become failed after two minutes. Expiration is enforced at claim time and materialized when status is read. Audit events record attempts and status transitions without bodies, addresses, phone numbers or tokens. Current delivery contact and provider SID remain in the restricted invitation table for operation/support. Twilio itself receives the body and destination to deliver the message; configure its eligible retention/redaction options and restrict console access before real delivery. Review audit retention with the organization's records policy; no automated deletion policy is imposed by this change.

Database controls serialize delivery and claims, enforce 60 seconds between attempts (including contact corrections), cap five attempts per patient per day and thirty attempts per clinician per hour. Browser double submission is disabled, provider auto-retries are disabled, and failed/uncertain sends require an explicit resend. Repeated callbacks and callbacks for replaced/revoked/accepted tokens cannot revive access. These controls do not replace provider spend limits, destination restrictions or organization monitoring.

## Provider decision and estimated costs

Twilio is implemented because it supplies a maintained Node SDK, international E.164 delivery, signed callbacks, Messaging Services and managed opt-out support. AWS End User Messaging is an alternative with destination-specific rates and a separate AWS IAM/origination/registration setup. It was evaluated but not integrated; there is no evidence that migration would reduce total costs for this small deployment. Retain the provider boundary in `lib/sms.ts` if a different commercial agreement is preferable.

Twilio US published rates checked October 16, 2026: $0.0083 per outbound segment; a local long-code number costs $1.15/month, toll-free $2.15/month. Carrier fees, registration/campaign fees, taxes, replies and verification email costs are additional. The full invitation URL and opt-out text generally make this a two-segment GSM message. At 1,000 two-segment invitations/month, base message cost is $16.60 plus number rental; allow roughly $25–$35/month including typical carrier charges, BEFORE registration/campaign fees and any Security/Enterprise edition. Actual segment count depends on the canonical domain length. International rates vary.

**Potentially dominant fixed cost:** Twilio's HIPAA page says a BAA requires Security or Enterprise edition. Obtain a written quote; per-message pricing is not the total HIPAA-ready service cost. No provider account, number, paid edition or campaign has been purchased here.

Sources:
- https://www.twilio.com/en-us/sms/pricing/us
- https://www.twilio.com/en-us/hipaa
- https://www.twilio.com/docs/messaging/compliance/a2p-10dlc
- https://www.twilio.com/en-us/legal/messaging-policy
- https://www.twilio.com/docs/usage/webhooks/webhooks-security
- https://aws.amazon.com/end-user-messaging/pricing/
- https://www.hhs.gov/hipaa/for-professionals/covered-entities/fast-facts/index.html
- https://docs.fcc.gov/public/attachments/FCC-24-24A1_Rcd.pdf

## Server setup and release gates

1. Configure a separate Twilio test/subaccount and Messaging Service. Store `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID` only in server environment settings. Never use NEXT_PUBLIC for secrets. Set `PATIENT_SMS_ENABLED=true` only in the synthetic environment and `PATIENT_SMS_TEST_NUMBERS` to numbers controlled by the tester. Twilio test credentials/magic numbers simulate API results; they do not establish real receipt or carrier callback behavior. A trial account may require verified recipients.
2. Configure the correct HTTPS `NEXT_PUBLIC_APP_URL` and Supabase URL/publishable/secret key for the same isolated database. The callback is `/api/patient-invitations/sms-status?attempt=<attempt UUID>`. The SDK verifies Twilio's signature against this canonical URL and all form fields, checks AccountSid and MessageSid, and applies attempt-identity guards. Invalid signatures are rejected. Ensure proxy URLs do not rewrite signed paths. Callback metadata contains no claim token.
3. Enable Supabase email confirmation. Configure the **Confirm signup** email template to show `{{ .Token }}` as a code. The /join screen uses email-code verification while remaining on the original page; existing Invite User and Magic Link templates remain unchanged. Keep OTP expiry/rate limits conservative. Configure CAPTCHA/organization anti-bot policy for public Auth signup as appropriate before broad release.
4. Privacy/compliance owner must determine HIPAA applicability across Twilio, Supabase, Vercel and mail vendor, obtain required BAAs, confirm eligible services, and approve retention/access policies. Neutral wording does not by itself remove PHI risk: destination and relationship metadata can be sensitive. Review SMS's unencrypted transport and lock-screen visibility with patients and offer email/secure-link alternatives.
5. Obtain and document patient SMS consent before sending (the UI records a clinician attestation timestamp on each SMS invitation). Define consent wording, scope, evidence retention and withdrawal. Enable Twilio Advanced Opt-Out for STOP/START/HELP, maintain suppression behavior, and verify STOP blocks resends. Review TCPA/FCC, applicable state rules, quiet hours and destination-country requirements with the organization's compliance owner. No marketing content is included.
6. For US long-code application messaging, complete A2P 10DLC brand and campaign registration and approve sample messages/opt-in evidence. Toll-free uses its own verification process. Configure sender capabilities, geographic allowlists, fraud/spend controls and operational alerts. International normalization does not mean every destination is commercially enabled.
7. Keep `PATIENT_SMS_REAL_DELIVERY_APPROVED=false` until these gates, live synthetic receipt, opt-out and callback tests pass. Enabling real-patient delivery requires explicit production approval separately from deploying the code.
8. Apply both new migrations and deploy the compatible app together after approval. Do not roll back to unbound invitation tokens. Existing email invitations remain supported.

## SMTP investigation

The prior release report documents two October 10 SMTP 535 authentication rejections, with custom SMTP pointing to Resend port 465. Current read-only Supabase log aggregation (last 24 hours, October 16) found 47 auth log entries and zero SMTP/535 matches. This is not proof of repair or inbox receipt. No SMTP password was retrieved or changed.

Administrator action remains: use SMTP username `resend`, replace the stored password with an active Resend sending API key, verify sender domain/allowed from-address, and confirm settings directly in the dashboards. Never paste credentials into chat. Test a controlled synthetic inbox and the full callback/password flow. Existing route tests preserve error classification, no retry-on-SMTP-failure behavior, failed-token invalidation and eligible existing-user delivery. Reference: https://resend.com/changelog/smtp-service

## Preview and validation

Preview database: `xpfpnxlobjvtemoktjxg` (`sms-invitations-preview`), branched without production data. SMS is forcibly disabled on this app preview branch. Public browser configuration is pinned to that isolated database; production credentials are not embedded. The branch may incur ongoing Supabase compute charges; pause/delete it after review.

Synthetic clinician: `sms-clinician@example.invalid`; password `SyntheticPreview!2026`. This credential belongs only to disposable synthetic data. Patient workspace: `/patients/92600000-0000-0000-0000-000000000001`. Synthetic patient email: `sms-patient@example.invalid`, same synthetic password. Do not enter real patient data into this preview.

Automated coverage includes original email-delivery tests, PostgreSQL/PGlite authorization and lifecycle tests, SMS/copy database tests, provider-failure route tests, real Twilio SDK signature verification tests, international normalization and neutral-message checks. Live carrier delivery, controlled inbox receipt, email-code signup template configuration, STOP/START and real provider callback testing require provider setup and remain explicit release gates.

Observed preview validation: 51 automated tests, lint, TypeScript and production build pass. Browser testing against the live isolated database passed secure-link issuance, verified synthetic patient sign-in and claim, patient app rendering and clinician Accepted status; SQL confirmed the token hash was consumed. Hosted preview clinician login also passed. The short-screen invitation dialog scrolls so the send action stays reachable. For a fresh invitation use synthetic patient `92600000-0000-0000-0000-000000000002`; the original fixture is now linked.
