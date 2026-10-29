import { createFileRoute } from "@tanstack/react-router";
import { SubPage } from "@/components/sub-page";
import { SettingsPanel, SignOutButton } from "@/components/panels/settings-panel";
import { AccountPanel } from "@/components/panels/account-panel";
import { usePrefs } from "@/lib/prefs";

// How the app looks and the account, opened from the gear on Manage. The plan lives on Manage.
export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Definições — SYCRAS" },
      { name: "description", content: "Cor da app, tema, idioma, notificações e conta." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { t } = usePrefs();
  return (
    <SubPage title={t("pf.s.settings")} back="/profile">
      <SettingsPanel />
      <AccountPanel />
      <SignOutButton />
    </SubPage>
  );
}
