import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Too many requests from one network or account: 429 before the route runs (pages are not
// counted, only API routes and server functions).
const rateLimitMiddleware = createMiddleware().server(
  async ({ request, pathname, handlerType, serverFnMeta, next }) => {
    if (handlerType === "serverFn" || pathname.startsWith("/api/")) {
      const { rateLimitResponse } = await import("@/lib/rate-limit.server");
      const blocked = await rateLimitResponse(request, pathname, serverFnMeta?.name);
      if (blocked) return blocked;
    }
    return next();
  },
);

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware, csrfMiddleware, rateLimitMiddleware],
}));
