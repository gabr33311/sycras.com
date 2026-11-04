// Server-only: is this password in a known data breach? Uses Have I Been Pwned's free
// "range" API with k-anonymity: only the first 5 characters of the password's SHA-1 hash
// leave the server; the match against the rest is done here. Fails open (false) when the
// service cannot be reached, so nobody is ever blocked by an outage.
import { createHash } from "node:crypto";

export async function passwordBreached(password: string): Promise<boolean> {
  if (!password) return false;
  const hash = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": "SYCRAS-password-check" },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    const body = await res.text();
    return body.split("\n").some((line) => {
      const [rest, count] = line.trim().split(":");
      return rest === suffix && Number(count) > 0;
    });
  } catch {
    return false;
  }
}
