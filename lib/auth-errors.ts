import type { AuthError } from "@supabase/supabase-js";

export type AuthFailure = {
  message: string;
  code?: string;
};

// Whitelist provider failure codes; never echo raw Auth responses to patients.
export function describePatientAuthError(error: { code?: string; status?: number }) {
  const code = error.code;
  if (code === "weak_password") return { code, status: 422, error: "This password was rejected because it is weak or easy to guess. Choose a different, unique password of at least 12 characters. A password manager can generate one." };
  if (code === "same_password") return { code, status: 422, error: "Your new password must be different from your current password. Choose a different password." };
  if (code === "email_exists" || code === "user_already_exists" || code === "user_already_registered") return { code: "account_exists", status: 409, error: "This email already has an account. Use its existing password to sign in. If you never set a password or forgot it, ask your clinician for a password reset link." };
  if (code === "email_address_invalid" || code === "validation_failed") return { code: "invalid_account_details", status: 400, error: "The account details were rejected. Check the email address and enter a valid password, then try again." };
  if (error.status === 429 || code === "over_request_rate_limit" || code === "over_email_send_rate_limit") return { code: "rate_limited", status: 429, error: "Too many attempts were made. Wait a few minutes before trying again." };
  if (code === "signup_disabled") return { code, status: 503, error: "Account registration is temporarily disabled. Ask your clinician for help." };
  if (code === "user_banned") return { code: "account_unavailable", status: 403, error: "This account cannot sign in right now. Contact your clinician for help." };
  return { code: "auth_unavailable", status: 503, error: "The account service could not complete this request. Try again later or contact your clinician." };
}

export function describeAuthError(error: AuthError, action: "login" | "signup" | "recovery" | "password-update"): AuthFailure {
  const code = error.code ?? undefined;
  if (["weak_password", "same_password", "email_exists", "user_already_exists", "user_already_registered", "email_address_invalid", "validation_failed", "signup_disabled", "user_banned"].includes(code ?? "")) {
    const failure = describePatientAuthError(error);
    return { message: failure.error, code: failure.code };
  }

  if (code === "invalid_credentials" || /invalid login credentials/i.test(error.message)) {
    return {
      message: "The email or password is incorrect. Check the address used for the invitation, or reset the password.",
      code: code ?? "invalid_credentials",
    };
  }

  if (code === "email_not_confirmed" || /email not confirmed/i.test(error.message)) {
    return {
      message: "This email is not confirmed yet. Confirm your email or reopen your patient invitation. If you are a patient and email does not arrive, ask your clinician for a password reset link.",
      code: code ?? "email_not_confirmed",
    };
  }

  if (error.status === 429 || /rate limit/i.test(error.message)) {
    return {
      message: "Too many attempts were made. Wait a few minutes before trying again. If you request another link, use only the newest one.",
      code: code ?? "rate_limited",
    };
  }

  if (code === "otp_expired" || /expired|one-time token not found|otp.*invalid/i.test(error.message)) {
    return {
      message: "This secure link has expired or was already used. Request a new email and use only the newest link.",
      code: code ?? "expired_or_used_link",
    };
  }

  if (/session.*missing|auth session missing|jwt/i.test(error.message)) {
    return {
      message: "The secure recovery session is missing. Request a new password-reset email on this device.",
      code: code ?? "missing_recovery_session",
    };
  }

  const fallback = action === "login"
    ? "Login failed. Try again or reset the password."
    : action === "signup"
      ? "The account could not be created."
      : action === "recovery"
        ? "The password reset email could not be sent."
        : "The password could not be updated.";

  return { message: fallback, code };
}

export function reportAuthError(context: string, error: AuthError) {
  // Structured diagnostics intentionally omit email addresses, passwords,
  // access tokens, refresh tokens, and invitation tokens.
  console.error(JSON.stringify({
    event: "auth_failure",
    context,
    code: error.code ?? "unknown",
    status: error.status,
  }));
}

export function normalizeAuthEmail(email: string) {
  return email.trim().toLowerCase();
}
