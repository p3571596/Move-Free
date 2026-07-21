import Link from "next/link";

export default async function AuthErrorPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const message = reason === "expired_or_used"
    ? "This secure link has expired or has already been used. Request a new link and use only the newest email."
    : "This secure link is incomplete and could not be verified.";

  return <main className="auth-page"><section className="auth-panel">
    <p className="eyebrow">Move Free secure access</p>
    <h2>We could not open that link</h2>
    <p className="muted" role="alert">{message}</p>
    <Link className="button" href="/login" style={{ marginTop: 18 }}>Return to login</Link>
    <Link className="secondary-button" href="/forgot-password" style={{ marginTop: 12 }}>Request a password reset</Link>
  </section></main>;
}
