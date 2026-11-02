import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile: proves a person (not a script) is behind a sign-in, sign-up,
 * password reset or public booking. Most people never see a puzzle. Without the
 * site key nothing renders and forms work as before.
 */
// The site key is public (it ships in every page); the secret one lives only on the servers.
export const CAPTCHA_SITE_KEY: string | undefined =
  import.meta.env["VITE_TURNSTILE_SITE_KEY"] || "0x4AAAAAAFwmplaginRcufQi";
export const CAPTCHA_ON = !!CAPTCHA_SITE_KEY;

type Turnstile = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
};

let loading: Promise<Turnstile> | null = null;
function loadTurnstile(): Promise<Turnstile> {
  const w = window as unknown as { turnstile?: Turnstile };
  if (w.turnstile) return Promise.resolve(w.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => (w.turnstile ? resolve(w.turnstile) : reject(new Error("turnstile")));
    s.onerror = () => {
      loading = null;
      reject(new Error("turnstile"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * The check box. `onToken` gets a fresh one-use token (or null when it expires);
 * change `resetKey` after each submit to get a new token for the next try.
 */
export function Captcha({
  onToken,
  resetKey = 0,
  lang,
  onInteractive,
}: {
  onToken: (token: string | null) => void;
  resetKey?: number;
  lang?: string;
  /** True while a puzzle is shown (the phone app makes room for it). */
  onInteractive?: (shown: boolean) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const cb = useRef(onToken);
  cb.current = onToken;
  const shown = useRef(onInteractive);
  shown.current = onInteractive;

  useEffect(() => {
    if (!CAPTCHA_SITE_KEY || !box.current) return;
    let id: string | null = null;
    let gone = false;
    cb.current(null);
    void loadTurnstile()
      .then((t) => {
        if (gone || !box.current) return;
        id = t.render(box.current, {
          sitekey: CAPTCHA_SITE_KEY,
          size: "flexible",
          appearance: "interaction-only",
          ...(lang ? { language: lang } : {}),
          theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
          callback: (token: string) => cb.current(token),
          "expired-callback": () => cb.current(null),
          "error-callback": () => cb.current(null),
          "before-interactive-callback": () => shown.current?.(true),
          "after-interactive-callback": () => shown.current?.(false),
        });
      })
      .catch(() => cb.current(null));
    return () => {
      gone = true;
      const w = window as unknown as { turnstile?: Turnstile };
      if (id && w.turnstile) w.turnstile.remove(id);
    };
  }, [resetKey, lang]);

  if (!CAPTCHA_SITE_KEY) return null;
  return <div ref={box} className="min-h-0 empty:hidden" />;
}
