import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { effectiveBrand } from "@/lib/brand";
import { usePrefs } from "@/lib/prefs";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { useSubscription } from "@/hooks/use-subscription";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui-bits";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { initials, weekdaysShort } from "@/lib/format";
import { useMyBusiness } from "@/hooks/use-business";
import { useLogoUrl } from "@/hooks/use-logo";
import { BusinessPanel } from "@/components/panels/business-panel";
import { ServicesPanel } from "@/components/panels/services-panel";
import { TeamPanel } from "@/components/panels/team-panel";
import { AvailabilityPanel } from "@/components/panels/availability-panel";
import { PublicPagePanel } from "@/components/panels/public-page-panel";
import { SharePanel } from "@/components/panels/share-panel";
import { ShareSheet } from "@/components/share-sheet";
import { AnalyticsPanel } from "@/components/panels/analytics-panel";
import { SettingsPanel } from "@/components/panels/settings-panel";
import { RemindersPanel } from "@/components/panels/reminders-panel";
import {
  ArrowLeft,
  ArrowUpRight,
  BellRing,
  Crown,
  Pencil,
  ChevronRight,
  Clock,
  Palette,
  Scissors,
  Settings,
  Share2,
  SlidersHorizontal,
  Users,
  CalendarOff,
} from "lucide-react";

const SECTION_IDS = [
  "info",
  "page",
  "share",
  "services",
  "team",
  "hours",
  "timeoff",
  "rules",
  "reminders",
  "analytics",
  "settings",
] as const;
type SectionId = (typeof SECTION_IDS)[number];

