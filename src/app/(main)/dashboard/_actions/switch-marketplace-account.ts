"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export async function switchMarketplaceAccount(accountId: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();

  if (!auth.user) redirect("/auth/v1/login");

  const { error } = await supabase.rpc("set_active_marketplace_account", {
    p_account_id: accountId,
  });

  if (error) redirect(`/dashboard/default?account-error=${encodeURIComponent(error.message)}`);

  redirect("/dashboard/default");
}
