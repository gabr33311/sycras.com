import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { ImagePlus, Images, MapPin, Palette, Store, ToggleRight, Trash2 } from "lucide-react";
import { SettingBlock, SettingBlocks } from "@/components/setting-block";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useMyBusiness } from "@/hooks/use-business";
import { useLogoUrl } from "@/hooks/use-logo";
import { usePrefs } from "@/lib/prefs";
import { effectiveBrand } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { SaveBar } from "@/components/save-bar";
import { LocationPicker } from "@/components/location-picker";
import { ColorSwatches } from "@/components/color-swatches";
import { PagePreview } from "@/components/page-preview";
import { ImageCropDialog } from "@/components/image-crop-dialog";
import { GalleryEditor } from "@/components/gallery-editor";

type Business = NonNullable<ReturnType<typeof useMyBusiness>["business"]>;
type ImageKind = "logo" | "cover";

const schema = z.object({
  name: z.string().trim().min(2, "pf.biz.err.name").max(80),
  description: z.string().trim().max(300),
  phone: z.string().trim().max(24),
  instagram: z.string().trim().max(60),
  address: z.string().trim().max(160),
  city: z.string().trim().max(80),
});

function baseline(b: Business) {
  return {
    name: b.name,
    description: b.description ?? "",
    phone: b.phone ?? "",
    instagram: b.instagram ?? "",
    address: b.address ?? "",
    city: b.city ?? "",
    lat: b.latitude ?? null,
    lng: b.longitude ?? null,
    showMap: b.show_map ?? true,
    showTeam: b.show_team,
    showContacts: b.show_contacts,
    google: b.seo_indexable ?? false,
    brand: effectiveBrand(b.brand_color),
  };
}
type Form = ReturnType<typeof baseline>;

/**
 * The business and its public page in one place. Five short blocks, one open
 * at a time, each showing its current state when closed: little scrolling,
 * one save for everything typed (pictures save as soon as they are framed).
 */
