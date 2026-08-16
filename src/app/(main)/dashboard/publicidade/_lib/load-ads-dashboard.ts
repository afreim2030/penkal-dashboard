import { createClient } from "@/lib/supabase/server";

export interface AdsRankRow {
  campaignName?: string;
  mlb?: string | null;
  title?: string;
  investment: number;
  revenue: number;
  impressions: number;
  clicks: number;
  sales: number;
  ctr?: number;
  cpc?: number;
  acos: number | null;
  roas: number | null;
}

export interface AdsDashboardData {
  period: { start: string; end: string } | null;
  summary: {
    investment: number;
    revenue: number;
    impressions: number;
    clicks: number;
    sales: number;
    directSales: number;
    indirectSales: number;
    campaigns: number;
    rows: number;
    ctr: number;
    cpc: number;
    acos: number | null;
    roas: number | null;
  };
  campaigns: AdsRankRow[];
  listings: AdsRankRow[];
}

export async function loadAdsDashboard(): Promise<AdsDashboardData | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_ads_dashboard_data");
  if (error) throw new Error(`Não foi possível carregar Publicidade: ${error.message}`);
  if (!data || typeof data !== "object") return null;
  return data as AdsDashboardData;
}
