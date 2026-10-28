import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleCheck,
  CircleX,
  Copy,
  Crown,
  ExternalLink,
  ImagePlus,
  Loader2,
  Plus,
  Trash2,
  User,
  Users,
} from "lucide-react";
import { usePrefs } from "@/lib/prefs";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormError } from "@/components/ui-bits";
import { SycrasLogo } from "@/components/sycras-logo";
import { BUSINESS_TYPES, businessType } from "@/lib/business-types";
import { slugify, weekdaysShort } from "@/lib/format";
import { DEFAULT_BRAND } from "@/lib/brand";
import { ColorSwatches } from "@/components/color-swatches";
import { Switch } from "@/components/ui/switch";
import { PagePreview } from "@/components/page-preview";
import { ImageCropDialog, type CropShape } from "@/components/image-crop-dialog";
import { LocationPicker, type LatLng } from "@/components/location-picker";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { isReservedSlug } from "@/lib/reserved-slugs";
import { checkSlugAvailable } from "@/lib/booking.functions";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Configurar o teu negócio — SYCRAS" },
      { name: "description", content: "Configura o teu negócio e cria a tua página de marcações." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Onboarding,
});

type DraftService = { name: string; duration: number; price: number };
type SlugState = "idle" | "checking" | "free" | "taken" | "invalid";

const STEPS = ["business", "contacts", "services", "team", "hours", "prefs"] as const;
type StepKey = (typeof STEPS)[number];

const DURATIONS = [15, 20, 30, 45, 60, 75, 90, 120];
const CANCEL_HOURS = [2, 12, 24, 48];
/** Opening-day presets, weekday numbers with 0 = Sunday. */
const DAY_PRESETS: { key: string; days: number[] }[] = [
  { key: "ob.hours.weekdays", days: [1, 2, 3, 4, 5] },
  { key: "ob.hours.monSat", days: [1, 2, 3, 4, 5, 6] },
  { key: "ob.hours.everyday", days: [0, 1, 2, 3, 4, 5, 6] },
];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