export function BusinessPagePanel() {
  const { business } = useMyBusiness();
  const { t } = usePrefs();
  const qc = useQueryClient();
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState("");
  // Remounts the map after "cancel", so the pin goes back too.
  const [mapKey, setMapKey] = useState(0);
  const [uploading, setUploading] = useState<ImageKind | null>(null);
  const [cropping, setCropping] = useState<{ kind: ImageKind; file: File } | null>(null);
  const logoUrl = useLogoUrl(business?.logo_url);
  const coverUrl = useLogoUrl(business?.cover_url);

  const hydrate = () => {
    if (business) setForm(baseline(business));
  };
  useEffect(hydrate, [business]);

  if (!business || !form) return null;
  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));
  const text = (k: keyof Form) => (e: { target: { value: string } }) =>
    set(k, e.target.value as never);
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline(business));

  async function save() {
    if (!business || !form) return;
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast.error(t(parsed.error.issues[0]?.message ?? "pf.common.checkData"));
      setOpen("data");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("businesses")
      .update({
        name: parsed.data.name,
        description: parsed.data.description || null,
        phone: parsed.data.phone || null,
        instagram: parsed.data.instagram || null,
        address: parsed.data.address || null,
        city: parsed.data.city || null,
        show_team: form.showTeam,
        show_contacts: form.showContacts,
        seo_indexable: form.google,
        brand_color: form.brand,
        // Only sent when moved, so saving works even before the columns exist.
        ...(form.lat !== (business.latitude ?? null) || form.lng !== (business.longitude ?? null)
          ? { latitude: form.lat, longitude: form.lng }
          : {}),
        ...(form.showMap !== (business.show_map ?? true) ? { show_map: form.showMap } : {}),
      })
      .eq("id", business.id);
    setBusy(false);
    if (error) {
      toast.error(t("pf.common.saveError"));
      return;
    }
    toast.success(t("pf.biz.saved"));
    void qc.invalidateQueries({ queryKey: ["my-business"] });
  }

  /** Pictures save right away: there is nothing to undo while picking a file. */
  async function setImage(kind: ImageKind, file: File | null) {
    if (!business) return;
    let path: string | null = null;
    setUploading(kind);
    if (file) {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      path = `${business.id}/${kind}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("business-logos")
        .upload(path, file, { upsert: true });
      if (upErr) {
        setUploading(null);
        toast.error(t("pf.biz.err.upload"));
        return;
      }
    }
    const { error } = await supabase
      .from("businesses")
      .update(kind === "logo" ? { logo_url: path } : { cover_url: path })
      .eq("id", business.id);
    setUploading(null);
    if (error) {
      toast.error(t("pf.biz.err.savePhoto"));
      return;
    }
    toast.success(t("pf.pub.saved"));
    void qc.invalidateQueries({ queryKey: ["my-business"] });
  }

  function pick(kind: ImageKind, file: File) {
    if (!file.type.startsWith("image/")) return void toast.error(t("pf.biz.err.imageType"));
    if (file.size > 15 * 1024 * 1024) return void toast.error(t("pf.biz.err.imageSize"));
    setCropping({ kind, file });
  }

  // What each closed block says about itself.
  const place = [form.address, form.city].filter(Boolean).join(", ");
  const photos = business.gallery?.length ?? 0;
  const shown = [
    form.showTeam && t("pf.bp.team"),
    form.showContacts && t("pf.bp.contacts"),
    form.google && "Google",
  ].filter(Boolean);

  return (
    <div className="space-y-3">
      <SettingBlocks value={open} onValueChange={setOpen}>
        <SettingBlock
          value="data"
          icon={Store}
          title={t("pf.bp.data")}
          summary={[form.name, form.phone || t("pf.bp.noPhone")].join(" · ")}
          warn={!form.phone}
        >
          <div className="space-y-4">
            <Field id="bn" label={t("pf.biz.name")}>
              <Input id="bn" value={form.name} onChange={text("name")} maxLength={80} />
            </Field>
            <Field id="bd" label={t("pf.biz.description")}>
              <Textarea
                id="bd"
                value={form.description}
                onChange={text("description")}
                maxLength={300}
                rows={2}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field id="bp" label={t("pf.biz.phone")}>
                <Input
                  id="bp"
                  type="tel"
                  inputMode="tel"
                  value={form.phone}
                  onChange={text("phone")}
                  maxLength={24}
                />
              </Field>
              <Field id="bi" label="Instagram">
                <Input
                  id="bi"
                  value={form.instagram}
                  onChange={text("instagram")}
                  maxLength={60}
                  placeholder="@onome"
                />
              </Field>
            </div>
          </div>
        </SettingBlock>

        <SettingBlock
          value="place"
          icon={MapPin}
          title={t("pf.bp.place")}
          summary={
            place
              ? [place, form.showMap && form.lat != null ? t("pf.bp.onMap") : null]
                  .filter(Boolean)
                  .join(" · ")
              : t("pf.bp.noAddress")
          }
          warn={!place}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field id="ba" label={t("pf.biz.address")}>
                <Input id="ba" value={form.address} onChange={text("address")} maxLength={160} />
              </Field>
              <Field id="bc" label={t("pf.biz.city")}>
                <Input id="bc" value={form.city} onChange={text("city")} maxLength={80} />
              </Field>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold">{t("loc.show")}</p>
                <p className="text-xs text-muted-foreground">{t("loc.show.desc")}</p>
              </div>
              <Switch
                checked={form.showMap}
                onCheckedChange={(v) => set("showMap", v)}
                aria-label={t("loc.show")}
              />
            </div>
            {form.showMap && (
              <LocationPicker
                key={mapKey}
                value={
                  form.lat != null && form.lng != null ? { lat: form.lat, lng: form.lng } : null
                }
                onChange={(v) => setForm((f) => (f ? { ...f, lat: v.lat, lng: v.lng } : f))}
                onAddress={(address, city) =>
                  setForm((f) =>
                    f
                      ? { ...f, address: f.address || address || "", city: f.city || city || "" }
                      : f,
                  )
                }
                initialQuery={place}
              />
            )}
          </div>
        </SettingBlock>

        <SettingBlock
          value="look"
          icon={Palette}
          title={t("pf.bp.look")}
          summary={[
            business.cover_url ? t("pf.bp.cover") : t("pf.bp.noCover"),
            business.logo_url ? t("pf.bp.logo") : t("pf.bp.noLogo"),
          ].join(" · ")}
          dot={form.brand}
        >
          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_14rem] md:items-start">
            <div className="space-y-4">
              <ImageRow
                title={t("pf.look.cover")}
                hint={t("pf.look.cover.hint")}
                has={!!business.cover_url}
                busy={uploading === "cover"}
                onPick={(f) => pick("cover", f)}
                onRemove={() => void setImage("cover", null)}
              />
              <ImageRow
                title={t("pf.look.logo")}
                hint={t("pf.look.logo.hint")}
                has={!!business.logo_url}
                busy={uploading === "logo"}
                onPick={(f) => pick("logo", f)}
                onRemove={() => void setImage("logo", null)}
              />
              <div className="space-y-2">
                <p className="text-sm font-bold">{t("pf.brand.title")}</p>
                <ColorSwatches
                  value={form.brand}
                  onChange={(v) => set("brand", v)}
                  label={t("pf.brand.title")}
                />
              </div>
            </div>
            {/* The live preview only where there is room for it beside the controls. */}
            <div className="hidden md:block">
              <PagePreview
                name={form.name}
                brand={form.brand}
                logoUrl={logoUrl}
                coverUrl={coverUrl}
              />
            </div>
          </div>
        </SettingBlock>

        <SettingBlock
          value="photos"
          icon={Images}
          title={t("pf.bp.photos")}
          summary={
            photos === 0
              ? t("pf.bp.photos.none")
              : photos === 1
                ? t("pf.bp.photos.one")
                : t("pf.bp.photos.n").replace("{n}", String(photos))
          }
        >
          <GalleryEditor businessId={business.id} paths={business.gallery ?? []} bare />
        </SettingBlock>

        <SettingBlock
          value="show"
          icon={ToggleRight}
          title={t("pf.pub.title")}
          summary={shown.length ? shown.join(" · ") : t("pf.bp.onlyServices")}
        >
          <div className="space-y-4">
            <ToggleRow
              title={t("pf.pub.showTeam")}
              description={t("pf.pub.showTeam.desc")}
              checked={form.showTeam}
              onChange={(v) => set("showTeam", v)}
            />
            <ToggleRow
              title={t("pf.pub.showContacts")}
              description={t("pf.bp.contacts.desc")}
              checked={form.showContacts}
              onChange={(v) => set("showContacts", v)}
            />
            <ToggleRow
              title={t("pf.set.google")}
              description={t("pf.set.google.desc")}
              checked={form.google}
              onChange={(v) => set("google", v)}
            />
          </div>
        </SettingBlock>
      </SettingBlocks>

      <ImageCropDialog
        file={cropping?.file ?? null}
        shape={cropping?.kind ?? "logo"}
        onCancel={() => setCropping(null)}
        onDone={async (f) => {
          if (!cropping) return;
          await setImage(cropping.kind, f);
          setCropping(null);
        }}
      />

      <SaveBar
        dirty={dirty}
        busy={busy}
        onSave={() => void save()}
        onCancel={() => {
          hydrate();
          setMapKey((k) => k + 1);
        }}
      />
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id} className="font-semibold">
        {label}
      </Label>
      {children}
    </div>
  );
}

function ImageRow({
  title,
  hint,
  has,
  busy,
  onPick,
  onRemove,
}: {
  title: string;
  hint: string;
  has: boolean;
  busy: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
}) {
  const { t } = usePrefs();
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-bold">{title}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="flex shrink-0 gap-1">
        {has && (
          <Button
            variant="ghost"
            size="icon"
            disabled={busy}
            onClick={onRemove}
            aria-label={t("pf.look.remove")}
          >
            <Trash2 />
          </Button>
        )}
        <Button variant="outline" size="sm" disabled={busy} onClick={() => ref.current?.click()}>
          <ImagePlus /> {has ? t("pf.look.change") : t("pf.look.upload")}
        </Button>
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-bold">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={title} />
    </div>
  );
}
