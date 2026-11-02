import { createFileRoute } from "@tanstack/react-router";
import { Captcha } from "@/components/captcha";

/**
 * The captcha for the phone app: the app shows this page in a small web view and gets
 * the one-use token back (window.ReactNativeWebView.postMessage). Not for people to visit.
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

function CaptchaPage() {
  const { lang, theme } = Route.useSearch();
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.body.style.background = "transparent";
  }
  const post = (msg: Record<string, unknown>) => {
    const w = window as unknown as { ReactNativeWebView?: { postMessage: (m: string) => void } };
    w.ReactNativeWebView?.postMessage(JSON.stringify(msg));
  };
  return (
    <main className="flex min-h-dvh items-center justify-center bg-transparent p-2">
      <div className="w-full max-w-sm">
        <Captcha
          onToken={(token) => post({ captcha: token })}
          onInteractive={(shown) => post({ interactive: shown })}
          {...(lang ? { lang } : {})}
        />
      </div>
    </main>
  );
}
