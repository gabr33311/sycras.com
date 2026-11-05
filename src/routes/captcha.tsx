import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { Captcha } from "@/components/captcha";

/**
 * The captcha for the phone app: the app shows this page in a small web view and gets
 * the one-use token back (window.ReactNativeWebView.postMessage), plus the height to
 * give the view, so it sits flush with the form (no scroll bars). Not for people to visit.
 */
export const Route = createFileRoute("/captcha")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    lang: typeof s["lang"] === "string" ? (s["lang"] as string).slice(0, 5) : undefined,
    theme: s["theme"] === "dark" ? ("dark" as const) : ("light" as const),
  }),
  head: () => ({ meta: [{ title: "SYCRAS" }, { name: "robots", content: "noindex" }] }),
  component: CaptchaPage,
});

// Turnstile is never narrower than this; smaller screens get it scaled down to fit.
const MIN_WIDTH = 300;

function post(msg: Record<string, unknown>) {
  const w = window as unknown as { ReactNativeWebView?: { postMessage: (m: string) => void } };
  w.ReactNativeWebView?.postMessage(JSON.stringify(msg));
}

function CaptchaPage() {
  const { lang, theme } = Route.useSearch();
  const inner = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    for (const el of [root, document.body]) {
      el.style.background = "transparent";
      el.style.margin = "0";
      el.style.padding = "0";
      el.style.overflow = "hidden";
    }
    const box = inner.current;
    if (!box) return;
    let last = -1;
    const fit = () => {
      const width = window.innerWidth;
      const scale = width > 0 && width < MIN_WIDTH ? width / MIN_WIDTH : 1;
      box.style.width = scale < 1 ? `${MIN_WIDTH}px` : "100%";
      box.style.transform = scale < 1 ? `scale(${scale})` : "";
      const height = Math.ceil(box.offsetHeight * scale);
      if (height !== last) {
        last = height;
        post({ height });
      }
    };
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    window.addEventListener("resize", fit);
    fit();
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [theme]);

  return (
    <div ref={inner} style={{ transformOrigin: "top left" }}>
      <Captcha
        onToken={(token) => post({ captcha: token })}
        onInteractive={(shown) => post({ interactive: shown })}
        {...(lang ? { lang } : {})}
      />
    </div>
  );
}
