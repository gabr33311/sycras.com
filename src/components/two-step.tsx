import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { ConfirmAction } from "@/components/confirm-action";
import { usePrefs } from "@/lib/prefs";

type Setup = { factorId: string; qr: string; secret: string };

/**
 * Two-step verification (account row): after the password, a 6-digit code from an
 * authenticator app (Google Authenticator, Microsoft Authenticator, 1Password...).
 */
export function TwoStep() {
  const { t } = usePrefs();
  const [factorId, setFactorId] = useState<string | null | undefined>(undefined);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactorId(data?.totp.find((f) => f.status === "verified")?.id ?? null);
  }
  useEffect(() => {
    void load();
  }, []);

  async function start() {
    setBusy(true);
    // A setup left half-way would block a new one: clear it first.
    const { data: all } = await supabase.auth.mfa.listFactors();
    for (const f of all?.all ?? []) {
      if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `SYCRAS ${new Date().toISOString().slice(0, 10)}`,
    });
    setBusy(false);
    if (error || !data) return void toast.error(t("acc.error"));
    setSetup({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    setCode("");
  }

  async function confirm(value: string) {
    if (!setup || value.length !== 6) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: setup.factorId,
      code: value,
    });
    setBusy(false);
    if (error) {
      setCode("");
      return void toast.error(t("auth.mfa.wrong"));
    }
    toast.success(t("mfa.on"));
    setSetup(null);
    void load();
  }

  async function turnOff(): Promise<boolean> {
    if (!factorId) return false;
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) {
      toast.error(t("acc.error"));
      return false;
    }
    toast.success(t("mfa.off"));
    void load();
    return true;
  }

  return (
    <div className="flex flex-col gap-3 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold">
            <ShieldCheck className="size-4 text-muted-foreground" /> {t("mfa.title")}
          </p>
          <p className="text-sm text-muted-foreground">
            {factorId ? t("mfa.status.on") : t("mfa.desc")}
          </p>
        </div>
        {factorId === undefined ? null : factorId ? (
          <ConfirmAction
            trigger={<Button variant="outline">{t("mfa.turnOff")}</Button>}
            title={t("mfa.off.title")}
            description={t("mfa.off.desc")}
            confirmLabel={t("mfa.off.confirm")}
            onConfirm={turnOff}
          />
        ) : (
          !setup && (
            <Button variant="outline" disabled={busy} onClick={() => void start()}>
              {busy && <Loader2 className="animate-spin" />}
              {t("mfa.turnOn")}
            </Button>
          )
        )}
      </div>

      {setup && (
        <div className="animate-enter grid gap-4 rounded-2xl bg-muted/50 p-4 sm:grid-cols-[auto_1fr] sm:items-center">
          <img
            src={setup.qr}
            alt={t("mfa.qrAlt")}
            className="mx-auto size-40 rounded-xl bg-white p-2"
          />
          <div className="space-y-3 text-sm">
            <p>{t("mfa.step1")}</p>
            <p className="text-muted-foreground">
              {t("mfa.manual")}{" "}
              <code className="select-all break-all rounded bg-card px-1.5 py-0.5 font-mono text-xs font-bold text-foreground">
                {setup.secret}
              </code>
            </p>
            <p>{t("mfa.step2")}</p>
            <InputOTP
              maxLength={6}
              value={code}
              onChange={(v) => setCode(v.replace(/\D/g, ""))}
              onComplete={(v) => void confirm(v)}
              inputMode="numeric"
              disabled={busy}
            >
              <InputOTPGroup className="gap-1.5">
                {Array.from({ length: 6 }).map((_, i) => (
                  <InputOTPSlot
                    key={i}
                    index={i}
                    className="size-10 rounded-lg border bg-card text-lg font-bold shadow-none first:rounded-l-lg last:rounded-r-lg"
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
            <Button variant="ghost" size="sm" onClick={() => setSetup(null)}>
              {t("mfa.cancel")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
