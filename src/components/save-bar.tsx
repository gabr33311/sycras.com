import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { usePrefs } from "@/lib/prefs";

/**
 * "Unsaved changes" bar shown whenever an inline form is dirty: always at the bottom of the
 * screen (above the dock on phones; centred in the content next to the rail on computers).
 */
export function SaveBar({
  dirty,
  busy,
  onSave,
  onCancel,
}: {
  dirty: boolean;
  busy?: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { t } = usePrefs();
  if (!dirty) return null;
  return (
    <>
      {/* Room at the end of the form, so the bar never covers the last field. */}
      <div aria-hidden className="h-20" />
      <div className="animate-enter fixed inset-x-0 bottom-[calc(5.75rem+var(--sab))] z-40 mx-auto flex w-[calc(100%-2rem)] max-w-xl flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-card p-3 shadow-lift lg:bottom-6 lg:left-[104px]">
        <p className="min-w-0 flex-1 text-[13px] font-bold">{t("ui.save.unsaved")}</p>

        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          {t("ui.save.cancel")}
        </Button>
        <Button size="sm" onClick={onSave} disabled={busy}>
          {busy && <Loader2 className="mr-2 size-4 animate-spin" />} {t("ui.save.save")}
        </Button>
      </div>
    </>
  );
}
