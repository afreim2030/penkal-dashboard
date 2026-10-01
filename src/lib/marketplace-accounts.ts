import { createClient } from "@/lib/supabase/server";

export type MarketplaceAccount = { id: string; name: string; mercadoLivreNickname: string | null };

export async function getMarketplaceAccounts(): Promise<{ accounts: MarketplaceAccount[]; activeAccountId: string | null }> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { accounts: [], activeAccountId: null };

  const [{ data: accounts }, { data: activeAccountId }] = await Promise.all([
    supabase
      .from("marketplace_accounts")
      .select("id, name, mercado_livre_nickname")
      .eq("owner_user_id", auth.user.id)
      .order("created_at"),
    supabase.rpc("get_active_marketplace_account_id"),
  ]);

  return {
    accounts: (accounts ?? []).map((account) => ({
      id: account.id,
      name: account.name,
      mercadoLivreNickname: account.mercado_livre_nickname,
    })),
    activeAccountId: activeAccountId ?? null,
  };
}
