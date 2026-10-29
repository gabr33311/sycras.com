import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePrefs } from "@/lib/prefs";

/** How many photos of the shop the public page shows. */
export const GALLERY_MAX = 8;

/** Phone photos are huge: a 1600 px WebP is sharp on any screen and loads fast. */
async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.82));
    return blob ?? file;
  } catch {
    return file;
  }
}

/**
 * Photos of the shop for the public booking page: add (several at once), remove.
 * Saved right away, like the logo and the cover.
 */
export function GalleryEditor({
  businessId,
  paths,
  bare = false,
}: {
  businessId: string;
  paths: string[];
  /** Inside another card: no frame, no title (the host already names it). */
  bare?: boolean;
}) {
  const { t } = usePrefs();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const { data: urls } = useQuery({
    queryKey: ["gallery-urls", paths.join("|")],
    enabled: paths.length > 0,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.storage.from("business-logos").createSignedUrls(paths, 3600);
      return Object.fromEntries((data ?? []).map((d) => [d.path ?? "", d.signedUrl ?? ""]));
    },
  });

  async function save(next: string[]) {
    const { error } = await supabase
      .from("businesses")
      .update({ gallery: next })
      .eq("id", businessId);
    if (error) {
      toast.error(t("pf.biz.err.savePhoto"));
      return false;
    }
    await qc.invalidateQueries({ queryKey: ["my-business"] });
    return true;
  }

  async function add(files: FileList | null) {
    const picked = [...(files ?? [])].filter((f) => f.type.startsWith("image/"));
    const room = GALLERY_MAX - paths.length;
    if (!picked.length || room <= 0) return;
    if (picked.length > room) toast.message(t("gal.tooMany").replace("{n}", String(GALLERY_MAX)));
    setBusy(true);
    const added: string[] = [];
    for (const [i, file] of picked.slice(0, room).entries()) {
      const blob = await shrink(file);
      const path = `${businessId}/gallery-${Date.now()}-${i}.webp`;
      const { error } = await supabase.storage
        .from("business-logos")
        .upload(path, blob, { contentType: blob.type || "image/webp" });
      if (!error) added.push(path);
    }
    if (added.length && (await save([...paths, ...added]))) toast.success(t("pf.pub.saved"));
    else if (!added.length) toast.error(t("pf.biz.err.upload"));
    setBusy(false);
  }

  async function remove(path: string) {
    if (await save(paths.filter((p) => p !== path))) {
      void supabase.storage.from("business-logos").remove([path]);
    }
  }

  return (
    <section className={bare ? "space-y-3" : "surface space-y-4 p-5"}>
      <div>
        {!bare && <h2 className="text-sm font-bold">{t("gal.title")}</h2>}
        <p className={cn("text-sm text-muted-foreground", !bare && "mt-0.5")}>
          {t("gal.desc").replace("{n}", String(GALLERY_MAX))}
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
        {paths.map((p) => (
          <div
            key={p}
            className="relative aspect-square overflow-hidden rounded-xl border border-border bg-muted"
          >
            {urls?.[p] && <img src={urls[p]} alt="" className="size-full object-cover" />}
            <button
              type="button"
              onClick={() => void remove(p)}
              aria-label={t("gal.remove")}
              className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur hover:bg-black/80"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
        {paths.length < GALLERY_MAX && (
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border text-xs font-bold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
            {busy ? t("gal.uploading") : t("gal.add")}
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          void add(e.target.files);
          e.target.value = "";
        }}
      />
    </section>
  );
}