function Onboarding() {
  const { t, lang } = usePrefs();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stepIdx, setStepIdx] = useState(0);
  const step: StepKey = STEPS[stepIdx]!;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1. Business
  const [name, setName] = useState("");
  const [type, setType] = useState("barbershop");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugState, setSlugState] = useState<SlugState>("idle");
  // 2. Contacts (all optional)
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [instagram, setInstagram] = useState("");
  const [description, setDescription] = useState("");
  // 3. Services
  const [services, setServices] = useState<DraftService[]>([]);
  // 4. Team
  const [solo, setSolo] = useState(true);
  const [team, setTeam] = useState<string[]>([""]);
  // 5. Hours
  const [openDays, setOpenDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("19:00");
  const [lunch, setLunch] = useState(true);
  const [lunchStart, setLunchStart] = useState("13:00");
  const [lunchEnd, setLunchEnd] = useState("14:00");
  // 6. Preferences
  const [brand, setBrand] = useState<string>(DEFAULT_BRAND);
  const [autoConfirm, setAutoConfirm] = useState(true);
  const [cancelHours, setCancelHours] = useState(24);
  const [autoComplete, setAutoComplete] = useState(true);
  // Logo and banner: framed in the crop dialog, uploaded once the business exists.
  const [images, setImages] = useState<Record<CropShape, File | null>>({ logo: null, cover: null });
  const [previews, setPreviews] = useState<Record<CropShape, string | null>>({
    logo: null,
    cover: null,
  });
  const [cropping, setCropping] = useState<{ kind: CropShape; file: File } | null>(null);
  // Exact shop location, picked on the map in the contacts step.
  const [location, setLocation] = useState<LatLng | null>(null);

  const [createdSlug, setCreatedSlug] = useState<string | null>(null);
  const ownerName = (user?.user_metadata?.["full_name"] as string | undefined)?.trim() ?? "";

  // Local previews of the chosen pictures; released when they change.
  useEffect(() => {
    const urls = {
      logo: images.logo ? URL.createObjectURL(images.logo) : null,
      cover: images.cover ? URL.createObjectURL(images.cover) : null,
    };
    setPreviews(urls);
    return () => {
      if (urls.logo) URL.revokeObjectURL(urls.logo);
      if (urls.cover) URL.revokeObjectURL(urls.cover);
    };
  }, [images]);

  // Already has a business: nothing to set up.
  useEffect(() => {
    void supabase
      .from("business_members")
      .select("business_id")
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) navigate({ to: "/today" });
      });
  }, [navigate]);

  // The link follows the name until the owner edits it.
  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  // Sample services that fit the business type.
  useEffect(() => {
    setServices(
      businessType(type).sampleServices.map((s) => ({
        name: t(s.name),
        duration: s.duration,
        price: s.price / 100,
      })),
    );
  }, [type, t]);

  // Live check that the link is free.
  useEffect(() => {
    const clean = slug.trim().toLowerCase();
    if (!clean) {
      setSlugState("idle");
      return;
    }
    if (!/^[a-z0-9-]{3,48}$/.test(clean) || isReservedSlug(clean)) {
      setSlugState("invalid");
      return;
    }
    setSlugState("checking");
    const id = setTimeout(async () => {
      try {
        const res = await checkSlugAvailable({ data: { slug: clean } });
        setSlugState(res.invalid ? "invalid" : res.available ? "free" : "taken");
      } catch {
        setSlugState("idle");
      }
    }, 450);
    return () => clearTimeout(id);
  }, [slug]);

  const validServices = services.filter((s) => s.name.trim().length > 0);
  const teamNames = solo ? [ownerName || name.trim()] : team.map((n) => n.trim()).filter(Boolean);
  const hoursOk =
    openDays.length > 0 &&
    start < end &&
    (!lunch || (start < lunchStart && lunchStart < lunchEnd && lunchEnd < end));

  /** What still blocks the current step (null when it can continue). */
  function blocker(): string | null {
    if (step === "business") {
      if (name.trim().length < 2) return t("ob.err.name");
      if (slugState === "taken") return t("onb.s1.slug.taken");
      if (slugState === "invalid") return t("onb.s1.slug.invalid");
      if (slugState === "checking") return t("onb.s1.slug.checking");
    }
    if (step === "services" && validServices.length === 0) return t("onb.err.addService");
    if (step === "team" && teamNames.length === 0) return t("onb.err.addStaff");
    if (step === "hours" && !hoursOk) return t("ob.err.hours");
    return null;
  }

  function next() {
    const problem = blocker();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    if (stepIdx < STEPS.length - 1) {
      setStepIdx((i) => i + 1);
      window.scrollTo({ top: 0 });
    } else void finish();
  }

  function back() {
    setError(null);
    setStepIdx((i) => Math.max(0, i - 1));
  }

  function pickImage(kind: CropShape, f: File) {
    if (!f.type.startsWith("image/")) return setError(t("pf.biz.err.imageType"));
    if (f.size > 15 * 1024 * 1024) return setError(t("pf.biz.err.imageSize"));
    setError(null);
    setCropping({ kind, file: f });
  }

  /** The old way (6 requests), only while the database lacks create_business_setup. */
  async function createStepByStep(): Promise<{ id: string; slug: string } | null> {
    if (!user) return null;
    const ranges = lunch
      ? [
          { start_time: start, end_time: lunchStart },
          { start_time: lunchEnd, end_time: end },
        ]
      : [{ start_time: start, end_time: end }];
    const { data: business, error: bizError } = await supabase
      .from("businesses")
      .insert({
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        business_type: type,
        description: description.trim() || null,
        city: city.trim() || null,
        address: address.trim() || null,
        phone: phone.trim() || null,
        instagram: instagram.trim().replace(/^@/, "") || null,
        brand_color: brand,
        cancellation_hours: cancelHours,
        created_by: user.id,
        onboarding_completed: true,
      })
      .select("id, slug")
      .single();
    if (bizError) {
      if (bizError.code === "23505") {
        setStepIdx(0);
        setError(t("onb.err.slugTaken"));
        return null;
      }
      throw bizError;
    }

    const { error: memberError } = await supabase
      .from("business_members")
      .insert({ business_id: business.id, user_id: user.id, role: "owner" });
    if (memberError) throw memberError;

    const [{ data: svcRows, error: svcError }, { data: staffRows, error: staffError }] =
      await Promise.all([
        supabase
          .from("services")
          .insert(
            validServices.map((s, i) => ({
              business_id: business.id,
              name: s.name.trim(),
              duration_minutes: s.duration,
              price_cents: Math.max(0, Math.round(s.price * 100)),
              requires_confirmation: !autoConfirm,
              sort_order: i,
            })),
          )
          .select("id"),
        supabase
          .from("staff")
          .insert(
            teamNames.map((n, i) => ({
              business_id: business.id,
              name: n,
              user_id: i === 0 ? user.id : null,
              sort_order: i,
            })),
          )
          .select("id"),
      ]);
    if (svcError) throw svcError;
    if (staffError) throw staffError;

    // Everyone does every service; the week is shared by the whole team.
    const links = (staffRows ?? []).flatMap((st) =>
      (svcRows ?? []).map((sv) => ({
        staff_id: st.id,
        service_id: sv.id,
        business_id: business.id,
      })),
    );
    const hourRows = openDays.flatMap((weekday) =>
      ranges.map((r) => ({ business_id: business.id, staff_id: null, weekday, ...r })),
    );
    const [{ error: linksError }, { error: hoursError }] = await Promise.all([
      links.length
        ? supabase.from("staff_services").insert(links)
        : Promise.resolve({ error: null }),
      supabase.from("working_hours").insert(hourRows),
    ]);
    if (linksError) throw linksError;
    if (hoursError) throw hoursError;
    if (autoComplete) {
      await supabase.from("businesses").update({ auto_complete: true }).eq("id", business.id);
    }
    if (location) {
      await supabase
        .from("businesses")
        .update({ latitude: location.lat, longitude: location.lng })
        .eq("id", business.id);
    }
    await supabase.from("subscriptions").insert({ business_id: business.id, plan: "free" });
    return business;
  }

  async function finish() {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      const ranges = lunch
        ? [
            { start_time: start, end_time: lunchStart },
            { start_time: lunchEnd, end_time: end },
          ]
        : [{ start_time: start, end_time: end }];
      // Everything in one go on the server: all or nothing, so a failure never leaves a
      // half-made business behind (and the same link can be tried again).
      const { data: created, error: setupError } = await supabase.rpc(
        "create_business_setup" as never,
        {
          p: {
            name: name.trim(),
            slug: slug.trim().toLowerCase(),
            business_type: type,
            description: description.trim(),
            city: city.trim(),
            address: address.trim(),
            phone: phone.trim(),
            instagram: instagram.trim().replace(/^@/, ""),
            brand_color: brand,
            cancellation_hours: cancelHours,
            auto_complete: autoComplete,
            latitude: location?.lat ?? null,
            longitude: location?.lng ?? null,
            requires_confirmation: !autoConfirm,
            services: validServices.map((s) => ({
              name: s.name.trim(),
              duration_minutes: s.duration,
              price_cents: Math.max(0, Math.round(s.price * 100)),
            })),
            team: teamNames,
            hours: openDays.flatMap((weekday) => ranges.map((r) => ({ weekday, ...r }))),
          },
        } as never,
      );
      let business: { id: string; slug: string };
      if (setupError?.code === "23505") {
        setStepIdx(0);
        setError(t("onb.err.slugTaken"));
        return;
      }
      if (setupError && setupError.code !== "PGRST202") throw setupError;
      if (!setupError) {
        business = created as unknown as { id: string; slug: string };
      } else {
        // Database without the function yet: the old step-by-step way.
        const made = await createStepByStep();
        if (!made) return;
        business = made;
      }

      // Extras that must never block the account: saved one by one.
      let imageFailed = false;
      for (const kind of ["logo", "cover"] as const) {
        const file = images[kind];
        if (!file) continue;
        const path = `${business.id}/${kind}-${Date.now()}.webp`;
        const { error: upErr } = await supabase.storage
          .from("business-logos")
          .upload(path, file, { upsert: true, contentType: file.type });
        const { error: saveErr } = upErr
          ? { error: upErr }
          : await supabase
              .from("businesses")
              .update(kind === "logo" ? { logo_url: path } : { cover_url: path })
              .eq("id", business.id);
        if (saveErr) {
          console.error("[onboarding] image failed", kind, saveErr);
          imageFailed = true;
        }
      }
      if (imageFailed) toast.error(t("ob.err.image"));
      window.localStorage.setItem("active_business", business.id);
      setCreatedSlug(business.slug);
    } catch (err) {
      console.error("[onboarding] create failed", err);
      setError(t("onb.err.createFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (createdSlug)
    return (
      <Done
        slug={createdSlug}
        onGo={() => navigate({ to: "/today" })}
        onSubscribe={() => navigate({ to: "/plans" })}
      />
    );

  const titles: Record<StepKey, [string, string]> = {
    business: [t("ob.s.business"), t("ob.s.business.sub")],
    contacts: [t("ob.s.contacts"), t("ob.s.contacts.sub")],
    services: [t("ob.s.services"), t("ob.s.services.sub")],
    team: [t("ob.s.team"), t("ob.s.team.sub")],
    hours: [t("ob.s.hours"), t("ob.s.hours.sub")],
    prefs: [t("ob.s.prefs"), t("ob.s.prefs.sub")],
  };
  const [title, subtitle] = titles[step];
  const isLast = stepIdx === STEPS.length - 1;

  return (
    <div className="min-h-dvh bg-background pb-32">
      {/* Top: brand, where you are, how far to go. */}
      <header className="sticky top-[var(--sat)] z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-5 py-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-brand">
            <SycrasLogo className="size-5" onColor />
          </span>
          <p className="text-sm font-bold">{t("ob.header")}</p>
          <p className="ml-auto text-xs font-semibold tabular-nums text-muted-foreground">
            {t("ob.stepOf")
              .replace("{n}", String(stepIdx + 1))
              .replace("{total}", String(STEPS.length))}
          </p>
        </div>
        <div className="mx-auto flex max-w-xl gap-1.5 px-5 pb-3">
          {STEPS.map((k, i) => (
            <span
              key={k}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors duration-300",
                i <= stepIdx ? "bg-brand" : "bg-border",
              )}
            />
          ))}
        </div>
      </header>

      <main key={step} className="animate-enter mx-auto max-w-xl px-5 pt-8">
        <h1 className="font-display text-[28px] font-bold leading-tight tracking-tight">{title}</h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">{subtitle}</p>

        <div className="mt-7 space-y-5">
          {step === "business" && (
            <>
              <Field label={t("ob.f.name")} htmlFor="bname">
                <Input
                  id="bname"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("onb.s1.name.placeholder")}
                  maxLength={80}
                  autoFocus
                />
              </Field>
              <Field label={t("ob.f.type")}>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {BUSINESS_TYPES.map((bt) => (
                    <button
                      key={bt.value}
                      type="button"
                      onClick={() => setType(bt.value)}
                      aria-pressed={type === bt.value}
                      className={cn(
                        "flex min-h-12 items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition-colors",
                        type === bt.value
                          ? "border-brand bg-brand/8 text-foreground ring-1 ring-brand"
                          : "border-border bg-card hover:bg-muted",
                      )}
                    >
                      <bt.icon
                        className={cn(
                          "size-4 shrink-0",
                          type === bt.value ? "text-brand-ink" : "text-muted-foreground",
                        )}
                      />
                      <span className="min-w-0 truncate">{t(bt.label)}</span>
                    </button>
                  ))}
                </div>
              </Field>
              <Field label={t("ob.f.link")} htmlFor="slug" hint={t("ob.f.link.hint")}>
                <div className="flex h-11 items-center rounded-xl border border-border bg-card pl-3.5 focus-within:border-brand focus-within:ring-2 focus-within:ring-ring/25">
                  <span className="text-sm text-muted-foreground">sycras.com/</span>
                  <input
                    id="slug"
                    value={slug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      setSlug(slugify(e.target.value));
                    }}
                    className="h-full min-w-0 flex-1 bg-transparent text-base outline-none md:text-sm"
                    placeholder={t("onb.s1.slug.placeholder")}
                  />
                  <span className="flex w-10 justify-center">
                    {slugState === "checking" && (
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    )}
                    {slugState === "free" && (
                      <CircleCheck className="size-4 text-st-confirmed-fg" />
                    )}
                    {(slugState === "taken" || slugState === "invalid") && (
                      <CircleX className="size-4 text-st-noshow-fg" />
                    )}
                  </span>
                </div>
              </Field>
            </>
          )}

          {step === "contacts" && (
            <>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label={t("onb.s1.city")} htmlFor="city">
                  <Input
                    id="city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    maxLength={60}
                  />
                </Field>
                <Field label={t("ob.f.phone")} htmlFor="phone">
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder={t("onb.s1.phone.placeholder")}
                    maxLength={24}
                  />
                </Field>
              </div>
              <Field label={t("ob.f.address")} htmlFor="addr">
                <Input
                  id="addr"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  maxLength={140}
                />
              </Field>
              <Field label={t("loc.title")}>
                <LocationPicker
                  value={location}
                  onChange={setLocation}
                  onAddress={(street, town) => {
                    if (!address.trim() && street) setAddress(street);
                    if (!city.trim() && town) setCity(town);
                  }}
                  initialQuery={[address, city].filter(Boolean).join(", ")}
                />
              </Field>
              <Field label="Instagram" htmlFor="ig">
                <Input
                  id="ig"
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value)}
                  placeholder={t("onb.s1.instagram.placeholder")}
                  maxLength={60}
                />
              </Field>
              <Field label={t("ob.f.desc")} htmlFor="desc">
                <Textarea
                  id="desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t("onb.s1.desc.placeholder")}
                  maxLength={280}
                />
              </Field>
            </>
          )}

          {step === "services" && (
            <>
              <ul className="space-y-3">
                {services.map((s, i) => (
                  <li key={i} className="surface space-y-3 p-4">
                    <div className="flex items-center gap-2">
                      <Input
                        aria-label={t("onb.s2.serviceName")}
                        value={s.name}
                        onChange={(e) =>
                          setServices((p) =>
                            p.map((x, j) => (i === j ? { ...x, name: e.target.value } : x)),
                          )
                        }
                        placeholder={t("onb.s2.serviceName")}
                        maxLength={60}
                        className="font-semibold"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("onb.s2.remove")}
                        onClick={() => setServices((p) => p.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="space-y-1.5">
                        <span className="text-xs font-semibold text-muted-foreground">
                          {t("onb.s2.duration")}
                        </span>
                        <select
                          value={s.duration}
                          onChange={(e) =>
                            setServices((p) =>
                              p.map((x, j) =>
                                i === j ? { ...x, duration: Number(e.target.value) } : x,
                              ),
                            )
                          }
                          className="h-11 w-full rounded-xl border border-border bg-card px-3.5 text-base md:text-sm"
                        >
                          {[...new Set([...DURATIONS, s.duration])]
                            .sort((a, b) => a - b)
                            .map((d) => (
                              <option key={d} value={d}>
                                {d} min
                              </option>
                            ))}
                        </select>
                      </label>
                      <label className="space-y-1.5">
                        <span className="text-xs font-semibold text-muted-foreground">
                          {t("onb.s2.price")}
                        </span>
                        <div className="relative">
                          <Input
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step={0.5}
                            value={s.price}
                            onChange={(e) =>
                              setServices((p) =>
                                p.map((x, j) =>
                                  i === j ? { ...x, price: Number(e.target.value) } : x,
                                ),
                              )
                            }
                            className="pr-9"
                          />
                          <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm text-muted-foreground">
                            €
                          </span>
                        </div>
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setServices((p) => [...p, { name: "", duration: 30, price: 15 }])}
              >
                <Plus /> {t("onb.s2.add")}
              </Button>
            </>
          )}

          {step === "team" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {[
                  [true, User, t("ob.team.solo"), t("ob.team.solo.sub")],
                  [false, Users, t("ob.team.many"), t("ob.team.many.sub")],
                ].map(([value, Icon, label, sub]) => {
                  const active = solo === value;
                  const I = Icon as typeof User;
                  return (
                    <button
                      key={String(value)}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSolo(value as boolean)}
                      className={cn(
                        "flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-colors",
                        active
                          ? "border-brand bg-brand/8 ring-1 ring-brand"
                          : "border-border bg-card hover:bg-muted",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-10 items-center justify-center rounded-xl",
                          active ? "bg-brand text-brand-foreground" : "bg-muted",
                        )}
                      >
                        <I className="size-5" />
                      </span>
                      <span className="text-sm font-bold">{label as string}</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {sub as string}
                      </span>
                    </button>
                  );
                })}
              </div>
              {solo ? (
                <p className="rounded-xl bg-muted/70 p-4 text-sm text-muted-foreground">
                  {t("ob.team.soloNote").replace("{name}", ownerName || t("ob.team.you"))}
                </p>
              ) : (
                <div className="space-y-2">
                  {team.map((n, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        aria-label={t("ob.team.memberName")}
                        value={n}
                        onChange={(e) =>
                          setTeam((p) => p.map((x, j) => (i === j ? e.target.value : x)))
                        }
                        placeholder={
                          i === 0 ? ownerName || t("ob.team.memberName") : t("ob.team.memberName")
                        }
                        maxLength={60}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("onb.s3.remove")}
                        disabled={team.length === 1}
                        onClick={() => setTeam((p) => p.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setTeam((p) => [...p, ""])}
                  >
                    <Plus /> {t("onb.s3.add")}
                  </Button>
                </div>
              )}
            </>
          )}

          {step === "hours" && (
            <>
              <Field label={t("ob.hours.days")}>
                <div className="flex flex-wrap gap-2">
                  {DAY_PRESETS.map((p) => {
                    const active =
                      p.days.length === openDays.length &&
                      p.days.every((d) => openDays.includes(d));
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => setOpenDays(p.days)}
                        className={cn(
                          "h-10 rounded-full border px-4 text-[13px] font-bold transition-colors",
                          active
                            ? "border-brand bg-brand text-brand-foreground"
                            : "border-border bg-card hover:bg-muted",
                        )}
                      >
                        {t(p.key)}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 grid grid-cols-7 gap-1.5">
                  {WEEK_ORDER.map((d) => {
                    const on = openDays.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setOpenDays((p) => (on ? p.filter((x) => x !== d) : [...p, d]))
                        }
                        className={cn(
                          "flex h-11 items-center justify-center rounded-xl border text-xs font-bold uppercase transition-colors",
                          on
                            ? "border-brand bg-brand/10 text-brand-ink"
                            : "border-border bg-card text-muted-foreground line-through",
                        )}
                      >
                        {weekdaysShort(lang)[d]}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <Field label={t("ob.hours.open")}>
                <TimeRange start={start} end={end} onStart={setStart} onEnd={setEnd} />
              </Field>
              <div className="surface p-4">
                <label className="flex items-center justify-between gap-3">
                  <span>
                    <span className="block text-sm font-bold">{t("onb.s4.lunch")}</span>
                    <span className="block text-xs font-normal text-muted-foreground">
                      {t("ob.hours.lunchSub")}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={lunch}
                    onChange={(e) => setLunch(e.target.checked)}
                    className="size-5 accent-[var(--brand)]"
                  />
                </label>
                {lunch && (
                  <div className="mt-3">
                    <TimeRange
                      start={lunchStart}
                      end={lunchEnd}
                      onStart={setLunchStart}
                      onEnd={setLunchEnd}
                    />
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{t("ob.hours.later")}</p>
            </>
          )}

          {step === "prefs" && (
            <>
              <PagePreview
                name={name.trim()}
                brand={brand}
                logoUrl={previews.logo}
                coverUrl={previews.cover}
              />
              <PickImage
                label={t("pf.look.logo")}
                hint={t("ob.prefs.logoHint")}
                has={!!images.logo}
                onPick={(f) => pickImage("logo", f)}
                onRemove={() => setImages((i) => ({ ...i, logo: null }))}
              />
              <PickImage
                label={t("pf.look.cover")}
                hint={t("pf.look.cover.hint")}
                has={!!images.cover}
                onPick={(f) => pickImage("cover", f)}
                onRemove={() => setImages((i) => ({ ...i, cover: null }))}
              />
              <Field label={t("ob.prefs.pageColor")} hint={t("ob.prefs.brandHint")}>
                <ColorSwatches value={brand} onChange={setBrand} label={t("ob.prefs.pageColor")} />
              </Field>
              <Field label={t("ob.prefs.approval")}>
                <div className="grid gap-2">
                  {[
                    [true, t("ob.prefs.auto"), t("ob.prefs.auto.sub")],
                    [false, t("ob.prefs.manual"), t("ob.prefs.manual.sub")],
                  ].map(([value, label, sub]) => (
                    <ChoiceCard
                      key={String(value)}
                      active={autoConfirm === value}
                      onClick={() => setAutoConfirm(value as boolean)}
                      title={label as string}
                      subtitle={sub as string}
                    />
                  ))}
                </div>
              </Field>
              <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4">
                <div>
                  <p className="text-sm font-bold">{t("pf.av.autoComplete")}</p>
                  <p className="text-sm text-muted-foreground">{t("pf.av.autoComplete.desc")}</p>
                </div>
                <Switch
                  checked={autoComplete}
                  onCheckedChange={setAutoComplete}
                  aria-label={t("pf.av.autoComplete")}
                />
              </div>
              <Field label={t("ob.prefs.cancel")} hint={t("ob.prefs.cancelHint")}>
                <div className="grid grid-cols-4 gap-2">
                  {CANCEL_HOURS.map((h) => (
                    <button
                      key={h}
                      type="button"
                      aria-pressed={cancelHours === h}
                      onClick={() => setCancelHours(h)}
                      className={cn(
                        "h-11 rounded-xl border text-sm font-bold transition-colors",
                        cancelHours === h
                          ? "border-brand bg-brand text-brand-foreground"
                          : "border-border bg-card hover:bg-muted",
                      )}
                    >
                      {h}h
                    </button>
                  ))}
                </div>
              </Field>
            </>
          )}

          <FormError message={error} />
        </div>
      </main>

      <ImageCropDialog
        file={cropping?.file ?? null}
        shape={cropping?.kind ?? "logo"}
        onCancel={() => setCropping(null)}
        onDone={(f) => {
          if (cropping) setImages((i) => ({ ...i, [cropping.kind]: f }));
          setCropping(null);
        }}
      />

      {/* Bottom bar: always within thumb reach. */}
      <footer className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 pb-[calc(0.75rem+var(--sab))] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-5">
          {stepIdx > 0 && (
            <Button
              variant="outline"
              size="lg"
              onClick={back}
              disabled={busy}
              aria-label={t("onb.back")}
            >
              <ArrowLeft />
            </Button>
          )}
          <Button size="lg" className="flex-1" onClick={next} disabled={busy}>
            {busy && <Loader2 className="animate-spin" />}
            {isLast ? t("ob.create") : t("auth.continue")}
            {!isLast && <ArrowRight />}
          </Button>
        </div>
        {step === "contacts" && (
          <p className="mx-auto mt-2 max-w-xl px-5 text-center text-xs text-muted-foreground">
            {t("ob.optional")}
          </p>
        )}
      </footer>
    </div>
  );
}

/** One picture choice: pick (then crop), change or remove. */
function PickImage({
  label,
  hint,
  has,
  onPick,
  onRemove,
}: {
  label: string;
  hint: string;
  has: boolean;
  onPick: (f: File) => void;
  onRemove: () => void;
}) {
  const { t } = usePrefs();
  const input = useRef<HTMLInputElement>(null);
  return (
    <Field label={label} hint={hint}>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => input.current?.click()}>
          <ImagePlus /> {has ? t("pf.look.change") : t("pf.look.upload")}
        </Button>
        {has && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("pf.look.remove")}
            onClick={onRemove}
          >
            <Trash2 />
          </Button>
        )}
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) onPick(f);
          }}
        />
      </div>
    </Field>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor} className="text-sm font-bold">
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function TimeRange({
  start,
  end,
  onStart,
  onEnd,
}: {
  start: string;
  end: string;
  onStart: (v: string) => void;
  onEnd: (v: string) => void;
}) {
  const { t } = usePrefs();
  return (
    <div className="flex items-center gap-2">
      <Input
        type="time"
        value={start}
        onChange={(e) => onStart(e.target.value)}
        className="flex-1"
      />
      <span className="text-sm text-muted-foreground">{t("pf.av.to")}</span>
      <Input type="time" value={end} onChange={(e) => onEnd(e.target.value)} className="flex-1" />
    </div>
  );
}

function ChoiceCard({
  active,
  onClick,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors",
        active
          ? "border-brand bg-brand/8 ring-1 ring-brand"
          : "border-border bg-card hover:bg-muted",
      )}
    >
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full border-2",
          active ? "border-brand bg-brand" : "border-border",
        )}
      >
        {active && <span className="size-2 rounded-full bg-white" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold">{title}</span>
        <span className="block text-xs font-normal text-muted-foreground">{subtitle}</span>
      </span>
    </button>
  );
}

