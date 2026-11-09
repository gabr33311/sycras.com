import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/hooks/use-business";
import { useHasPro } from "@/hooks/use-subscription";
import { usePrefs } from "@/lib/prefs";
import { computeDeposit, type DepositMode } from "@/lib/deposit";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SaveBar } from "@/components/save-bar";

/** POSTs to one of the payments API routes with the signed-in session. */
async function paymentsApi<T>(path: string, body: Record<string, unknown>): Promise<T | null> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session?.access_token ?? ""}`,
    },
    body: JSON.stringify(body),
  }).catch(() => null);
  return res ? ((await res.json().catch(() => null)) as T | null) : null;
}

/** The saved deposit as typed in the box: "5" / "2,5" euros, or "30" percent. */
function savedValue(b: { deposit_mode: string; deposit_value: number }): string {
  return b.deposit_mode === "percent"
    ? String(b.deposit_value)
    : String(b.deposit_value / 100).replace(".", ",");
}

/**
 * "Pedir sinal ao marcar": the business's own Stripe account (connected once), then a fixed
 * value or a percentage of the service. Paying Pro only.
 */
export function DepositSettings() {
  const { business } = useMyBusiness();
  const hasPro = useHasPro();
  const { t } = usePrefs();
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<DepositMode>("fixed");
  const [value, setValue] = useState("5");
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState(false);

  function reset() {
    if (!business) return;
    setEnabled(business.deposit_enabled);
    setMode(business.deposit_mode === "percent" ? "percent" : "fixed");
    setValue(savedValue(business));
  }
  useEffect(reset, [business]);

  // Back from the Stripe sign-up (or still waiting for it): ask Stripe how it went.
  const accountId = business?.stripe_account_id;
  const ready = business?.stripe_charges_enabled === true;
  useEffect(() => {
    if (!business || !accountId || ready) return;
    void paymentsApi("/api/payments/status", { businessId: business.id }).then(() =>
      qc.invalidateQueries({ queryKey: ["my-business"] }),
    );
  }, [business, accountId, ready, qc]);

  if (!business) return null;
  const number = Number(value.replace(",", "."));
  const stored = mode === "percent" ? Math.round(number) : Math.round(number * 100);
  const valid = Number.isFinite(number) && stored > 0 && (mode === "fixed" || stored <= 100);
  const dirty =
    enabled !== business.deposit_enabled ||
    mode !== (business.deposit_mode === "percent" ? "percent" : "fixed") ||
    value !== savedValue(business);

  async function connect() {
    if (!business) return;
    setOpening(true);
    const res = await paymentsApi<{ ok: boolean; url?: string; message?: string }>(
      "/api/payments/connect",
      { businessId: business.id, from: "web" },
    );
    setOpening(false);
    if (res?.ok && res.url) window.location.href = res.url;
    else toast.error(res?.message ?? t("pf.common.saveError"));
  }

  async function save() {
    if (!business || !valid) {
      toast.error(t("pf.common.checkData"));
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("businesses")
      .update({ deposit_enabled: enabled, deposit_mode: mode, deposit_value: stored })
      .eq("id", business.id);
    setBusy(false);
    if (error) {
      toast.error(t("pf.common.saveError"));
      return;
    }
    toast.success(t("pf.common.saved"));
    void qc.invalidateQueries({ queryKey: ["my-business"] });
  }

  const example = valid ? computeDeposit(1500, mode, stored) : 0;
  const canTurnOn = hasPro === true && ready;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
        <div>
          <p className="text-sm font-bold">{t("dp.toggle")}</p>
          <p className="text-sm text-muted-foreground">
            {hasPro === false ? t("dp.pro") : t("dp.desc")}
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={!canTurnOn && !enabled}
          onCheckedChange={setEnabled}
          aria-label={t("dp.toggle")}
        />
      </div>

      {hasPro !== false && !ready ? (
        <div className="space-y-3 rounded-xl bg-muted p-4">
          <p className="text-sm text-muted-foreground">
            {accountId ? t("dp.pending") : t("dp.connectWhy")}
          </p>
          <Button className="rounded-full" disabled={opening} onClick={() => void connect()}>
            {accountId ? t("dp.continue") : t("dp.connect")}
          </Button>
        </div>
      ) : null}

      {enabled ? (
        <div className="space-y-3">
          <div className="inline-flex rounded-full bg-muted p-1">
            {(["fixed", "percent"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setValue(m === "percent" ? "30" : "5");
                }}
                className={`h-9 rounded-full px-4 text-sm font-semibold ${mode === m ? "bg-background shadow-sm" : "text-muted-foreground"}`}
              >
                {t(m === "fixed" ? "dp.fixed" : "dp.percent")}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, ""))}
              className="w-28"
              aria-label={t(mode === "fixed" ? "dp.amount" : "dp.pct")}
            />
            <span className="text-sm font-semibold text-muted-foreground">
              {mode === "fixed" ? "€" : "%"}
            </span>
          </div>
          {example > 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("dp.example").replace("{x}", formatPrice(example, business.currency))}
            </p>
          ) : null}
        </div>
      ) : null}

      <SaveBar dirty={dirty} busy={busy} onSave={() => void save()} onCancel={reset} />
    </div>
  );
}
