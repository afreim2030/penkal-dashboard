import { createClient } from "@/lib/supabase/server";

export type Curve = "A" | "B" | "C" | "D" | "E" | "Sem vendas";

export interface AbcdeRow {
  sku: string | null; mlb: string | null; productName: string; currentCurve: Curve; previousCurve: Curve | null;
  movement: "caiu" | "subiu" | "manteve" | "novo"; currentVisits: number; currentSales: number; currentUnits: number;
  currentRevenue: number; currentConversion: number; previousVisits: number; previousSales: number; previousConversion: number;
}
export interface AbcdeDashboardData {
  currentMonth: string | null; previousMonth: string | null; hasPreviousMonth: boolean; period?: { start: string; end: string; previousStart: string; previousEnd: string };
  summary: { products: number; dropped: number; improved: number; stable: number }; rows: AbcdeRow[];
}
export interface PeriodMetric { visits: number; sales: number; units: number; revenue: number; conversion: number; curve: Curve; }
export interface ProductPeriodComparison {
  asOf: string | null; windowDays: number;
  rows: Array<{ sku: string | null; mlb: string | null; productName: string; periods: Record<string, PeriodMetric> }>;
}
export async function loadAbcdeDashboard(start?: string, end?: string): Promise<AbcdeDashboardData | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_abc_curve_dashboard_data", { p_start: start ?? null, p_end: end ?? null });
  if (error) throw new Error(`Não foi possível carregar a Curva ABCDE: ${error.message}`);
  if (!data || typeof data !== "object") return null;\n  const dashboard = data as AbcdeDashboardData;\n  // Proteção adicional: item sem faturamento nunca entra em uma curva ABCDE.\n  dashboard.rows = dashboard.rows.map((row) => Number(row.currentRevenue) <= 0 ? { ...row, currentCurve: "Sem vendas" } : row);\n  return dashboard;
}
export async function loadProductPeriodComparison(windowDays: 7 | 30): Promise<ProductPeriodComparison | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_product_period_comparison", { p_window_days: windowDays });
  if (error) throw new Error(`Não foi possível carregar o comparativo: ${error.message}`);
  return data && typeof data === "object" ? data as ProductPeriodComparison : null;
}
