import { createClient } from "@/lib/supabase/server";

export type Curve = "A" | "B" | "C" | "D" | "E";

export interface AbcdeRow {
  sku: string | null;
  mlb: string | null;
  productName: string;
  currentCurve: Curve;
  previousCurve: Curve | null;
  movement: "caiu" | "subiu" | "manteve" | "novo";
  currentVisits: number;
  currentSales: number;
  currentUnits: number;
  currentRevenue: number;
  currentConversion: number;
  previousVisits: number;
  previousSales: number;
  previousConversion: number;
}

export interface AbcdeDashboardData {
  currentMonth: string | null;
  previousMonth: string | null;
  hasPreviousMonth: boolean;
  summary: { products: number; dropped: number; improved: number; stable: number };
  rows: AbcdeRow[];
}

export async function loadAbcdeDashboard(): Promise<AbcdeDashboardData | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_abc_curve_dashboard_data");
  if (error) throw new Error(`Não foi possível carregar a Curva ABCDE: ${error.message}`);
  if (!data || typeof data !== "object") return null;
  return data as AbcdeDashboardData;
}
