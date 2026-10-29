import { useNavigate } from "@tanstack/react-router";
import { usePrefs } from "@/lib/prefs";
import { cn } from "@/lib/utils";

type View = "day" | "week" | "list";

/**
 * How to look at the bookings: one day, the week (wide screens) or the full list.
 * The list is its own page; the switch is the same on both, so it reads as one place.
 */
export function CalendarViewSwitch({
  value,
  withWeek,
  onChange,
}: {
  value: View;
  withWeek: boolean;
  /** Day/week on the calendar itself; without it, they go back to the calendar. */
  onChange?: (v: "day" | "week") => void;
}) {
  const { t } = usePrefs();
  const navigate = useNavigate();
  const views: View[] = withWeek ? ["day", "week", "list"] : ["day", "list"];
  const label = (v: View) =>
    t(v === "day" ? "cal.view.day" : v === "week" ? "cal.view.week" : "cal.view.list");

  function pick(v: View) {
    if (v === value) return;
    if (v === "list") return void navigate({ to: "/appointments" });
    if (onChange) onChange(v);
    else void navigate({ to: "/calendar" });
  }

  return (
    <div
      role="group"
      aria-label={t("cal.view")}
      className="flex shrink-0 items-center rounded-full bg-muted p-1"
    >
      {views.map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => pick(v)}
          className={cn(
            "h-8 rounded-full px-3.5 text-[13px] font-bold transition-all duration-200 lg:h-9 lg:px-4",
            value === v
              ? "bg-card text-foreground shadow-soft"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label(v)}
        </button>
      ))}
    </div>
  );
}
