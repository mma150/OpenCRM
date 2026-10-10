import { DetailLink } from "@/components/shared/record-layout";

// What the API accepts as a website: "example.com", "www.example.com/about" or the same
// with http:// or https:// in front. No other scheme (javascript:, data:) passes.
export const WEBSITE_PATTERN = /^(https?:\/\/)?[^\s:/]+\.\S+$/i;

// The address a company's website is opened at. People type "example.com" as often as
// "https://example.com", so a missing scheme becomes https. A value that does not pass the
// API's rule gives null and is then shown as text, never as a link.
export function websiteHref(website: string): string | null {
  if (!WEBSITE_PATTERN.test(website)) {
    return null;
  }
  const address = /^https?:\/\//i.test(website) ? website : `https://${website}`;
  try {
    const url = new URL(address);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

// How the website is written on screen: without the scheme and without a trailing slash.
export function websiteLabel(website: string): string {
  return website.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

// A company's website as a link that opens in a new tab.
export function WebsiteLink({ website }: { website: string }) {
  const href = websiteHref(website);
  if (!href) {
    return <span className="wrap-anywhere">{website}</span>;
  }
  return (
    <DetailLink href={href} external>
      {websiteLabel(website)}
    </DetailLink>
  );
}
