import { createClient } from "@/lib/supabase/server";

export interface FullInboundSummary {
  rows: number;
  inbounds: number;
  skus: number;
  declared: number;
  processed: number;
  sellable: number;
  unsellable: number;
  difference: number;
  unidentified: number;
  withDifference: number;
  firstReceivedAt: string | null;
  lastReceivedAt: string | null;
}

export interface FullInboundRow {
  inboundId: string;
  receivedAt: string | null;
  skuRows: number;
  skus: number;
  declared: number;
  processed: number;
  sellable: number;
  unsellable: number;
  difference: number;
  unidentified: number;
  hasDifference: boolean;
  status: string | null;
}

export interface FullInboundSkuRow {
  sku: string | null;
  productName: string | null;
  declared: number;
  processed: number;
  difference: number;
  inboundCount: number;
  lastReceivedAt: string | null;
}

export interface FullInboundsDashboardData {
  summary: FullInboundSummary;
  inbounds: FullInboundRow[];
  topDifferences: FullInboundSkuRow[];
  topReceived: FullInboundSkuRow[];
}

export async function loadFullInboundsDashboard(): Promise<FullInboundsDashboardData | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_full_inbounds_dashboard_data");
  if (error) throw new Error(`Não foi possível carregar os envios FULL: ${error.message}`);
  if (!data || typeof data !== "object") return null;
  return data as FullInboundsDashboardData;
}
