import { createFileRoute } from "@tanstack/react-router";

import { SITE } from "@/lib/seo";

/** The public pages Google should know about (the legal pages stay out: they are noindex). */
const STATIC = ["/", "/beta", "/eliminar-conta"];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Every published business page whose owner left "show on Google" on, plus the site's own pages.
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const { sitemapPages } = await import("@/lib/booking.server");
        const pages = await sitemapPages().catch(() => []);
        const urls = [
          ...STATIC.map((p) => ({ loc: `${SITE}${p === "/" ? "" : p}`, lastmod: null })),
          ...pages
            .filter((p) => p.slug !== "exemplo")
            .map((p) => ({
              loc: `${SITE}/${p.slug}`,
              lastmod: p.updated_at?.slice(0, 10) ?? null,
            })),
        ];
        const body =
          `<?xml version="1.0" encoding="UTF-8"?>\n` +
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
          urls
            .map(
              (u) =>
                `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}</url>`,
            )
            .join("\n") +
          `\n</urlset>\n`;
        return new Response(body, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600, s-maxage=3600",
          },
        });
      },
    },
  },
});
