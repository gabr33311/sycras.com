import { createFileRoute, redirect } from "@tanstack/react-router";

// Days off now live with the weekly hours in Manage (old links land there).
export const Route = createFileRoute("/_authenticated/time-off")({
  beforeLoad: () => {
    throw redirect({ to: "/profile", search: { section: "hours" } });
  },
  component: () => null,
});
