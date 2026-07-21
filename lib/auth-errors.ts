import type { AuthError } from "@supabase/supabase-js";

export type AuthFailure = {
  message: string;
  code?: string;
};

export function describeAuthError(error: AuthError, action: "login" | "signup" | "recovery" | "password-update"): AuthFailure {
  const code = error.code ?? undefined;

  if (code === "invalid_credentials" || /invalid login credentials/i.test(error.message)) {
    return {
      message: "The email or password is incorrect. Check the address used for the invitation, or reset the password.",
      code: code ?? "invalid_credentials",
    };
  }

  if (code === "email_not_confirmed" || /email not confirmed/i.test(error.message)) {
    return {
      message: "Confirm this email address before signing in. Check the inbox and spam folder for the Supabase confirmation email.",
      code: code ?? "email_not_confirmed",
    };
  }

  if (error.status === 429 || /rate limit/i.test(error.message)) {
    return {
      message: "Too many email requests were made. Wait a few minutes before requesting another email, then use only the newest link.",
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

  return { message: error.message || fallback, code };
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
