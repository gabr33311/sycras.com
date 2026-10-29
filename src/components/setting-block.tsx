import type { ComponentType, ReactNode } from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A settings screen as short blocks, one open at a time. Closed, each block shows
 * its current state, so the screen fits without scrolling. Cards and titles of the
 * panels placed inside are flattened: the block already frames and names them.
 */
export function SettingBlocks({
  value,
  onValueChange,
  children,
}: {
  value: string;
  onValueChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <AccordionPrimitive.Root
      type="single"
      collapsible
      value={value}
      onValueChange={onValueChange}
      className="surface divide-y divide-border overflow-hidden p-0"
    >
      {children}
    </AccordionPrimitive.Root>
  );
}

/** One block: icon, name and current state; opens in place. */
export function SettingBlock({
  value,
  icon: Icon,
  title,
  summary,
  warn,
  dot,
  badge,
  flatten = false,
  children,
}: {
  value: string;
  icon: ComponentType<{ className?: string }>;
  title: string;
  summary: string;
  warn?: boolean;
  dot?: string;
  /** A small label beside the title (e.g. "Pro"). */
  badge?: ReactNode;
  /** Strip the frames and first titles of panels rendered inside. */
  flatten?: boolean;
  children: ReactNode;
}) {
  return (
    <AccordionPrimitive.Item value={value}>
      <AccordionPrimitive.Header className="flex">
        <AccordionPrimitive.Trigger className="group flex min-h-[4rem] flex-1 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 data-[state=open]:bg-muted/40">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground transition-colors duration-300 group-data-[state=open]:bg-brand group-data-[state=open]:text-brand-foreground">
            <Icon className="size-[18px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-[15px] font-bold leading-tight">
              {title}
              {badge}
            </span>
            <span
              className={cn(
                "mt-1 flex items-center gap-1.5 text-xs font-semibold",
                warn ? "text-st-pending-fg" : "text-muted-foreground",
              )}
            >
              {dot && (
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full ring-1 ring-black/10"
                  style={{ backgroundColor: dot }}
                />
              )}
              {warn && (
                <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-st-pending" />
              )}
              <span className="truncate">{summary}</span>
            </span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-out group-data-[state=open]:rotate-180" />
        </AccordionPrimitive.Trigger>
      </AccordionPrimitive.Header>
      <AccordionPrimitive.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
        <div
          className={cn(
            "px-4 pb-5 pt-2",
            flatten &&
              "[&_.surface]:rounded-none [&_.surface]:border-0 [&_.surface]:bg-transparent [&_.surface]:p-0 [&_.surface]:shadow-none [&_section>h2:first-child]:hidden",
          )}
        >
          {children}
        </div>
      </AccordionPrimitive.Content>
    </AccordionPrimitive.Item>
  );
}
