import { createClient } from "@/lib/supabase/server";

export interface PerformanceRow {
  sku: string | null; productName: string | null; mlb: string | null;
  visits: number; sales: number; units: number; conversion: number; grossSales: number;
}
export interface PerformancePeriod {
  start: string; end: string; visits: number; sales: number; units: number;
  grossSales: number; conversion: number;
}
export interface PerformanceDashboardData {
  coverage: { minDate: string | null; maxDate: string | null };
  latestDay: { date: string | null; sales: number | null; units: number | null; visits: number | null; listings: number | null; conversion: number; grossSales: number | null };
  previousDay: { date: string | null; sales: number | null; units: number | null; visits: number | null; listings: number | null; conversion: number; grossSales: number | null };
  periods: { last7: PerformancePeriod | null; previous7: PerformancePeriod | null };
  topVisits: PerformanceRow[]; lowConversion: PerformanceRow[]; visitsWithoutSales: PerformanceRow[];
}
export async function loadPerformanceDashboard(): Promise<PerformanceDashboardData | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_performance_dashboard_data");
  if (error) throw new Error(`Não foi possível carregar a performance: ${error.message}`);
  if (!data || typeof data !== "object") return null;
  return data as PerformanceDashboardData;
}
