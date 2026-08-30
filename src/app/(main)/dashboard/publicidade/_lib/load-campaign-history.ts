import { createClient } from "@/lib/supabase/server";

export interface CampaignHistoryRow {
  campaignName: string;
  investment: number;
  revenue: number;
  clicks: number;
  sales: number;
  roas: number | null;
  acos: number | null;
  conversion: number | null;
  status: string;
  lastChangedAt: string | null;
  daysWithoutChange: number;
  lastChangeType: string | null;
  lastNotes: string | null;
}

export interface CampaignChangeRow {
  id: string;
  campaignName: string;
  changedAt: string;
  changeType: string;
  status: string | null;
  notes: string | null;
  investment: number;
  revenue: number;
  roas: number | null;
  acos: number | null;
  clicks: number;
  sales: number;
  conversion: number | null;
}

export interface CampaignHistoryData {
  period: { start: string; end: string } | null;
  campaigns: CampaignHistoryRow[];
  history: CampaignChangeRow[];
}

export async function loadCampaignHistory(): Promise<CampaignHistoryData> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_campaign_history_data");
  if (error) throw new Error(`Não foi possível carregar o histórico das campanhas: ${error.message}`);
  return (data ?? { period: null, campaigns: [], history: [] }) as CampaignHistoryData;
}
