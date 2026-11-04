import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMyBusiness } from "@/hooks/use-business";
import { computeAccess, type Access, type SubscriptionRow } from "@/lib/subscription";

/** The current business's plan access (trial / active / past due / blocked). */
export function useSubscription(): { access: Access | null; isLoading: boolean } {
  const { business } = useMyBusiness();
  const { data, isLoading } = useQuery({
    queryKey: ["subscription", business?.id],
    enabled: !!business,
    // Re-check now and then: a trial can end while the app is open.
    refetchInterval: 10 * 60_000,
    queryFn: async () => {
      const { data: row, error } = await supabase
        .from("subscriptions")
        // "*" so it keeps working whether or not the store columns exist yet.
        .select("*")
        .eq("business_id", business!.id)
        .maybeSingle();
      if (error) throw error;
      return (row ?? null) as SubscriptionRow;
    },
  });
  if (!business || data === undefined) return { access: null, isLoading };
  return { access: computeAccess(business.created_at, data, new Date(), business.trial_bonus_days ?? 0), isLoading };
}

/** True when the Pro-only extras are unlocked (paying; the free trial does not count). */
export function useHasPro(): boolean | null {
  const { access } = useSubscription();
  return access ? access.pro : null;
}
