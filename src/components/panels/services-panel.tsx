import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, LoadingRows, FormError } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useMyBusiness } from "@/hooks/use-business";
import { usePrefs } from "@/lib/prefs";
import { formatDuration, formatPrice } from "@/lib/format";
import { hasUpcomingAppointments } from "@/lib/appointment-status";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  GripVertical,
  Loader2,
  Plus,
  Scissors,
  Trash2,
} from "lucide-react";
import { ConfirmAction } from "@/components/confirm-action";

type ServiceRow = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  duration_minutes: number;
  buffer_minutes: number;
  is_active: boolean;
  requires_confirmation: boolean;
};

const schema = z.object({
  name: z.string().trim().min(2, "pf.svc.err.name").max(80),
  price: z.number().min(0, "pf.svc.err.price").max(100000),
  duration: z.number().int().min(5, "pf.svc.err.duration").max(600),
  buffer: z.number().int().min(0).max(120),
  description: z.string().trim().max(300),
});

export function ServicesPanel() {
  const { business } = useMyBusiness();
  const { t } = usePrefs();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<ServiceRow | null>(null);
  const [open, setOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["services", business?.id],
    enabled: !!business,
    queryFn: async () => {
      const { data } = await supabase
        .from("services")
        .select(
          "id, name, description, price_cents, duration_minutes, buffer_minutes, is_active, requires_confirmation",
        )
        .eq("business_id", business!.id)
        .order("sort_order");
      return (data ?? []) as ServiceRow[];
    },
  });

  // Who does each service, shown under its name. Under "team", so editing a person refreshes it.
  const { data: whoDoes } = useQuery({
    queryKey: ["team", business?.id, "by-service"],
    enabled: !!business,
    queryFn: async () => {
      const [{ data: staff }, { data: links }] = await Promise.all([
        supabase
          .from("staff")
          .select("id, name")
          .eq("business_id", business!.id)
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("staff_services")
          .select("staff_id, service_id")
          .eq("business_id", business!.id),
      ]);
      const out: Record<string, string[]> = {};
      for (const s of staff ?? [])
        for (const l of links ?? [])
          if (l.staff_id === s.id) (out[l.service_id] ??= []).push(s.name.split(" ")[0] ?? s.name);
      return { byService: out, people: staff?.length ?? 0 };
    },
  });

  async function toggleActive(s: ServiceRow) {
    // Flip immediately so the switch answers the tap; the refetch corrects a failure.
    qc.setQueryData(["services", business?.id], (prev: ServiceRow[] | undefined) =>
      prev?.map((r) => (r.id === s.id ? { ...r, is_active: !s.is_active } : r)),
    );
    const { error } = await supabase
      .from("services")
      .update({ is_active: !s.is_active })
      .eq("id", s.id);
    if (error) toast.error(t("pf.svc.err.save"));
    qc.invalidateQueries({ queryKey: ["services"] });
  }

  async function move(id: string, to: number) {
    const list = data ?? [];
    const from = list.findIndex((s) => s.id === id);
    if (from < 0 || to < 0 || to >= list.length || from === to) return;
    const next = [...list];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    qc.setQueryData(["services", business?.id], next);
    const results = await Promise.all(
      next.map((s, i) => supabase.from("services").update({ sort_order: i }).eq("id", s.id)),
    );
    if (results.some((r) => r.error)) toast.error(t("pf.svc.err.save"));
    qc.invalidateQueries({ queryKey: ["services"] });
  }

  function reorder(targetId: string) {
    if (!dragId || dragId === targetId) return;
    void move(
      dragId,
      (data ?? []).findIndex((s) => s.id === targetId),
    );
  }

  async function remove(s: ServiceRow): Promise<boolean> {
    // Deleting nulls service_id on its appointments (FK SET NULL), which stops
    // clients from rescheduling them. Keep it: deactivate instead.
    if (await hasUpcomingAppointments("service_id", s.id)) {
      // Offer the safe alternative right where the problem shows up.
      toast.error(
        t("pf.svc.err.hasAppointments"),
        s.is_active
          ? { action: { label: t("pf.common.deactivate"), onClick: () => void toggleActive(s) } }
          : undefined,
      );
      return true;
    }
    const { error } = await supabase.from("services").delete().eq("id", s.id);
    if (error) {
      toast.error(t("pf.svc.err.save"));
      return false;
    }
    toast.success(t("pf.svc.removed"));
    qc.invalidateQueries({ queryKey: ["services"] });
    return true;
  }

  // A fresh key per opening, so "New" never shows the previous form's leftovers.
  const [formKey, setFormKey] = useState(0);
  function openEditor(s: ServiceRow | null) {
    setEditing(s);
    setFormKey((k) => k + 1);
    setOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold">{t("pf.s.services")}</h2>
        <Button size="sm" variant="outline" onClick={() => openEditor(null)}>
          <Plus className="size-4" /> {t("pf.svc.new")}
        </Button>
      </div>

      {isLoading ? (
        <LoadingRows />
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<Scissors className="size-6" />}
          title={t("pf.svc.empty.title")}
          description={t("pf.svc.empty.desc")}
        />
      ) : (
        <ul className="surface animate-stagger divide-y divide-border overflow-hidden p-0">
          {data!.map((s, index) => (
            <li
              key={s.id}
              draggable
              onDragStart={() => setDragId(s.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                reorder(s.id);
                setDragId(null);
              }}
              onDragEnd={() => setDragId(null)}
              className="flex min-h-[4.5rem] items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4"
            >
              {/* Drag only works with a mouse; touch screens get up/down arrows. */}
              <GripVertical className="hidden size-4 shrink-0 cursor-grab text-muted-foreground sm:block" />
              <div className="flex shrink-0 flex-col sm:hidden">
                <button
                  type="button"
                  aria-label={t("pf.common.up")}
                  disabled={index === 0}
                  onClick={() => void move(s.id, index - 1)}
                  className="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-25"
                >
                  <ChevronUp className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={t("pf.common.down")}
                  disabled={index === data!.length - 1}
                  onClick={() => void move(s.id, index + 1)}
                  className="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-25"
                >
                  <ChevronDown className="size-4" />
                </button>
              </div>
              {/* The whole row opens the editor: no separate pencil to find. */}
              <button
                type="button"
                onClick={() => openEditor(s)}
                aria-label={`${t("pf.common.edit")} ${s.name}`}
                className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg text-left transition-opacity hover:opacity-80 ${s.is_active ? "" : "opacity-55"}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold">{s.name}</span>
                  <span className="block truncate text-sm font-normal text-muted-foreground">
                    {formatDuration(s.duration_minutes)} ·{" "}
                    {formatPrice(s.price_cents, business!.currency)}
                    {s.buffer_minutes ? ` · +${s.buffer_minutes}${t("pf.svc.bufferSuffix")}` : ""}
                    {/* With a team, who does it; alone, it is always you. */}
                    {(whoDoes?.people ?? 0) > 1 &&
                      ` · ${whoDoes?.byService[s.id]?.join(", ") || t("pf.svc.nobody")}`}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
              <Switch
                checked={s.is_active}
                onCheckedChange={() => toggleActive(s)}
                aria-label={s.is_active ? t("pf.common.active") : t("pf.common.inactive")}
                className="shrink-0"
              />
            </li>
          ))}
        </ul>
      )}

      <ServiceDialog
        key={formKey}
        businessId={business?.id}
        service={editing}
        open={open}
        onOpenChange={setOpen}
        onRemove={editing ? () => remove(editing) : undefined}
      />
    </div>
  );
}

