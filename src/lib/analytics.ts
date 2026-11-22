import { track } from "@vercel/analytics";

/**
 * Conversion counts without cookies. Vercel Web Analytics counts each event anonymously
 * (no cookie, nobody identified). The campaign a visit came from (utm_* in the link) is kept
 * in this tab only (sessionStorage), so a sign-up can be credited to the ad or post that
 * brought it. Nothing here identifies a person.
 */
const KEY = "sycras.utm";
const FIELDS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

type Utm = Partial<Record<(typeof FIELDS)[number] | "ref", string>>;

/**
 * Remembers where the visit came from: a link with a campaign (utm_*) always counts; without
 * one, the first page of the tab keeps only the site it came from.
 */
export function captureUtm(): void {
  try {
    const q = new URLSearchParams(window.location.search);
    const utm: Utm = {};
    for (const f of FIELDS) {
      const v = q.get(f);
      if (v) utm[f] = v.slice(0, 80);
    }
    if (Object.keys(utm).length === 0 && sessionStorage.getItem(KEY)) return;
    // Only the other site's domain, never the full address.
    if (document.referrer) {
      const host = new URL(document.referrer).hostname;
      if (host && host !== window.location.hostname) utm.ref = host;
    }
    sessionStorage.setItem(KEY, JSON.stringify(utm));
  } catch {
    // Private mode or storage blocked: count without the campaign.
  }
}

function campaign(): Utm {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "{}") as Utm;
  } catch {
    return {};
  }
}

/** Counts one event (e.g. "cta_click") with a few plain details plus the visit's campaign. */
export function trackEvent(name: string, props: Record<string, string | number> = {}): void {
  try {
    track(name, { ...campaign(), ...props });
  } catch {
    // Analytics must never break the page.
  }
}
