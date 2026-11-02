import { supabase } from "@/integrations/supabase/client";

/** What a sign-in attempt gave: "ok" means signed in (two-step code may still follow). */
export type LoginResult =
  | { code: "ok" }
  | { code: "invalid"; left: number }
  | { code: "locked"; minutes: number }
  | { code: "unconfirmed" | "captcha" | "rate_limit" | "error" };

/**
 * Signs in through /api/auth/login, which locks an email after 5 wrong passwords
 * (15 minutes) and checks the captcha, then keeps the session in this browser.
 */
export async function passwordLogin(
  email: string,
  password: string,
  captchaToken: string | null,
): Promise<LoginResult> {
  let res: Response;
  try {
    res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password, captchaToken }),
    });
  } catch {
    return { code: "error" };
  }
  const body = (await res.json().catch(() => ({}))) as {
    code?: string;
    left?: number;
    minutes?: number;
    access_token?: string;
    refresh_token?: string;
  };
  if (res.ok && body.access_token && body.refresh_token) {
    const { error } = await supabase.auth.setSession({
      access_token: body.access_token,
      refresh_token: body.refresh_token,
    });
    return error ? { code: "error" } : { code: "ok" };
  }
  if (body.code === "invalid") return { code: "invalid", left: body.left ?? 0 };
  if (body.code === "locked") return { code: "locked", minutes: body.minutes ?? 15 };
  if (body.code === "unconfirmed" || body.code === "captcha" || body.code === "rate_limit") {
    return { code: body.code };
  }
  return { code: "error" };
}

/** True when this account has a two-step code and the session has not passed it yet. */
export async function needsSecondStep(): Promise<boolean> {
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return data?.nextLevel === "aal2" && data.currentLevel !== "aal2";
}
