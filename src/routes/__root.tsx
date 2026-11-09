import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Analytics } from "@vercel/analytics/react";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { PrefsProvider, usePrefs } from "@/lib/prefs";
import { initNativeShell } from "@/lib/native";

function NotFoundComponent() {
  const { t } = usePrefs();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="font-display text-7xl font-bold tracking-tight text-brand">404</p>
        <h1 className="mt-4 font-display text-2xl font-bold text-foreground">
          {t("ui.notFound.title")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("ui.notFound.body")}</p>
        <div className="mt-6">
          <Button asChild>
            <Link to="/">{t("ui.notFound.goHome")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset?: () => void }) {
  console.error(error);
  const router = useRouter();
  const { t } = usePrefs();
  useEffect(() => {
    console.error("[app] root error boundary", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t("ui.error.page.title")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("ui.error.page.body")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button
            onClick={() => {
              router.invalidate();
              reset?.();
            }}
          >
            {t("ui.error.page.tryAgain")}
          </Button>
          <Button asChild variant="outline">
            <a href="/">{t("ui.error.page.goHome")}</a>
          </Button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "SYCRAS — Marcações online" },
      { name: "description", content: "Marcações online simples para negócios em Portugal." },
      { name: "author", content: "SYCRAS" },
      { property: "og:title", content: "SYCRAS — Marcações online" },
      {
        property: "og:description",
        content: "Marcações online simples para negócios em Portugal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#f4f7fb" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "SYCRAS" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Playfair+Display:wght@600&family=Inter:wght@400;500;600;700&display=swap",
      },
      { rel: "icon", href: "/favicon.png?v=2", type: "image/png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png?v=2" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent as never,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        {/* Anonymous visit counts (no cookies, nobody identified), to see what brings sign-ups. */}
        <Analytics />
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  // Password-recovery links carry the token in the URL hash and can land on
  // any route (old published builds, site URL fallbacks, etc.). Forward them
  // to /reset-password, preserving the hash so the session is picked up.
  useEffect(() => {
    const { pathname, hash } = window.location;
    if (hash.includes("type=recovery") && pathname !== "/reset-password") {
      window.location.replace(`/reset-password${hash}`);
    }
  }, []);

  // Native app: Android back button, and the splash leaves once the page is ready.
  useEffect(() => {
    void initNativeShell();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <PrefsProvider>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        <Toaster position="top-center" />
      </PrefsProvider>
    </QueryClientProvider>
  );
}
