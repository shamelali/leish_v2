"use server";

import { createServiceRoleClient } from "@/lib/supabase/server";

export async function toggleProviderStatus(providerId: string, isActive: boolean) {
  const supabase = createServiceRoleClient();

  const { error } = await supabase
    .from("providers")
    .update({ is_active: isActive })
    .eq("id", providerId);

  if (error) throw new Error(`[toggleProviderStatus] ${error.message}`);
}
