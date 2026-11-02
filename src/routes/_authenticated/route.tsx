import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { needsSecondStep } from "@/lib/password-login";
import { AppSheetsProvider } from "@/components/app-sheets";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user)
      throw redirect({ to: "/auth", search: { mode: undefined, next: undefined } });
    // Two-step verification on, but this session has not given the code yet.
    if (await needsSecondStep())
      throw redirect({ to: "/auth", search: { mode: undefined, next: undefined } });
    return { user: data.user };
  },
  // Appointment and client sheets can be opened from any signed-in page.
  component: () => (
    <AppSheetsProvider>
      <Outlet />
    </AppSheetsProvider>
  ),
});