/**
 * The finish line: the page is live, here's the link. Also where the owner learns about the
 * free month of Pro and its price, once, with the option (never the push) to subscribe now.
 */
function Done({
  slug,
  onGo,
  onSubscribe,
}: {
  slug: string;
  onGo: () => void;
  onSubscribe: () => void;
}) {
  const { t } = usePrefs();
  const url = typeof window !== "undefined" ? `${window.location.origin}/${slug}` : `/${slug}`;
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-5 py-10">
      <section className="surface animate-enter w-full max-w-md p-7 text-center">
        <span className="animate-icon-pop mx-auto flex size-16 items-center justify-center rounded-full bg-brand text-brand-foreground">
          <Check className="size-8" strokeWidth={3} />
        </span>
        <h1 className="mt-5 font-display text-[28px] font-bold leading-tight tracking-tight">
          {t("ob.done.title")}
        </h1>
        <p className="mt-2 text-[15px] text-muted-foreground">{t("ob.done.body")}</p>
        <div className="mt-6 flex items-center gap-2 rounded-xl border border-border bg-muted/50 p-1.5 pl-3.5">
          <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold">{url}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(url);
              toast.success(t("onb.success.linkCopied"));
            }}
          >
            <Copy /> {t("today.copy")}
          </Button>
        </div>
        <div className="mt-6 rounded-2xl border border-brand/30 bg-brand/5 p-4 text-left">
          <p className="flex items-center gap-2 text-sm font-bold">
            <Crown className="size-4 text-brand-ink" /> {t("ob.done.trialTitle")}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {t("ob.done.trialBody")}
          </p>
        </div>
        <div className="mt-5 flex flex-col gap-2">
          <Button size="lg" onClick={onGo}>
            {t("ob.done.start")} <ArrowRight />
          </Button>
          <Button variant="outline" onClick={onSubscribe}>
            <Crown /> {t("ob.done.subscribe")}
          </Button>
          <p className="text-xs text-muted-foreground">{t("ob.done.subscribeNote")}</p>
          <Button variant="ghost" asChild>
            <a href={`/${slug}`} target="_blank" rel="noreferrer">
              <ExternalLink /> {t("ob.done.view")}
            </a>
          </Button>
        </div>
      </section>
    </div>
  );
}