function ServiceDialog({
  businessId,
  service,
  open,
  onOpenChange,
  onRemove,
}: {
  businessId: string | undefined;
  service: ServiceRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Removing lives inside the editor, so the list rows stay calm. */
  onRemove?: (() => Promise<boolean>) | undefined;
}) {
  const qc = useQueryClient();
  const { t } = usePrefs();
  const [name, setName] = useState(service?.name ?? "");
  const [description, setDescription] = useState(service?.description ?? "");
  const [price, setPrice] = useState(String((service?.price_cents ?? 0) / 100));
  const [duration, setDuration] = useState(String(service?.duration_minutes ?? 30));
  const [buffer, setBuffer] = useState(String(service?.buffer_minutes ?? 0));
  const [requiresConfirmation, setRequiresConfirmation] = useState(
    service?.requires_confirmation ?? false,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const parsed = schema.safeParse({
      name,
      description,
      price: Number(price.replace(",", ".")),
      duration: Number(duration),
      buffer: Number(buffer),
    });
    if (!parsed.success) {
      setError(t(parsed.error.issues[0]?.message ?? "pf.common.checkData"));
      return;
    }
    if (!businessId) return;
    setError(null);
    setBusy(true);
    const payload = {
      business_id: businessId,
      name: parsed.data.name,
      description: parsed.data.description || null,
      price_cents: Math.round(parsed.data.price * 100),
      duration_minutes: parsed.data.duration,
      buffer_minutes: parsed.data.buffer,
      requires_confirmation: requiresConfirmation,
    };
    const { error } = service
      ? await supabase.from("services").update(payload).eq("id", service.id)
      : await supabase.from("services").insert(payload);
    setBusy(false);
    if (error) {
      setError(t("pf.svc.err.save"));
      return;
    }
    toast.success(t("pf.svc.saved"));
    qc.invalidateQueries({ queryKey: ["services"] });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{service ? t("pf.svc.editTitle") : t("pf.svc.new")}</DialogTitle>
          <DialogDescription>{t("pf.svc.dialogDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sname" className="font-semibold">
              {t("pf.svc.name")}
            </Label>
            <Input
              id="sname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sdesc" className="font-semibold">
              {t("pf.svc.description")}
            </Label>
            <Textarea
              id="sdesc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={300}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="sprice" className="font-semibold">
                {t("pf.svc.price")}
              </Label>
              <Input
                id="sprice"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sdur" className="font-semibold">
                {t("pf.svc.duration")}
              </Label>
              <Input
                id="sdur"
                inputMode="numeric"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sbuf" className="font-semibold">
                {t("pf.svc.buffer")}
              </Label>
              <Input
                id="sbuf"
                inputMode="numeric"
                value={buffer}
                onChange={(e) => setBuffer(e.target.value)}
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">{t("pf.svc.buffer.hint")}</p>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">{t("pf.svc.requiresConfirmation")}</p>
              <p className="text-xs text-muted-foreground">
                {t("pf.svc.requiresConfirmation.desc")}
              </p>
            </div>
            <Switch
              checked={requiresConfirmation}
              onCheckedChange={setRequiresConfirmation}
              aria-label={t("pf.svc.requiresConfirmation")}
            />
          </div>
          <FormError message={error} />
          <Button className="w-full" onClick={save} disabled={busy}>
            {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
            {t("pf.common.save")}
          </Button>
          {onRemove && (
            <ConfirmAction
              title={t("pf.svc.removeTitle").replace("{name}", service?.name ?? "")}
              description={t("pf.svc.removeDesc")}
              confirmLabel={t("pf.common.remove")}
              onConfirm={async () => {
                const ok = await onRemove();
                if (ok) onOpenChange(false);
                return ok;
              }}
              trigger={
                <Button variant="ghost" className="w-full" disabled={busy}>
                  <Trash2 className="size-4" />
                  {t("pf.common.remove")}
                </Button>
              }
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
