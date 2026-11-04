/** Asks the server whether a new password appeared in a data breach (false when unsure). */
export async function isBreachedPassword(password: string): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/password-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    return ((await res.json()) as { breached?: boolean }).breached === true;
  } catch {
    return false;
  }
}
