import { createClient } from "@/lib/supabase/server";

export interface ProductDashboardRow {
  sku: string;
  name: string;
  category: string | null;
  status: string;
  listingCount: number;
  activeListings: number;
  fullStock: number;
  stockTimeAffected: number;
  unitsPeriod: number;
  revenuePeriod: number;
  unitsCurrent7: number | null;
  unitsPrevious7: number | null;
  trend7: number | null;
  lastSaleDate: string | null;
  daysSinceSale: number | null;
  visits7: number | null;
  performanceSales7: number | null;
  conversion7: number | null;
}

export interface ProductsDashboardData {
  asOf: {
    salesDate: string | null;
    salesDaysAvailable: number;
    fullSnapshotAt: string | null;
    performanceDate: string | null;
    current7Complete: boolean;
    previous7Complete: boolean;
  };
  summary: {
    products: number;
    activeProducts: number;
    withFullStock: number;
    stockTimeAffectedUnits: number;
    unitsPeriod: number;
    revenuePeriod: number;
  };
  products: ProductDashboardRow[];
}

export async function loadProductsDashboard(): Promise<ProductsDashboardData | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_products_dashboard_data");
  if (error) throw new Error(`Não foi possível carregar os produtos: ${error.message}`);
  if (!data || typeof data !== "object") return null;
  return data as ProductsDashboardData;
}
