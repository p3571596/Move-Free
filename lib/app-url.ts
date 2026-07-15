const APP_URL_VARIABLE = "NEXT_PUBLIC_APP_URL";

export function getCanonicalAppUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!configuredUrl) {
    throw new Error(`${APP_URL_VARIABLE} is not configured. Set it to the public production domain.`);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(configuredUrl);
  } catch {
    throw new Error(`${APP_URL_VARIABLE} must be a valid absolute URL.`);
  }

  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    throw new Error(`${APP_URL_VARIABLE} must use http or https.`);
  }

  if (parsedUrl.pathname !== "/" || parsedUrl.search || parsedUrl.hash) {
    throw new Error(`${APP_URL_VARIABLE} must contain only the app origin, without a path, query, or hash.`);
  }

  return parsedUrl.origin;
}

export function getAppRoute(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getCanonicalAppUrl()}${normalizedPath}`;
}
