import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { Bell, LogOut } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { sendTestPush } from "@/lib/push.functions";
import { ColorSwatches } from "@/components/color-swatches";
import { useAppColor } from "@/hooks/use-app-color";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { useMyBusiness } from "@/hooks/use-business";
import { usePrefs } from "@/lib/prefs";
import { isLang, LANGS } from "@/lib/prefs-types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function SettingsPanel() {
  const { business } = useMyBusiness();
  const { theme, setTheme, lang, setLang, t } = usePrefs();
  const { color: appColor, setColor: setAppColor } = useAppColor();
  const [testingPush, setTestingPush] = useState(false);
  const sendPush = useServerFn(sendTestPush);
  // Email for each booking event (saved in the account; the server reads it). On unless turned off.
  const [emailAlerts, setEmailAlerts] = useState(true);
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      setEmailAlerts(data.user?.user_metadata?.["email_alerts"] !== false);
    });
  }, []);
  async function toggleEmailAlerts(value: boolean) {
    setEmailAlerts(value);
    const { error } = await supabase.auth.updateUser({ data: { email_alerts: value } });
    if (error) {
      setEmailAlerts(!value);
      toast.error(t("pf.common.saveError"));
      return;
    }
    toast.success(t("ui.save.auto"));
  }
  async function testPush() {
    if (!business) return;
    setTestingPush(true);
    try {
      const { sent } = await sendPush({ data: { businessId: business.id } });
      if (sent > 0) toast.success(t("push.test.sent"));
      else if (sent < 0) toast.error(t("push.test.notConfigured"));
      else toast.error(t("push.test.noPhone"));
    } catch {
      toast.error(t("push.test.failed"));
    } finally {
      setTestingPush(false);
    }
  }
  return (
    <section className="surface divide-y divide-border overflow-hidden">
      <h2 className="px-5 pt-5 pb-3 text-base font-bold">{t("pf.set.group.app")}</h2>
      {/* Personal: how the app looks to you. Clients see the page colour instead. */}
      <div className="space-y-3 p-5">
        <div>
          <p className="text-sm font-bold">{t("prefs.appColor")}</p>
          <p className="text-sm text-muted-foreground">{t("prefs.appColor.desc")}</p>
        </div>
        <ColorSwatches
          mono={t("prefs.appColor.mono")}
          value={appColor}
          onChange={(c) =>
            void setAppColor(c).then((ok) => !ok && toast.error(t("pf.common.saveError")))
          }
          label={t("prefs.appColor")}
        />
      </div>
      <Row
        title={t("prefs.theme")}
        description={t("prefs.theme.desc")}
        checked={theme === "dark"}
        disabled={false}
        onChange={(v) => setTheme(v ? "dark" : "light")}
      />
      <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <p className="text-sm font-bold">{t("prefs.lang")}</p>
          <p className="text-sm text-muted-foreground">{t("prefs.lang.desc")}</p>
        </div>
        <Select value={lang} onValueChange={(v) => isLang(v) && setLang(v)}>
          <SelectTrigger aria-label={t("prefs.lang")} className="w-full shrink-0 font-bold sm:w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {LANGS.map((l) => (
              <SelectItem key={l.code} value={l.code} lang={l.locale} className="font-bold">
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {/* Push notifications on this phone (native app). */}
      <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <p className="text-sm font-bold">{t("push.title")}</p>
          <p className="text-sm text-muted-foreground">{t("push.desc")}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          disabled={testingPush || !business}
          onClick={() => void testPush()}
        >
          <Bell /> {t("push.test")}
        </Button>
      </div>
      <Row
        title={t("alerts.email.title")}
        description={t("alerts.email.desc")}
        checked={emailAlerts}
        disabled={false}
        onChange={(v) => void toggleEmailAlerts(v)}
      />
    </section>
  );
}

/** Leaving the account, at the very end of Settings. */
export function SignOutButton() {
  const { t } = usePrefs();
  const qc = useQueryClient();
  const navigate = useNavigate();
  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", search: { mode: undefined, next: undefined }, replace: true });
  }
  return (
    <button
      type="button"
      onClick={() => void signOut()}
      className="surface mt-4 flex w-full items-center gap-3 p-5 text-left text-sm font-bold text-destructive hover:bg-muted"
    >
      <LogOut className="size-4" /> {t("nav.logout")}
    </button>
  );
}

function Row({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-5">
      <div>
        <p className="text-sm font-bold">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={title} />
    </div>
  );
}
