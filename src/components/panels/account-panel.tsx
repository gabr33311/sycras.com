import { useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Download, KeyRound, Loader2, Mail, PauseCircle, PlayCircle, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ConfirmAction } from "@/components/confirm-action";
import { useAuth } from "@/hooks/use-auth";
import { useMyBusiness } from "@/hooks/use-business";
import { useSubscription } from "@/hooks/use-subscription";
import { Captcha } from "@/components/captcha";
import { TwoStep } from "@/components/two-step";
import { usePrefs } from "@/lib/prefs";

/** Account: sign-in email, password, pause the business, delete everything. */
export function AccountPanel() {
  const { t } = usePrefs();
  const { user } = useAuth();
  const { business, role } = useMyBusiness();
  const { access } = useSubscription();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState<"email" | "password" | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [current, setCurrent] = useState("");
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmWord, setConfirmWord] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  /** A copy of everything, sent as a file to the account's email. */
  async function exportData() {
    setExporting(true);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/account/export", {
        method: "POST",
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      });
      const body = (await res.json()) as { ok: boolean; message?: string };
      if (body.ok) toast.success(t("acc.export.sent").replace("{email}", user?.email ?? ""));
      else toast.error(body.message ?? t("acc.error"));
    } catch {
      toast.error(t("acc.error"));
    } finally {
      setExporting(false);
    }
  }
  const canManage = role === "owner" || role === "manager";
  // Suspended, or an older page left unpublished: both are offline, and "Reactivate" brings them back.
  const suspended = !!business?.suspended_at || business?.is_published === false;

  async function changeEmail() {
    const email = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return void toast.error(t("acc.email.invalid"));
    if (email === user?.email?.toLowerCase()) return void toast.error(t("acc.email.same"));
    setBusy(true);
    const { error } = await supabase.auth.updateUser(
      { email },
      { emailRedirectTo: `${window.location.origin}/settings` },
    );
    setBusy(false);
    if (error) return void toast.error(error.message);
    toast.success(t("acc.email.sent"));
    setOpen(null);
    setNewEmail("");
  }

  async function changePassword() {
    if (next.length < 8) return void toast.error(t("acc.password.short"));
    if (!user?.email) return;
    setBusy(true);
    // The server checks the current password (an open laptop is not enough to take the
    // account) under the same lock as sign-in, so it cannot be guessed either.
    const { data: s } = await supabase.auth.getSession();
    const res = await fetch("/api/auth/password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${s.session?.access_token ?? ""}`,
      },
      body: JSON.stringify({ current, next, captchaToken: captcha }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => ({}))) as { code?: string; minutes?: number };
    setBusy(false);
    setCaptchaKey((k) => k + 1);
    if (body.code === "locked")
      return void toast.error(t("auth.err.locked").replace("{n}", String(body.minutes ?? 15)));
    if (body.code === "invalid") return void toast.error(t("acc.password.wrong"));
    if (body.code === "captcha") return void toast.error(t("auth.err.captcha"));
    if (body.code === "weak") return void toast.error(t("onb.auth.err.weakPassword"));
    if (body.code === "breached") return void toast.error(t("auth.err.breached"));
    if (body.code !== "ok") return void toast.error(t("acc.error"));
    toast.success(t("acc.password.changed"));
    setOpen(null);
    setCurrent("");
    setNext("");
  }

  async function setSuspended(on: boolean): Promise<boolean> {
    if (!business) return false;
    const { error } = await supabase
      .from("businesses")
      .update(
        on
          ? { suspended_at: new Date().toISOString() }
          : { suspended_at: null, is_published: true },
      )
      .eq("id", business.id);
    if (error) {
      toast.error(t("acc.error"));
      return false;
    }
    toast.success(on ? t("acc.suspended") : t("acc.reactivated"));
    void qc.invalidateQueries({ queryKey: ["my-business"] });
    return true;
  }

  async function deleteAccount() {
    setDeleting(true);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      });
      const body = (await res.json()) as { ok: boolean; message?: string };
      if (!body.ok) {
        toast.error(body.message ?? t("acc.error"));
        return;
      }
      toast.success(t("acc.delete.done"));
      qc.clear();
      await supabase.auth.signOut();
      void navigate({ to: "/", replace: true });
    } catch {
      toast.error(t("acc.error"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="surface mt-4 divide-y divide-border">
      <h2 className="px-5 pt-5 pb-3 text-base font-bold">{t("acc.title")}</h2>

      <div className="space-y-3 p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-bold">
              <Mail className="size-4 text-muted-foreground" /> {t("acc.email")}
            </p>
            <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen(open === "email" ? null : "email")}
          >
            {t("acc.email.change")}
          </Button>
        </div>
        {open === "email" && (
          <div className="animate-enter flex flex-col gap-2 sm:flex-row">
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder={t("acc.email.new")}
              aria-label={t("acc.email.new")}
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              maxLength={160}
            />
            <Button disabled={busy} onClick={() => void changeEmail()}>
              {busy && <Loader2 className="animate-spin" />}
              {t("acc.email.change")}
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-3 p-5">
        <div className="flex items-center justify-between gap-4">
          <p className="flex items-center gap-2 text-sm font-bold">
            <KeyRound className="size-4 text-muted-foreground" /> {t("acc.password")}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen(open === "password" ? null : "password")}
          >
            {t("acc.password.change")}
          </Button>
        </div>
        {open === "password" && (
          <div className="animate-enter grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Input
              type="password"
              autoComplete="current-password"
              placeholder={t("acc.password.current")}
              aria-label={t("acc.password.current")}
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
            <Input
              type="password"
              autoComplete="new-password"
              placeholder={t("acc.password.new")}
              aria-label={t("acc.password.new")}
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
            <Button disabled={busy || !current || !next} onClick={() => void changePassword()}>
              {busy && <Loader2 className="animate-spin" />}
              {t("acc.password.change")}
            </Button>
            <div className="sm:col-span-3">
              <Captcha onToken={setCaptcha} resetKey={captchaKey} />
            </div>
          </div>
        )}
      </div>

      <TwoStep />

      {canManage && business && (
        <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-bold">
              {suspended ? (
                <PlayCircle className="size-4 text-muted-foreground" />
              ) : (
                <PauseCircle className="size-4 text-muted-foreground" />
              )}
              {suspended ? t("acc.reactivate") : t("acc.suspend")}
            </p>
            <p className="text-sm text-muted-foreground">
              {suspended ? t("acc.suspended.banner") : t("acc.suspend.desc")}
            </p>
          </div>
          {suspended ? (
            <Button variant="outline" size="sm" onClick={() => void setSuspended(false)}>
              {t("acc.reactivate")}
            </Button>
          ) : (
            <ConfirmAction
              trigger={
                <Button variant="outline" size="sm">
                  {t("acc.suspend")}
                </Button>
              }
              title={t("acc.suspend")}
              description={
                access?.subscribed
                  ? `${t("acc.suspend.desc")} ${t("acc.suspend.paying")}`
                  : t("acc.suspend.desc")
              }
              confirmLabel={t("acc.suspend.confirm")}
              onConfirm={() => setSuspended(true)}
            />
          )}
        </div>
      )}

      <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold">
            <Download className="size-4 text-muted-foreground" /> {t("acc.export")}
          </p>
          <p className="text-sm text-muted-foreground">{t("acc.export.desc")}</p>
        </div>
        <Button variant="outline" size="sm" disabled={exporting} onClick={() => void exportData()}>
          {exporting && <Loader2 className="animate-spin" />}
          {t("acc.export.send")}
        </Button>
      </div>

      <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold text-destructive">
            <Trash2 className="size-4" /> {t("acc.delete")}
          </p>
          <p className="text-sm text-muted-foreground">{t("acc.delete.desc")}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => {
            setConfirmWord("");
            setDeleteOpen(true);
          }}
        >
          {t("acc.delete")}
        </Button>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={(o) => !deleting && setDeleteOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("acc.delete")}</AlertDialogTitle>
            <AlertDialogDescription>{t("acc.delete.desc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            autoFocus
            placeholder={t("acc.delete.type")}
            aria-label={t("acc.delete.type")}
            value={confirmWord}
            onChange={(e) => setConfirmWord(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("acts.dialog.keep")}</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleting || confirmWord.trim().toUpperCase() !== t("acc.delete.word")}
              onClick={() => void deleteAccount()}
            >
              {deleting && <Loader2 className="animate-spin" />}
              {t("acc.delete.confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
