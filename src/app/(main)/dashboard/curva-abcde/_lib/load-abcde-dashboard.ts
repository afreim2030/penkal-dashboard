import { createClient } from "@/lib/supabase/server";

export type Curve = "A" | "B" | "C" | "D" | "E";

export interface AbcdeRow {
  sku: string | null; mlb: string | null; productName: string; currentCurve: Curve; previousCurve: Curve | null;
  movement: "caiu" | "subiu" | "manteve" | "novo"; currentVisits: number; currentSales: number; currentUnits: number;
  currentRevenue: number; currentConversion: number; previousVisits: number; previousSales: number; previousConversion: number;
}
export interface AbcdeDashboardData {
  currentMonth: string | null; previousMonth: string | null; hasPreviousMonth: boolean;
  summary: { products: number; dropped: number; improved: number; stable: number }; rows: AbcdeRow[];
}
export interface PeriodMetric { visits: number; sales: number; units: number; revenue: number; conversion: number; }
export interface ProductPeriodComparison {
  asOf: string | null; windowDays: number;
  rows: Array<{ sku: string | null; mlb: string | null; productName: string; periods: Record<string, PeriodMetric> }>;
}
export async function loadAbcdeDashboard(): Promise<AbcdeDashboardData | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_abc_curve_dashboard_data");
  if (error) throw new Error(`Não foi possível carregar a Curva ABCDE: ${error.message}`);
  return data && typeof data === "object" ? data as AbcdeDashboardData : null;
}
export async function loadProductPeriodComparison(windowDays: 7 | 30): Promise<ProductPeriodComparison | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_product_period_comparison", { p_window_days: windowDays });
  if (error) throw new Error(`Não foi possível carregar o comparativo: ${error.message}`);
  return data && typeof data === "object" ? data as ProductPeriodComparison : null;
}
