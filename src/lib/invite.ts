import { supabase } from "@/integrations/supabase/client";

/** The invite code someone arrived with (sycras.com/c/CODE or typed at sign-up), kept until used. */
const KEY = "sycras-invite";

export function getInvite(): string {
  try {
    return window.localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function setInvite(code: string) {
  try {
    const clean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
    if (clean) window.localStorage.setItem(KEY, clean);
    else window.localStorage.removeItem(KEY);
  } catch {
    // Private mode: the code just isn't remembered.
  }
}

/** Right after the business is created: +15 free days when the code is valid. True if applied. */
export async function applyInvite(): Promise<boolean> {
  const code = getInvite();
  if (!code) return false;
  const { data } = await supabase.auth.getSession();
  const res = await fetch("/api/referral", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session?.access_token ?? ""}`,
    },
    body: JSON.stringify({ action: "apply", code }),
  }).catch(() => null);
  const body = (await res?.json().catch(() => null)) as { result?: string } | null;
  // Used (or not valid): forget it either way.
  setInvite("");
  return body?.result === "ok";
}
