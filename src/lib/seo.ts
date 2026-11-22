/** The public address of the site: every link a crawler (Google, WhatsApp, Facebook) reads is absolute. */
export const SITE = "https://sycras.com";
/** The picture shown when a SYCRAS link is shared (1200×630). */
export const OG_IMAGE = `${SITE}/og-image.png`;

type Seo = {
  title: string;
  description: string;
  /** Path of the page, e.g. "/termos" (the canonical address). */
  path: string;
  image?: string | undefined;
  /** Small square card (a logo) instead of the large picture. */
  smallCard?: boolean;
  noindex?: boolean;
};

/** The title, description, sharing card and canonical address of one page, in one place. */
export function seo({ title, description, path, image = OG_IMAGE, smallCard, noindex }: Seo) {
  const url = `${SITE}${path === "/" ? "" : path}`;
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:url", content: url || SITE },
      { property: "og:image", content: image },
      ...(image === OG_IMAGE
        ? [
            { property: "og:image:width", content: "1200" },
            { property: "og:image:height", content: "630" },
            { property: "og:image:alt", content: "SYCRAS — marcações online" },
          ]
        : []),
      { name: "twitter:card", content: smallCard ? "summary" : "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: image },
      ...(noindex ? [{ name: "robots", content: "noindex" }] : []),
    ],
    links: [{ rel: "canonical", href: url || SITE }],
  };
}

/** The questions shown on the homepage, in the order they appear (also given to Google as FAQ). */
export const LANDING_FAQ = [
  ["home.faq.1.q", "home.faq.1.a"],
  ["home.faq.2.q", "home.faq.2.a"],
  ["lp.faq.5.q", "lp.faq.5.a"],
  ["lp.faq.6.q", "lp.faq.6.a"],
  ["home.faq.3.q", "home.faq.3.a"],
] as const;

/**
 * What Google reads about SYCRAS on the homepage: who makes it, the app and its price, and the FAQ.
 * Only facts already written on the page (no ratings, no invented numbers).
 */
export function landingJsonLd(t: (key: string) => string) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE}/#org`,
        name: "SYCRAS",
        url: SITE,
        logo: `${SITE}/icon-512.png`,
        email: "suporte@sycras.com",
      },
      {
        "@type": "SoftwareApplication",
        name: "SYCRAS",
        url: SITE,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Android, Web",
        inLanguage: "pt-PT",
        publisher: { "@id": `${SITE}/#org` },
        description:
          "Página de marcações online, agenda e clientes para negócios em Portugal. 14 dias grátis, sem cartão.",
        offers: [
          {
            "@type": "Offer",
            name: "SYCRAS Pro — mensal",
            price: "19",
            priceCurrency: "EUR",
          },
          {
            "@type": "Offer",
            name: "SYCRAS Pro — anual (por mês)",
            price: "15",
            priceCurrency: "EUR",
          },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: LANDING_FAQ.map(([q, a]) => ({
          "@type": "Question",
          name: t(q),
          acceptedAnswer: { "@type": "Answer", text: t(a) },
        })),
      },
    ],
  };
}
