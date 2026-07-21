export function safeAuthRedirect(value: string | null, fallback: string) {
  if (!value) return fallback;
  try {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const candidate = new URL(value, base);
    const expected = new URL(base);
    if (candidate.origin !== expected.origin) return fallback;
    return `${candidate.pathname}${candidate.search}${candidate.hash}`;
  } catch {
    return fallback;
  }
}
