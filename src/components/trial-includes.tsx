import { Check, Crown } from "lucide-react";

import { usePrefs } from "@/lib/prefs";
import { cn } from "@/lib/utils";

/** What the free trial has, and what only the paid Pro has (the same list as the Terms, § 4). */
const IN_TRIAL = [
  "tr.in.page",
  "tr.in.calendar",
  "tr.in.clients",
  "tr.in.team",
  "tr.in.manual",
] as const;
const PRO_ONLY = [
  "tr.pro.reminders",
  "tr.pro.deposit",
  "tr.pro.reviews",
  "tr.pro.block",
  "tr.pro.stats",
] as const;

/**
 * Said plainly before anyone signs up, so the "14 days free" never promises more than it gives:
 * a short list of what is in the trial, and what is only in the paid plan.
 */
export function TrialIncludes({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const { t } = usePrefs();
  return (
    <div className={cn("grid gap-4 text-left", !compact && "sm:grid-cols-2", className)}>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          {t("tr.in.title")}
        </p>
        <ul className="mt-2 space-y-1.5">
          {IN_TRIAL.map((k) => (
            <li key={k} className="flex items-start gap-2 text-sm font-medium">
              <Check
                className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-hidden
              />
              {t(k)}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          {t("tr.pro.title")}
        </p>
        <ul className="mt-2 space-y-1.5">
          {PRO_ONLY.map((k) => (
            <li
              key={k}
              className="flex items-start gap-2 text-sm font-medium text-muted-foreground"
            >
              <Crown className="mt-0.5 size-4 shrink-0 text-brand-ink" aria-hidden />
              {t(k)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
