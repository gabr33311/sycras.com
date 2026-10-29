import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BellRing, Clock, Star, UserCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/hooks/use-business";
import { useHasPro } from "@/hooks/use-subscription";
import { usePrefs } from "@/lib/prefs";
import { SettingBlock, SettingBlocks } from "@/components/setting-block";
import { ApprovalSetting, BookingRules } from "@/components/panels/availability-panel";
import { RemindersPanel, ReviewLink } from "@/components/panels/reminders-panel";

/**
 * How a booking goes, from the request to the day after: approval, limits,
 * the reminder and the review request. One short block each, one open at a time.
 */
export function RulesPanel() {
  const { business } = useMyBusiness();
  const { t } = usePrefs();
  const hasPro = useHasPro();
  const [open, setOpen] = useState("");

  const { data: manual } = useQuery({
    queryKey: ["services", business?.id, "approval"],
    enabled: !!business,
    queryFn: async () => {
      const { data } = await supabase
        .from("services")
        .select("requires_confirmation, is_active")
        .eq("business_id", business!.id);
      return (data ?? []).some((s) => s.is_active && s.requires_confirmation);
    },
  });

  if (!business) return null;

  const pro = (
    <span className="rounded-full border border-subscription-accent px-1.5 py-px text-[10px] font-bold uppercase">
      Pro
    </span>
  );
  const months = business.booking_horizon_months ?? 2;

  return (
    <SettingBlocks value={open} onValueChange={setOpen}>
      <SettingBlock
        value="approval"
        icon={UserCheck}
        title={t("rl.approval")}
        summary={manual === undefined ? "" : manual ? t("mg.rules.manual") : t("mg.rules.auto")}
        flatten
      >
        <ApprovalSetting />
      </SettingBlock>

      <SettingBlock
        value="limits"
        icon={Clock}
        title={t("pf.av.limits")}
        summary={[
          t("mg.rules.cancel").replace("{h}", String(business.cancellation_hours)),
          t(months === 1 ? "rl.horizon.one" : "rl.horizon.many").replace("{n}", String(months)),
        ].join(" · ")}
        flatten
      >
        <BookingRules />
      </SettingBlock>

      <SettingBlock
        value="reminders"
        icon={BellRing}
        title={t("pf.s.reminders")}
        badge={hasPro === false ? pro : undefined}
        summary={
          business.reminders_enabled
            ? t("mg.remindersOn").replace("{h}", String(business.reminder_hours ?? 24))
            : t("mg.remindersOff")
        }
        flatten
      >
        <RemindersPanel withReview={false} />
      </SettingBlock>

      <SettingBlock
        value="review"
        icon={Star}
        title={t("rl.review")}
        badge={hasPro === false ? pro : undefined}
        summary={business.review_url ? t("rl.review.on") : t("rl.review.off")}
        flatten
      >
        <ReviewLink />
      </SettingBlock>
    </SettingBlocks>
  );
}
