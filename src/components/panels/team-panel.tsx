import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, LoadingRows, FormError } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useMyBusiness } from "@/hooks/use-business";
import { usePrefs } from "@/lib/prefs";
import { initials } from "@/lib/format";
import { hasUpcomingAppointments } from "@/lib/appointment-status";
import { ChevronRight, Loader2, Plus, Trash2, UserRound } from "lucide-react";
import { ConfirmAction } from "@/components/confirm-action";

type StaffRow = {
  id: string;
  name: string;
  specialty: string | null;
  is_active: boolean;
  service_ids: string[];
};

export function TeamPanel() {
  const { business } = useMyBusiness();
  const { t } = usePrefs();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StaffRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["team", business?.id],
    enabled: !!business,
    queryFn: async () => {
      const [{ data: staff }, { data: services }, { data: links }] = await Promise.all([
        supabase
          .from("staff")
          .select("id, name, specialty, is_active")
          .eq("business_id", business!.id)
          .order("sort_order"),
        supabase
          .from("services")
          .select("id, name")
          .eq("business_id", business!.id)
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("staff_services")
          .select("staff_id, service_id")
          .eq("business_id", business!.id),
      ]);
      const rows: StaffRow[] = (staff ?? []).map((s) => ({
        ...s,
        service_ids: (links ?? []).filter((l) => l.staff_id === s.id).map((l) => l.service_id),
      }));
      return { rows, services: services ?? [] };
    },
  });

  async function remove(s: StaffRow): Promise<boolean> {
    const id = s.id;
    // Deleting nulls staff_id on their appointments (FK SET NULL), and an appointment
    // with no professional blocks everyone's slots. Keep them: deactivate instead.
    if (await hasUpcomingAppointments("staff_id", id)) {
      // Offer the safe alternative right where the problem shows up.
      toast.error(
        t("pf.team.err.hasAppointments"),
        s.is_active
          ? { action: { label: t("pf.common.deactivate"), onClick: () => void toggleActive(s) } }
          : undefined,
      );
      return true;
    }
    const { error } = await supabase.from("staff").delete().eq("id", id);
    if (error) {
      toast.error(t("pf.common.saveError"));
      return false;
    }
    toast.success(t("pf.team.removed"));
    qc.invalidateQueries({ queryKey: ["team"] });
    return true;
  }

  async function toggleActive(s: StaffRow) {
    // Flip immediately so the switch answers the tap; the refetch corrects a failure.
    qc.setQueryData(
      ["team", business?.id],
      (prev: typeof data) =>
        prev && {
          ...prev,
          rows: prev.rows.map((r) => (r.id === s.id ? { ...r, is_active: !s.is_active } : r)),
        },
    );
    const { error } = await supabase
      .from("staff")
      .update({ is_active: !s.is_active })
      .eq("id", s.id);
    if (error) toast.error(t("pf.common.saveError"));
    qc.invalidateQueries({ queryKey: ["team"] });
  }

  // A fresh key per opening, so "Add" never shows the previous form's leftovers.
  const [formKey, setFormKey] = useState(0);
  function openEditor(s: StaffRow | null) {
    setEditing(s);
    setFormKey((k) => k + 1);
    setOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold">{t("pf.s.team")}</h2>
        <Button size="sm" variant="outline" onClick={() => openEditor(null)}>
          <Plus className="size-4" /> {t("pf.team.add")}
        </Button>
      </div>

      {isLoading ? (
        <LoadingRows />
      ) : (data?.rows.length ?? 0) === 0 ? (
        <EmptyState
          icon={<UserRound className="size-6" />}
          title={t("pf.team.empty.title")}
          description={t("pf.team.empty.desc")}
        />
      ) : (
        <ul className="surface animate-stagger divide-y divide-border overflow-hidden p-0">
          {data!.rows.map((s) => (
            <li
              key={s.id}
              className="flex min-h-[4.5rem] items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4"
            >
              {/* The whole row opens the editor: no separate pencil to find. */}
              <button
                type="button"
                onClick={() => openEditor(s)}
                aria-label={`${t("pf.common.edit")} ${s.name}`}
                className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left transition-opacity hover:opacity-80 ${s.is_active ? "" : "opacity-55"}`}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
                  {initials(s.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold">{s.name}</span>
                  <span className="block truncate text-sm font-normal text-muted-foreground">
                    {s.specialty ? `${s.specialty} · ` : ""}
                    {s.service_ids.length}
                    {t("pf.team.servicesCount")}
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

      <StaffDialog
        key={formKey}
        businessId={business?.id}
        staff={editing}
        services={data?.services ?? []}
        open={open}
        onOpenChange={setOpen}
        onRemove={editing ? () => remove(editing) : undefined}
      />
    </div>
  );
}

const schema = z.object({
  name: z.string().trim().min(2, "pf.team.err.name").max(80),
  specialty: z.string().trim().max(80),
});

function StaffDialog({
  businessId,
  staff,
  services,
  open,
  onOpenChange,
  onRemove,
}: {
  businessId: string | undefined;
  staff: StaffRow | null;
  services: { id: string; name: string }[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Removing lives inside the editor, so the list rows stay calm. */
  onRemove?: (() => Promise<boolean>) | undefined;
}) {
  const qc = useQueryClient();
  const { t } = usePrefs();
  const [name, setName] = useState(staff?.name ?? "");
  const [specialty, setSpecialty] = useState(staff?.specialty ?? "");
  const [selected, setSelected] = useState<string[]>(
    staff?.service_ids ?? services.map((s) => s.id),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const parsed = schema.safeParse({ name, specialty });
    if (!parsed.success) {
      setError(t(parsed.error.issues[0]?.message ?? "pf.common.checkData"));
      return;
    }
    if (!businessId) return;
    setError(null);
    setBusy(true);
    try {
      const payload = {
        business_id: businessId,
        name: parsed.data.name,
        specialty: parsed.data.specialty || null,
      };
      let staffId = staff?.id;
      if (staffId) {
        const { error } = await supabase.from("staff").update(payload).eq("id", staffId);
        if (error) throw error;
      } else {
        const { data: created, error } = await supabase
          .from("staff")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        staffId = created.id;
      }
      const { error: unlinkError } = await supabase
        .from("staff_services")
        .delete()
        .eq("staff_id", staffId!);
      if (unlinkError) throw unlinkError;
      if (selected.length) {
        const { error: linkError } = await supabase.from("staff_services").insert(
          selected.map((sid) => ({
            staff_id: staffId!,
            service_id: sid,
            business_id: businessId,
          })),
        );
        if (linkError) throw linkError;
      }
      toast.success(t("pf.team.saved"));
      qc.invalidateQueries({ queryKey: ["team"] });
      onOpenChange(false);
    } catch {
      setError(t("pf.common.saveError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{staff ? t("pf.team.editTitle") : t("pf.team.newTitle")}</DialogTitle>
          <DialogDescription>{t("pf.team.dialogDesc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pname" className="font-semibold">
              {t("pf.team.name")}
            </Label>
            <Input
              id="pname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pspec" className="font-semibold">
              {t("pf.team.specialty")}
            </Label>
            <Input
              id="pspec"
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
              maxLength={80}
              placeholder={t("pf.team.specialty.placeholder")}
            />
          </div>
          <div className="space-y-2">
            <Label className="font-semibold">{t("pf.team.services")}</Label>
            {services.length === 0 && (
              <p className="text-sm text-muted-foreground">{t("pf.team.noServices")}</p>
            )}
            {services.map((s) => (
              <label
                key={s.id}
                className="-mx-2 flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-2 text-sm transition-colors hover:bg-muted/50"
              >
                <Checkbox
                  checked={selected.includes(s.id)}
                  onCheckedChange={(v) =>
                    setSelected((prev) => (v ? [...prev, s.id] : prev.filter((x) => x !== s.id)))
                  }
                />
                {s.name}
              </label>
            ))}
          </div>
          <FormError message={error} />
          <Button className="w-full" onClick={save} disabled={busy}>
            {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
            {t("pf.common.save")}
          </Button>
          {onRemove && (
            <ConfirmAction
              title={t("pf.team.removeTitle").replace("{name}", staff?.name ?? "")}
              description={t("pf.team.removeDesc")}
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
