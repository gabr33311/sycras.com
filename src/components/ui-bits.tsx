import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { statusLabel } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { usePrefs } from "@/lib/prefs";
import { AlertCircle } from "lucide-react";

/** Pinned top area: stays fixed while the rest of the page scrolls underneath. */
export function StickyTop({ children }: { children: ReactNode }) {
  return (
    <div className="sticky top-[var(--sat)] z-30 -mx-4 -mt-6 mb-3 bg-background/95 px-4 pb-2 pt-5 backdrop-blur-xl sm:-mx-5 sm:px-5">
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  action,
  leading,
  meta,
  inline = false,
}: {
  title: string;
  subtitle?: string;
  /** Small text on the title's line (e.g. today's date), so it takes no extra row. */
  meta?: ReactNode;
  action?: ReactNode;
  /** Shown before the title, e.g. a back button. */
  leading?: ReactNode;
  /** When true, renders without its own pinned wrapper (use inside StickyTop). */
  inline?: boolean;
}) {
  const row = (
    <div
      className={
        inline
          ? "mb-3 flex items-center justify-between gap-3"
          : "flex items-center justify-between gap-3"
      }
    >
      {leading && <div className="-ml-2 shrink-0">{leading}</div>}
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <h1 className="truncate font-display text-[24px] font-bold leading-tight tracking-tight sm:text-[28px]">
          {title}
        </h1>
        {meta && (
          <span className="shrink-0 truncate text-xs font-semibold text-muted-foreground first-letter:uppercase sm:text-sm">
            {meta}
          </span>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
  if (inline) return row;
  return <StickyTop>{row}</StickyTop>;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="surface animate-enter flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && (
        <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-accent text-primary">
          {icon}
        </div>
      )}
      <p className="font-display text-base font-bold">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm font-normal leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-st-pending/15 text-st-pending-fg ring-st-pending/35",
  confirmed: "bg-st-confirmed/12 text-st-confirmed-fg ring-st-confirmed/30",
  completed: "bg-st-completed/12 text-st-completed-fg ring-st-completed/30",
  cancelled: "bg-muted text-st-cancelled-fg ring-border",
  no_show: "bg-st-noshow/12 text-st-noshow-fg ring-st-noshow/30",
  expired: "bg-muted text-muted-foreground ring-border",
};

export function StatusBadge({ status }: { status: string }) {
  const { lang } = usePrefs();
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ring-inset",
        STATUS_STYLES[status] ?? "bg-muted text-muted-foreground ring-border",
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {statusLabel(status, lang)}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  to,
  search,
  icon,
  dimmed = false,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  to?: string;
  search?: Record<string, unknown>;
  icon?: ReactNode;
  /** Secondary/quieter styling for empty (zero) values. */
  dimmed?: boolean;
}) {
  const inner = (
    <>
      <div className="flex items-center gap-2">
        {icon && (
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-xl",
              dimmed ? "bg-muted text-muted-foreground" : "bg-accent text-primary",
            )}
          >
            {icon}
          </span>
        )}
        <p className="min-w-0 flex-1 whitespace-normal break-words text-[11px] font-bold uppercase leading-tight tracking-[0.05em] text-muted-foreground">
          {label}
        </p>
      </div>
      <p
        className={cn(
          "font-display mt-3 break-words text-[clamp(20px,6.5vw,30px)] font-bold leading-none tabular-nums tracking-tight",
          dimmed && "text-muted-foreground/60",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1.5 text-xs font-normal text-muted-foreground">{hint}</p>}
    </>
  );
  const base = cn("surface min-w-0 p-4 sm:p-5", dimmed && "bg-muted/40 shadow-none");
  if (to) {
    return (
      <Link
        to={to as never}
        search={search as never}
        className={cn(
          base,
          "block transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift active:scale-[0.985]",
        )}
      >
        {inner}
      </Link>
    );
  }
  return <div className={base}>{inner}</div>;
}

export function LoadingRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="animate-stagger space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  );
}

/**
 * Inline form/action error. The palette is greyscale, so colour alone can't
 * flag an error: an icon and a framed box make it unmistakable.
 */
export function FormError({
  message,
  className,
}: {
  message?: string | null | undefined;
  className?: string | undefined;
}) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className={cn(
        "animate-enter flex items-start gap-2 rounded-xl border border-foreground/25 bg-muted px-3 py-2.5 text-sm font-semibold text-foreground",
        className,
      )}
    >
      <AlertCircle className="mt-px size-4 shrink-0" strokeWidth={2.6} />
      <span className="min-w-0">{message}</span>
    </p>
  );
}

/** Small error under a single field. */
export function FieldError({
  message,
  id,
}: {
  message?: string | null | undefined;
  id?: string | undefined;
}) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="flex items-center gap-1.5 text-xs font-bold text-foreground">
      <AlertCircle className="size-3.5 shrink-0" strokeWidth={2.8} />
      {message}
    </p>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { t } = usePrefs();
  return (
    <div className="surface animate-enter p-6 text-center">
      <p className="text-sm font-bold">{t("ui.error.title")}</p>
      <p className="mt-1 text-sm text-muted-foreground">{message ?? t("ui.error.default")}</p>
      {onRetry && (
        <Button onClick={onRetry} className="mt-4">
          {t("ui.error.retry")}
        </Button>
      )}
    </div>
  );
}
