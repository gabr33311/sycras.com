import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Copy, Gift, Loader2, Pencil, Share2, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePrefs } from "@/lib/prefs";
import { cn } from "@/lib/utils";

type Summary = {
  code: string;
  canChange: boolean;
  invited: number;
  paying: number;
  pendingCents: number;
  balanceCents: number;
  paidCents: number;
  requestedCents: number;
  payouts: { amountCents: number; status: string; requestedAt: string; iban: string }[];
};

const MIN_PAYOUT_CENTS = 2000;
const euros = (cents: number) =>
  new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(cents / 100);

async function call(method: "GET" | "POST", body?: unknown) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch("/api/referral", {
    method,
    headers: {
      Authorization: `Bearer ${data.session?.access_token ?? ""}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

/** Settings: the owner's invite code, what it earned, and the bank transfer request. */
export function ReferralPanel() {
  const { t } = usePrefs();
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["referral"],
    queryFn: () => call("GET") as Promise<Summary>,
    retry: 1,
  });
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [payout, setPayout] = useState(false);
  const [holder, setHolder] = useState("");
  const [iban, setIban] = useState("");
  const [busy, setBusy] = useState(false);

  if (isError) {
    return (
      <section className="surface mt-4 flex flex-wrap items-center justify-between gap-3 p-5 text-sm">
        <span className="text-muted-foreground">{t("ref.error")}</span>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          {t("ref.retry")}
        </Button>
      </section>
    );
  }
  if (isLoading || !data) {
    return (
      <section className="surface mt-4 flex items-center gap-2 p-5 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> {t("ref.loading")}
      </section>
    );
  }
  const link = `${window.location.origin}/c/${data.code}`;

  async function copy() {
    await navigator.clipboard.writeText(link).catch(() => null);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }
  async function share() {
    const text = t("ref.shareText").replace("{link}", link);
    if (navigator.share) await navigator.share({ text }).catch(() => null);
    else await copy();
  }
  async function saveCode() {
    setBusy(true);
    const r = (await call("POST", { action: "code", code: newCode }).catch(() => ({}))) as { result?: string };
    setBusy(false);
    if (r.result === "ok") {
      toast.success(t("ref.code.saved"));
      setEditing(false);
      void qc.invalidateQueries({ queryKey: ["referral"] });
      return;
    }
    toast.error(
      t(
        r.result === "taken"
          ? "ref.code.taken"
          : r.result === "already_changed"
            ? "ref.code.once"
            : "ref.code.invalid",
      ),
    );
  }
  async function askPayout() {
    setBusy(true);
    const r = (await call("POST", { action: "payout", holder, iban }).catch(() => ({}))) as { result?: string };
    setBusy(false);
    if (r.result === "ok") {
      toast.success(t("ref.payout.sent"));
      setPayout(false);
      setIban("");
      void qc.invalidateQueries({ queryKey: ["referral"] });
      return;
    }
    toast.error(
      t(
        r.result === "iban"
          ? "ref.payout.iban"
          : r.result === "name"
            ? "ref.payout.name"
            : r.result === "open"
              ? "ref.payout.open"
              : r.result === "low"
                ? "ref.payout.low"
                : "acc.error",
      ),
    );
  }

  const stats = [
    { label: t("ref.stat.invited"), value: String(data.invited) },
    { label: t("ref.stat.paying"), value: String(data.paying) },
    { label: t("ref.stat.pending"), value: euros(data.pendingCents) },
    { label: t("ref.stat.balance"), value: euros(data.balanceCents), strong: true },
  ];

  return (
    <section className="surface mt-4 overflow-hidden">
      <div className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/12 text-brand-ink dark:bg-brand/25">
            <Gift className="size-5" />
          </span>
          <div>
            <h2 className="font-display text-lg font-bold leading-tight">{t("ref.title")}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("ref.body")}</p>
          </div>
        </div>

        {/* The code and the link. */}
        <div className="rounded-2xl border border-border bg-muted/40 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{t("ref.code")}</p>
          {editing ? (
            <div className="mt-2 flex gap-2">
              <Input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16))}
                aria-label={t("ref.code")}
                className="font-display font-bold tracking-wider"
                autoFocus
              />
              <Button onClick={() => void saveCode()} disabled={busy || newCode.length < 4}>
                {busy && <Loader2 className="animate-spin" />}
                {t("ref.code.save")}
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>
                {t("mfa.cancel")}
              </Button>
            </div>
          ) : (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-display text-2xl font-extrabold tracking-wider">{data.code}</span>
              {data.canChange && (
                <button
                  type="button"
                  onClick={() => {
                    setNewCode(data.code);
                    setEditing(true);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-bold text-brand-ink underline-offset-4 hover:underline"
                >
                  <Pencil className="size-3" /> {t("ref.code.change")}
                </button>
              )}
            </div>
          )}
          <p className="mt-2 truncate text-sm text-muted-foreground">{link}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void copy()}>
              {copied ? <Check /> : <Copy />} {copied ? t("ref.copied") : t("ref.copy")}
            </Button>
            <Button onClick={() => void share()}>
              <Share2 /> {t("ref.share")}
            </Button>
          </div>
        </div>

        {/* What it earned. */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl border border-border p-3">
              <p className={cn("font-display text-xl font-bold tabular-nums", s.strong && "text-brand-ink")}>{s.value}</p>
              <p className="text-xs font-semibold text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        {data.requestedCents > 0 ? (
          <p className="rounded-xl bg-muted px-4 py-3 text-sm font-semibold">
            {t("ref.payout.pending").replace("{amount}", euros(data.requestedCents))}
          </p>
        ) : payout ? (
          <div className="animate-enter grid gap-3 rounded-2xl border border-border p-4">
            <p className="text-sm font-bold">
              {t("ref.payout.title").replace("{amount}", euros(data.balanceCents))}
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="ref-holder">{t("ref.payout.holder")}</Label>
              <Input id="ref-holder" value={holder} onChange={(e) => setHolder(e.target.value)} autoComplete="name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ref-iban">IBAN</Label>
              <Input
                id="ref-iban"
                value={iban}
                onChange={(e) => setIban(e.target.value.toUpperCase())}
                placeholder="PT50 0000 0000 0000 0000 0000 0"
                className="tabular-nums"
                autoComplete="off"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => void askPayout()} disabled={busy || !holder || !iban}>
                {busy && <Loader2 className="animate-spin" />}
                {t("ref.payout.send")}
              </Button>
              <Button variant="ghost" onClick={() => setPayout(false)}>
                {t("mfa.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            disabled={data.balanceCents < MIN_PAYOUT_CENTS}
            onClick={() => setPayout(true)}
          >
            <Wallet /> {t("ref.payout.button")}
          </Button>
        )}

        <p className="text-xs leading-relaxed text-muted-foreground">{t("ref.rules")}</p>
      </div>
    </section>
  );
}
