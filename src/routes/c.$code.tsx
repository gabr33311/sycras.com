import { createFileRoute, redirect } from "@tanstack/react-router";
import { setInvite } from "@/lib/invite";

/**
 * An invite link (sycras.com/c/CODE): remembers the code and opens sign-up. The code gives
 * 15 more free days once the new business is created.
 */
export const Route = createFileRoute("/c/$code")({
  ssr: false,
  beforeLoad: ({ params }) => {
    setInvite(params.code);
    throw redirect({ to: "/auth", search: { mode: "register", next: undefined } });
  },
});
