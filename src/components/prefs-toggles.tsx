import { Check, Moon, Sun, Languages } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePrefs } from "@/lib/prefs";
import { LANGS } from "@/lib/prefs-types";
import { cn } from "@/lib/utils";

export function PrefsToggles({ className }: { className?: string }) {
  const { theme, toggleTheme, lang, setLang, t } = usePrefs();
  const current = LANGS.find((l) => l.code === lang) ?? LANGS[0]!;

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={theme === "dark" ? t("ui.prefs.lightMode") : t("ui.prefs.darkMode")}
        className="flex size-11 items-center justify-center rounded-xl text-muted-foreground sm:size-9 transition-colors hover:bg-muted hover:text-foreground"
      >
        {theme === "dark" ? (
          <Sun className="size-4" strokeWidth={2.5} />
        ) : (
          <Moon className="size-4" strokeWidth={2.5} />
        )}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`${t("ui.prefs.changeLang")} (${current.short})`}
            className="flex h-11 items-center sm:h-9 gap-1.5 rounded-xl px-2.5 text-xs font-bold uppercase text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Languages className="size-4" strokeWidth={2.5} />
            {current.short}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-52 p-1.5">
          {LANGS.map((l) => (
            <DropdownMenuItem
              key={l.code}
              lang={l.locale}
              onSelect={() => setLang(l.code)}
              className="justify-between py-2.5 font-bold"
            >
              {l.label}
              {l.code === lang && <Check className="size-4" strokeWidth={2.6} />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
