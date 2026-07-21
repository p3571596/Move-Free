# Authentication manual QA

Use unique test emails and one public production deployment. Record the browser, device, time, expected result, actual result, and any visible authentication code for each failure. Never record passwords or tokens.

## Invitation and password creation

- [ ] Clinician sends one invitation to a new patient email.
- [ ] Patient opens only the newest email in a private browser.
- [ ] Invitation opens Move Free, not Vercel or Supabase.
- [ ] Patient creates an eight-or-more-character password once.
- [ ] Patient record is linked and `/patient` shows the assigned program.
- [ ] Refreshing `/patient` preserves the session.
- [ ] Reopening the invitation shows an expired/used-link explanation rather than a blank page.

## Normal and second-device login

- [ ] Patient signs out and logs in at `/login` with email/password.
- [ ] Patient logs in with the same credentials on a second browser or device.
- [ ] Both sessions remain usable after refresh.
- [ ] Patient is routed to `/patient`; clinician is routed to `/dashboard`.
- [ ] A patient cannot read another patient's records.
- [ ] A clinician cannot read another clinician's patients.

## Password recovery

- [ ] Forgot-password request shows a neutral success message.
- [ ] A second request is disabled for 60 seconds.
- [ ] Recovery email opens `/reset-password` with a valid session.
- [ ] Mismatched passwords are rejected locally.
- [ ] Updating the password signs out the temporary recovery session.
- [ ] Old password fails; new password works on two devices.
- [ ] Reusing the recovery email shows an expired/used-link message.
- [ ] Opening an older email after requesting a newer one shows the same clear message.

## Negative and operational cases

- [ ] Incorrect password shows `invalid_credentials` guidance without revealing sensitive data.
- [ ] Existing patient email is never sent through clinician signup.
- [ ] Missing recovery session offers a new reset link.
- [ ] Email rate limit returns a wait-and-use-the-newest-email message.
- [ ] Repeated clicks cannot submit invite, login, reset, or password update twice.
- [ ] Vercel logs contain structured auth event/code/status only—no email, password, access token, refresh token, or invitation token.
