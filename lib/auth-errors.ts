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
      message: "Too many attempts were made. Wait a few minutes, then try again.",
      code: code ?? "rate_limited",
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
  console.error(`[auth:${context}]`, {
    code: error.code ?? "unknown",
    status: error.status,
    message: error.message,
  });
}

export function normalizeAuthEmail(email: string) {
  return email.trim().toLowerCase();
}
