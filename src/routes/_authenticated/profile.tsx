import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { effectiveBrand } from "@/lib/brand";
import { usePrefs } from "@/lib/prefs";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { useSubscription } from "@/hooks/use-subscription";
import { TRIAL_DAYS } from "@/lib/subscription";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui-bits";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { initials, weekdaysShort, currentLocale } from "@/lib/format";
import { useMyBusiness } from "@/hooks/use-business";
import { useLogoUrl } from "@/hooks/use-logo";
import { BusinessPagePanel } from "@/components/panels/business-page-panel";
import { QrDialog, QrThumb } from "@/components/qr-dialog";
import { ServicesPanel } from "@/components/panels/services-panel";
import { TeamPanel } from "@/components/panels/team-panel";
import { AvailabilityPanel } from "@/components/panels/availability-panel";
import { ShareSheet } from "@/components/share-sheet";
import { RulesPanel } from "@/components/panels/rules-panel";
import {
  ArrowLeft,
  ArrowUpRight,
  Crown,
  Pencil,
  ChevronRight,
  Clock,
  Scissors,
  Settings,
  Share2,
  SlidersHorizontal,
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

/** What each old link opens now that sections were merged. */
const MERGED: Partial<Record<SectionId, Shown>> = {
  page: "info",
  share: "info",
  analytics: "info",
  settings: "info",
  team: "services",
  timeoff: "hours",
  reminders: "rules",
};
type Shown = "info" | "services" | "hours" | "rules";
type Row = { id: Exclude<Shown, "info">; icon: ComponentType<{ className?: string }> };

/**
 * The menu. The business itself (details, page look, link) is one card on top;
 * below, three settings and the plan. On phones it all fits the screen: the
 * tiles stretch to fill what is left, with no scroll.
 */
const ROWS: Row[] = [
  { id: "services", icon: Scissors },
  { id: "hours", icon: Clock },
  { id: "rules", icon: SlidersHorizontal },
];

function ProfilePage() {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const { section } = Route.useSearch();
  // The open section lives in the URL: the phone's back button closes it.
  const setSection = (id: SectionId | null) =>
    void navigate({ to: "/profile", search: id ? { section: id } : {} });
  const label = (id: Shown) => t(id === "info" ? "pf.s.info" : `pf.t.${id}`);
  const desc = (id: Shown) => t(id === "info" ? "pf.s.info.desc" : `pf.t.${id}.desc`);
  // Phones drill into one section at a time; from md up the menu stays on the
  // left and the first section fills the right column by default.
  const shown: Shown = !section ? "info" : (MERGED[section] ?? (section as Shown));
  const [qrOpen, setQrOpen] = useState(false);
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
    // The card above can change height (logo, status line): measure again.
    const card = el.previousElementSibling;
    const ro = card ? new ResizeObserver(fit) : null;
    if (card) ro?.observe(card);
    return () => {
      window.removeEventListener("resize", fit);
      ro?.disconnect();
    };
  }, [isPhone, section, business]);
  // The tiles grow with the screen, and so does what is in them: short tiles keep the icon
  // beside the name and one line; taller ones put it on top and give each detail its own line;
  // the tallest get a bigger icon and title.
  const tileH = gridH === null ? 0 : (gridH - 8) / 2;
  const size: "s" | "m" | "l" = tileH >= 160 ? "l" : tileH >= 110 ? "m" : "s";
  const roomy = size !== "s";

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
    const name = label(row.id);
    if (phone)
      return (
        <button
          key={row.id}
          type="button"
          onClick={() => setSection(row.id)}
          className={cn(
            "surface flex min-h-0 min-w-0 flex-col p-3.5 text-left transition-[background-color,transform] duration-150 active:scale-[0.97] active:bg-muted",
            size === "l" ? "justify-between" : "justify-center",
          )}
        >
          {/* Icon and name share the top line; the details fill the rest. Taller tiles add a
              short description, so the space carries information instead of staying empty. */}
          <span className="block w-full min-w-0">
            <span className="flex min-w-0 items-center gap-2.5">
              <span
                className={cn(
                  "flex shrink-0 items-center justify-center rounded-xl bg-muted text-foreground",
                  roomy ? "size-9" : "size-7",
                )}
              >
                <row.icon className={roomy ? "size-[18px]" : "size-4"} />
              </span>
              <span
                className={cn(
                  "min-w-0 font-display font-bold leading-tight text-balance",
                  roomy ? "text-[15px]" : "truncate text-sm",
                )}
              >
                {name}
              </span>
            </span>
            {roomy ? (
              <span className="mt-2.5 block w-full min-w-0">
                {(status?.lines ?? [status?.text ?? desc(row.id)]).map((line, i) => (
                  <span
                    key={line}
                    className={cn(
                      "line-clamp-2 block leading-[1.35rem]",
                      size === "l" ? "text-[13px]" : "text-xs",
                      i === 0 ? "font-bold text-foreground" : "font-semibold text-muted-foreground",
                      status?.warn && i === 0 && "text-st-pending-fg",
                    )}
                  >
                    {line}
                  </span>
                ))}
              </span>
            ) : (
              text
            )}
          </span>
          {size === "l" && (
            <span className="line-clamp-2 block text-xs leading-snug text-muted-foreground">
              {desc(row.id)}
            </span>
          )}
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

  // The plan, in words that match its state; in the free month, the days left and a bar.
  const pro = access
    ? access.state === "active"
      ? {
          title: t("pf.pro.active"),
          sub: access.periodEnd
            ? t("pf.pro.renews").replace(
                "{date}",
                new Intl.DateTimeFormat(currentLocale(), { day: "numeric", month: "long" }).format(
                  access.periodEnd,
                ),
              )
            : t("pf.pro.all"),
          warn: false,
          days: null,
        }
      : access.state === "past_due"
        ? { title: t("pf.pro.pastDue"), sub: t("pf.pro.pastDue.sub"), warn: true, days: null }
        : access.state === "trial"
          ? {
              title: t("pf.pro.trial"),
              sub: t("pf.pro.trial.cta"),
              warn: false,
              days: access.trialDaysLeft,
            }
          : { title: t("pf.pro.ended"), sub: t("pf.pro.ended.sub"), warn: true, days: null }
    : null;
  const used = pro?.days != null ? Math.min(1, Math.max(0.04, 1 - pro.days / TRIAL_DAYS)) : null;
  const daysLine = pro?.days != null && (
    <span className="flex items-baseline gap-1.5">
      <span className="font-display text-3xl font-bold leading-none tabular-nums">{pro.days}</span>
      <span className="whitespace-nowrap text-xs font-bold text-muted-foreground">
        {t(pro.days === 1 ? "pf.pro.dayLeft" : "pf.pro.daysLeft")}
      </span>
    </span>
  );
  const bar = used != null && (
    <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-black/8 dark:bg-white/10">
      <span className="gold-bar block h-full rounded-full" style={{ width: `${used * 100}%` }} />
    </span>
  );
  const proName = (
    <span className="text-gold-live whitespace-nowrap font-display text-[15px] font-bold leading-tight">
      SYCRAS Pro
    </span>
  );
  const crown = (chip: string) => (
    <span
      className={cn(
        "gold-metal flex shrink-0 items-center justify-center rounded-xl shadow-sm",
        chip,
      )}
    >
      <Crown className="size-[18px]" />
    </span>
  );

  // Phones: a tile of the grid, built like the others: crown and name on top, the state below.
  const proTile = pro && (
    <button
      type="button"
      onClick={() => void navigate({ to: "/plans" })}
      className={cn(
        "surface pro-shine flex min-h-0 min-w-0 flex-col p-3.5 text-left transition-transform duration-150 active:scale-[0.97]",
        roomy ? "justify-between" : "justify-center",
        pro.warn && "border-destructive",
      )}
    >
      <span className="flex items-center gap-2">
        {crown(roomy ? "size-9" : "size-7")}
        {proName}
      </span>
      {roomy && (
        <span className="mt-2 block w-full min-w-0">
          {daysLine || (
            <span className="block font-display text-[15px] font-bold leading-tight">
              {pro.title}
            </span>
          )}
          {bar}
          {/* The sentence only where it fits without crowding the tile. */}
          {(size === "l" || pro.days == null) && (
            <span className="mt-1.5 line-clamp-2 text-xs font-semibold leading-snug text-muted-foreground">
              {pro.sub}
            </span>
          )}
        </span>
      )}
      {!roomy && pro.days != null && (
        <span className="mt-1 text-xs font-bold text-muted-foreground">
          {pro.days} {t(pro.days === 1 ? "pf.pro.dayLeft" : "pf.pro.daysLeft")}
        </span>
      )}
    </button>
  );
  // Wide screens: one row under the menu, with the same details.
  const proCard = pro && (
    <button
      type="button"
      onClick={() => void navigate({ to: "/plans" })}
      className={cn(
        "surface pro-shine flex w-full items-center gap-3 p-4 text-left transition-transform duration-150 active:scale-[0.98]",
        pro.warn && "border-destructive",
      )}
    >
      {crown("size-10")}
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          {proName}
          {pro.days != null && (
            <span className="whitespace-nowrap text-xs font-bold tabular-nums">
              {pro.days} {t(pro.days === 1 ? "pf.pro.dayLeft" : "pf.pro.daysLeft")}
            </span>
          )}
        </span>
        {bar || <span className="mt-0.5 block truncate text-sm font-bold">{pro.title}</span>}
        <span className="mt-1 line-clamp-2 text-xs font-semibold text-muted-foreground">
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
        title={section && isPhone ? label(shown) : t("pf.manage.title")}
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
                {/* The page's QR code: tap for the big one, to download or show. */}
                <QrThumb
                  url={`https://sycras.com/${business.slug}`}
                  onOpen={() => setQrOpen(true)}
                />
              </div>
              {/* Three actions, each named: edit the business and its page, share, open. */}
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {([["info", Pencil, t("pf.biz.edit")]] as const).map(([id, Icon, text]) => (
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

          {/* Phones: three settings and the plan, two by two, stretched to fill the screen. */}
          <div
            ref={gridRef}
            className="grid grid-cols-2 grid-rows-2 gap-2 md:hidden"
            style={gridH ? { height: gridH } : undefined}
          >
            {ROWS.map((row) => tile(row, true))}
            {proTile}
          </div>

          <nav className="surface hidden divide-y divide-border overflow-hidden p-0 md:block">
            {ROWS.map((row) => tile(row, false))}
          </nav>
          <div className="hidden md:block">{proCard}</div>
        </div>

        <div key={shown} className={cn("animate-enter min-w-0", !section && "hidden md:block")}>
          {/* The open setting's own title on wide screens; phones show it in the header. */}
          <div className="mb-4 hidden md:block">
            <h2 className="font-display text-xl font-bold leading-tight">{label(shown)}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{desc(shown)}</p>
          </div>
          <p className="mb-4 text-sm text-muted-foreground md:hidden">{desc(shown)}</p>
          {shown === "info" && <BusinessPagePanel />}
          {shown === "services" && (
            <div className="space-y-8">
              <ServicesPanel />
              <TeamPanel />
            </div>
          )}
          {shown === "hours" && <AvailabilityPanel view="hours" />}
          {shown === "rules" && <RulesPanel />}
        </div>
      </div>
      <ShareSheet open={shareOpen} onOpenChange={setShareOpen} />
      {business && (
        <QrDialog
          url={`https://sycras.com/${business.slug}`}
          slug={business.slug}
          name={business.name}
          open={qrOpen}
          onOpenChange={setQrOpen}
        />
      )}
    </AppShell>
  );
}

/** One line for small spaces ("text"); "lines" when there is room to show each part on its own. */
type RowStatus = { text: string; lines?: string[]; warn?: boolean; dot?: string };

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
      const [services, staff, hours, off] = await Promise.all([
        supabase.from("services").select("is_active, requires_confirmation").eq("business_id", id),
        supabase.from("staff").select("id").eq("business_id", id).eq("is_active", true),
        supabase
          .from("working_hours")
          .select("weekday, start_time, end_time")
          .eq("business_id", id),
        supabase
          .from("blocked_times")
          .select("starts_at, ends_at")
          .eq("business_id", id)
          .gte("ends_at", new Date().toISOString())
          .order("starts_at")
          .limit(20),
      ]);
      // The next day off (calendar blocks of a few hours do not count).
      const nextOff = (off.data ?? []).find(
        (b) => new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime() >= 12 * 3_600_000,
      );
      return {
        services: services.data ?? [],
        staff: staff.data?.length ?? 0,
        hours: hours.data ?? [],
        nextOff: nextOff?.starts_at ?? null,
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
  // Services and team together: one line, or one line each when there is room.
  const teamLine =
    data.staff <= 1 ? t("mg.team.solo") : t("mg.team.many").replace("{n}", String(data.staff));
  out.services = {
    ...out.services,
    text: active.length ? `${out.services.text} · ${teamLine}` : out.services.text,
    lines: [out.services.text, teamLine],
  };
  if (data.hours.length) {
    const days = [...new Set(data.hours.map((h) => h.weekday))];
    const start = data.hours.map((h) => h.start_time.slice(0, 5)).sort()[0];
    const end = data.hours
      .map((h) => h.end_time.slice(0, 5))
      .sort()
      .at(-1);
    out.hours = { text: `${daysLabel(days, weekdaysShort(), t("mg.everyDay"))} · ${start}–${end}` };
  } else out.hours = { text: t("mg.noHours"), warn: true };
  out.hours.lines = [
    out.hours.text,
    data.nextOff
      ? t("mg.nextOff").replace(
          "{date}",
          new Intl.DateTimeFormat(currentLocale(), {
            weekday: "short",
            day: "numeric",
            month: "short",
            timeZone: business.timezone,
          }).format(new Date(data.nextOff)),
        )
      : t("pf.av.off.empty"),
  ];
  const manual = active.some((s) => s.requires_confirmation);
  const ruleLines = [
    manual ? t("mg.rules.manual") : t("mg.rules.auto"),
    business.reminders_enabled
      ? t("mg.remindersOn").replace("{h}", String(business.reminder_hours ?? 24))
      : t("rl.noReminders"),
  ];
  out.rules = { text: ruleLines.join(" · "), lines: ruleLines };
  return out;
}