export const Route = createFileRoute("/_authenticated/profile")({
  validateSearch: z.object({ section: z.enum(SECTION_IDS).optional() }),
  head: () => ({
    meta: [
      { title: "Gestão — SYCRAS" },
      {
        name: "description",
        content: "Business, services, team, hours and stats in one place.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProfilePage,
});

type Row = { id: SectionId; icon: ComponentType<{ className?: string }> };

/**
 * The menu. The business itself (details, page look, link) is one card on top;
 * below, the setup in themed pairs, then the plan. On phones it all fits the
 * screen: the tiles stretch to fill what is left, with no scroll.
 */
const GROUPS: { title: string; rows: Row[] }[] = [
  {
    title: "pf.group.offer",
    rows: [
      { id: "services", icon: Scissors },
      { id: "team", icon: Users },
    ],
  },
  {
    title: "pf.group.time",
    rows: [
      { id: "hours", icon: Clock },
      { id: "timeoff", icon: CalendarOff },
    ],
  },
  {
    title: "pf.group.bookings",
    rows: [
      { id: "rules", icon: SlidersHorizontal },
      { id: "reminders", icon: BellRing },
    ],
  },
];

/** Gold only here: the one premium element on the screen. */
const GOLD = "#c9a227";

function ProfilePage() {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const { section } = Route.useSearch();
  // The open section lives in the URL: the phone's back button closes it.
  const setSection = (id: SectionId | null) =>
    void navigate({ to: "/profile", search: id ? { section: id } : {} });
  const label = (id: SectionId) => t(`pf.s.${id}`);
  const desc = (id: SectionId) => t(`pf.s.${id}.desc`);
  // Phones drill into one section at a time; from md up the menu stays on the
  // left and the first section fills the right column by default.
  const shown: SectionId = section ?? "info";
  const [shareOpen, setShareOpen] = useState(false);
  const isPhone = !useMediaQuery("(min-width: 768px)");
  const { business } = useMyBusiness();
  const logoUrl = useLogoUrl(business?.logo_url);
  const summary = useManageSummary();
  const { access } = useSubscription();
  const qc = useQueryClient();
  // Back on the menu after editing something: refresh the live states.
  useEffect(() => {
    if (!section) void qc.invalidateQueries({ queryKey: ["manage-summary"] });
  }, [section, qc]);

  // Phones: the grid takes exactly the height left above the dock.
  const gridRef = useRef<HTMLDivElement>(null);
  const [gridH, setGridH] = useState<number | null>(null);
  useEffect(() => {
    if (!isPhone || section) return;
    const el = gridRef.current;
    if (!el) return;
    const fit = () => {
      const main = el.closest("main");
      const bottom = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;
      const top = el.getBoundingClientRect().top + window.scrollY;
      setGridH(Math.max(260, Math.floor(window.innerHeight - top - bottom)));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [isPhone, section, business]);
  // Short screens: icon beside the name; tall ones: icon on top, text at the bottom.
  const roomy = gridH !== null && (gridH - 3 * 8) / 4 >= 100;

  const tile = (row: Row, phone: boolean) => {
    const status = summary[row.id];
    const active = !phone && shown === row.id;
    const text = (
      <span
        className={cn(
          "mt-0.5 flex min-w-0 items-center gap-1 text-[11px] font-semibold leading-snug md:mt-1 md:text-xs",
          status?.warn ? "text-st-pending-fg" : "text-muted-foreground",
        )}
      >
        {status?.warn && (
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-st-pending" />
        )}
        <span className="truncate">{status?.text ?? desc(row.id)}</span>
      </span>
    );
    const name = phone && row.id === "rules" ? t("pf.s.rules.short") : label(row.id);
    if (phone)
      return (
        <button
          key={row.id}
          type="button"
          onClick={() => setSection(row.id)}
          className={cn(
            "surface flex min-h-0 min-w-0 flex-col p-3 text-left transition-[background-color,transform] duration-150 active:scale-[0.97] active:bg-muted",
            roomy ? "justify-between" : "justify-center",
          )}
        >
          {roomy ? (
            <span className="flex size-9 items-center justify-center rounded-xl bg-muted text-foreground">
              <row.icon className="size-[18px]" />
            </span>
          ) : null}
          <span className="block w-full min-w-0">
            <span className="flex items-center gap-1.5">
              {!roomy && <row.icon className="size-4 shrink-0 text-muted-foreground" />}
              <span className="truncate text-sm font-bold leading-tight">{name}</span>
            </span>
            {text}
          </span>
        </button>
      );
    return (
      <button
        key={row.id}
        type="button"
        onClick={() => setSection(row.id)}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group flex min-h-[4rem] w-full items-center gap-3.5 px-4 py-3 text-left transition-[background-color,transform] duration-150 hover:bg-muted/50 active:scale-[0.985] active:bg-muted",
          active && "bg-muted",
        )}
      >
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl transition-colors",
            active ? "bg-brand text-brand-foreground" : "bg-muted text-foreground",
          )}
        >
          <row.icon className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold leading-tight">{label(row.id)}</span>
          {text}
        </span>
      </button>
    );
  };

  // The plan, in words that match its state.
  const pro = access
    ? access.state === "active"
      ? {
          title: t("pf.pro.active"),
          sub: access.periodEnd
            ? t("pf.pro.renews").replace(
                "{date}",
                new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long" }).format(
                  access.periodEnd,
                ),
              )
            : t("pf.pro.all"),
          warn: false,
        }
      : access.state === "past_due"
        ? { title: t("pf.pro.pastDue"), sub: t("pf.pro.pastDue.sub"), warn: true }
        : access.state === "trial"
          ? {
              title: t("pf.pro.trial"),
              sub: t(access.trialDaysLeft === 1 ? "pf.pro.trial.one" : "pf.pro.trial.many").replace(
                "{n}",
                String(access.trialDaysLeft),
              ),
              warn: false,
            }
          : { title: t("pf.pro.ended"), sub: t("pf.pro.ended.sub"), warn: true }
    : null;
  const proCard = pro && (
    <button
      type="button"
      onClick={() => void navigate({ to: "/plans" })}
      className="surface col-span-2 flex min-h-0 w-full items-center gap-3 p-3 text-left transition-[background-color,transform] duration-150 active:scale-[0.98] active:bg-muted md:p-4"
      style={{ borderColor: pro.warn ? "var(--destructive)" : `${GOLD}8c` }}
    >
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-xl"
        style={{ backgroundColor: `${GOLD}24` }}
      >
        <Crown className="size-5" style={{ color: GOLD }} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold leading-tight">{pro.title}</span>
        <span className="mt-0.5 line-clamp-2 text-xs font-semibold text-muted-foreground">
          {pro.sub}
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" strokeWidth={2.5} />
    </button>
  );

  const pageStatus = summary.page;
  const infoStatus = summary.info;

  return (
    <AppShell>
      <PageHeader
        title={section && isPhone ? label(section) : t("pf.manage.title")}
        action={
          !section || !isPhone ? (
            <Button size="sm" variant="outline" onClick={() => void navigate({ to: "/settings" })}>
              <Settings className="size-4" />
              {t("pf.s.settings")}
            </Button>
          ) : null
        }
        leading={
          section ? (
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("pf.back")}
              className="text-foreground md:hidden"
              onClick={() => setSection(null)}
            >
              <ArrowLeft className="size-5" strokeWidth={2.5} />
            </Button>
          ) : null
        }
      />

      <div className="md:grid md:grid-cols-[280px_minmax(0,1fr)] md:items-start md:gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div
          className={cn("space-y-2 md:sticky md:top-24 md:space-y-5", section && "hidden md:block")}
        >
          {/* The business in one card: who, where, its page, and what to do with it. */}
          {business && (
            <div className="surface p-3.5">
              <div className="flex items-center gap-3">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt=""
                    className="size-12 shrink-0 rounded-xl object-cover ring-1 ring-border"
                  />
                ) : (
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand text-sm font-bold text-brand-foreground">
                    {initials(business.name)}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-1 font-display text-base font-bold leading-tight">
                    {business.name}
                  </span>
                  <span className="mt-0.5 block truncate text-xs font-semibold text-brand-ink">
                    sycras.com/{business.slug}
                  </span>
                  <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] font-semibold">
                    <span
                      aria-hidden
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        pageStatus?.warn ? "bg-st-pending" : "bg-st-confirmed",
                      )}
                    />
                    <span
                      className={cn(
                        "shrink-0",
                        pageStatus?.warn ? "text-st-pending-fg" : "text-muted-foreground",
                      )}
                    >
                      {pageStatus?.text}
                    </span>
                    {infoStatus && (
                      <span
                        className={cn(
                          "truncate",
                          infoStatus.warn ? "text-st-pending-fg" : "text-muted-foreground",
                        )}
                      >
                        · {infoStatus.text}
                      </span>
                    )}
                  </span>
                </span>
              </div>
              {/* Four actions, each named: edit details, page look, share, open. */}
              <div className="mt-3 grid grid-cols-4 gap-1.5">
                {(
                  [
                    ["info", Pencil, t("pf.biz.edit")],
                    ["page", Palette, t("pf.biz.look")],
                  ] as const
                ).map(([id, Icon, text]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSection(id)}
                    aria-current={!isPhone && shown === id ? "page" : undefined}
                    className={cn(
                      "flex h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl bg-muted px-1 text-[11px] font-bold transition-[background-color,transform] active:scale-95",
                      !isPhone && shown === id && "ring-2 ring-brand",
                    )}
                  >
                    <Icon className="size-4" />
                    <span className="max-w-full truncate">{text}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setShareOpen(true)}
                  className="flex h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl bg-muted px-1 text-[11px] font-bold transition-[background-color,transform] active:scale-95"
                >
                  <Share2 className="size-4" />
                  <span className="max-w-full truncate">{t("pf.s.share")}</span>
                </button>
                <a
                  href={`/${business.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl bg-primary px-1 text-[11px] font-bold text-primary-foreground transition-transform active:scale-95"
                >
                  <ArrowUpRight className="size-4" />
                  <span className="max-w-full truncate md:hidden">{t("pf.biz.open")}</span>
                  <span className="hidden max-w-full truncate md:inline">
                    {t("pf.biz.openShort")}
                  </span>
                </a>
              </div>
            </div>
          )}

          {/* Phones: three themed pairs and the plan, stretched to fill the screen. */}
          <div
            ref={gridRef}
            className="grid grid-cols-2 grid-rows-4 gap-2 md:hidden"
            style={gridH ? { height: gridH } : undefined}
          >
            {GROUPS.flatMap((group) => group.rows).map((row) => tile(row, true))}
            {proCard}
          </div>

          {GROUPS.map((group) => (
            <section key={group.title} className="hidden md:block">
              <h2 className="mb-1.5 px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                {t(group.title)}
              </h2>
              <nav className="surface divide-y divide-border overflow-hidden p-0">
                {group.rows.map((row) => tile(row, false))}
              </nav>
            </section>
          ))}
          <div className="hidden md:block">{proCard}</div>
        </div>

        <div key={shown} className={cn("animate-enter min-w-0", !section && "hidden md:block")}>
          {/* The open setting's own title on wide screens; phones show it in the header. */}
          <div className="mb-4 hidden md:block">
            <h2 className="font-display text-xl font-bold leading-tight">{label(shown)}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{desc(shown)}</p>
          </div>
          <p className="mb-4 text-sm text-muted-foreground md:hidden">{desc(shown)}</p>
          {shown === "info" && <BusinessPanel />}
          {shown === "page" && <PublicPagePanel />}
          {shown === "share" && (
            <div className="surface flex justify-center px-4 py-8">
              <SharePanel />
            </div>
          )}
          {shown === "services" && <ServicesPanel />}
          {shown === "team" && <TeamPanel />}
          {shown === "hours" && <AvailabilityPanel view="hours" />}
          {shown === "timeoff" && <AvailabilityPanel view="off" />}
          {shown === "rules" && <AvailabilityPanel view="rules" />}
          {shown === "reminders" && <RemindersPanel />}
          {shown === "analytics" && <AnalyticsPanel />}
          {shown === "settings" && <SettingsPanel />}
        </div>
      </div>
      <ShareSheet open={shareOpen} onOpenChange={setShareOpen} />
    </AppShell>
  );
}

type RowStatus = { text: string; warn?: boolean; dot?: string };

/** "Seg–Sex" style label for a set of weekdays (0 = Sunday), Monday first. */
function daysLabel(days: number[], short: string[], every: string): string {
  const order = [1, 2, 3, 4, 5, 6, 0].filter((d) => days.includes(d));
  if (order.length === 7) return every;
  const runs: number[][] = [];
  for (const d of order) {
    const pos = [1, 2, 3, 4, 5, 6, 0].indexOf(d);
    const last = runs.at(-1);
    const lastPos = last ? [1, 2, 3, 4, 5, 6, 0].indexOf(last.at(-1)!) : -2;
    if (last && pos === lastPos + 1) last.push(d);
    else runs.push([d]);
  }
  return runs
    .map((r) =>
      r.length > 2 ? `${short[r[0]!]}–${short[r.at(-1)!]}` : r.map((d) => short[d]).join(", "),
    )
    .join(", ");
}

/** The current state of each Manage row, shown under its name. */
function useManageSummary(): Partial<Record<SectionId, RowStatus>> {
  const { t } = usePrefs();
  const { business } = useMyBusiness();
  const { data } = useQuery({
    queryKey: ["manage-summary", business?.id],
    enabled: !!business,
    staleTime: 30_000,
    queryFn: async () => {
      const id = business!.id;
      const [services, staff, hours] = await Promise.all([
        supabase.from("services").select("is_active, requires_confirmation").eq("business_id", id),
        supabase.from("staff").select("id").eq("business_id", id).eq("is_active", true),
        supabase
          .from("working_hours")
          .select("weekday, start_time, end_time")
          .eq("business_id", id),
      ]);
      return {
        services: services.data ?? [],
        staff: staff.data?.length ?? 0,
        hours: hours.data ?? [],
      };
    },
  });
  if (!business) return {};

  const out: Partial<Record<SectionId, RowStatus>> = {};
  const place = [business.address, business.city].filter(Boolean).join(", ");
  out.info = place ? { text: place } : { text: t("mg.missingAddress"), warn: true };
  out.page = {
    text: business.is_published ? t("mg.published") : t("mg.notPublished"),
    warn: !business.is_published,
    dot: effectiveBrand(business.brand_color),
  };
  out.reminders = business.reminders_enabled
    ? { text: t("mg.remindersOn").replace("{h}", String(business.reminder_hours ?? 24)) }
    : { text: t("mg.remindersOff") };
  if (!data) return out;

  const active = data.services.filter((s) => s.is_active);
  out.services = active.length
    ? {
        text: t(active.length === 1 ? "mg.services.one" : "mg.services.many").replace(
          "{n}",
          String(active.length),
        ),
      }
    : { text: t("mg.services.none"), warn: true };
  out.team =
    data.staff <= 1
      ? { text: t("mg.team.solo") }
      : { text: t("mg.team.many").replace("{n}", String(data.staff)) };
  if (data.hours.length) {
    const days = [...new Set(data.hours.map((h) => h.weekday))];
    const start = data.hours.map((h) => h.start_time.slice(0, 5)).sort()[0];
    const end = data.hours
      .map((h) => h.end_time.slice(0, 5))
      .sort()
      .at(-1);
    out.hours = { text: `${daysLabel(days, weekdaysShort(), t("mg.everyDay"))} · ${start}–${end}` };
  } else out.hours = { text: t("mg.noHours"), warn: true };
  const manual = active.some((s) => s.requires_confirmation);
  out.rules = {
    text: [
      manual ? t("mg.rules.manual") : t("mg.rules.auto"),
      t("mg.rules.cancel").replace("{h}", String(business.cancellation_hours)),
      ...(business.verify_bookings ? [t("mg.rules.code")] : []),
    ].join(" · "),
  };
  return out;
}
