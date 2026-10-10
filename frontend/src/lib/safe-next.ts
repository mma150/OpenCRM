// A stand-in origin: a `next` value is safe only if the browser's own URL parser keeps it here.
const APP_ORIGIN = "http://app.invalid";

// Where to go after signing in. `next` comes from the address bar, so it is untrusted:
// only a path inside this app is accepted, never another site ("//evil.example", "https://...").
export function safeNextPath(next: string | null | undefined): string {
  if (!next?.startsWith("/")) {
    return "/";
  }
  try {
    const url = new URL(next, APP_ORIGIN);
    return url.origin === APP_ORIGIN ? `${url.pathname}${url.search}${url.hash}` : "/";
  } catch {
    return "/";
  }
}
