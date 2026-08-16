import { createClient } from "@/lib/supabase/server";

export interface SalesDayMetrics {
  date: string | null;
  units: number;
  orders: number;
  revenue: number;
  ticket: number;
  cancelledOrders: number;
}

export interface SalesPeriodMetrics {
  start: string;
  end: string;
  units: number;
  orders: number;
  revenue: number;
  days: number;
}

export interface SalesDailyRow extends SalesDayMetrics {
  coverageStatus: "complete" | "partial" | "unknown";
}

export interface SalesSkuRow {
  sku: string;
  productName: string | null;
  units: number;
  orders: number;
  revenue: number;
}

export interface SalesHourlyRow {
  hour: number;
  units: number;
  orders: number;
}

export interface SalesWeekdayRow {
  weekday: number;
  units: number;
  orders: number;
  daysObserved: number;
  averageUnitsPerDay: number;
}

export interface SalesDashboardData {
  coverage: {
    minCompleteDate: string | null;
    maxCompleteDate: string | null;
    maxCoveredDate: string | null;
    previousCompleteDate: string | null;
    sameWeekdayPreviousWeek: string | null;
  };
  latestDay: SalesDayMetrics;
  previousDay: SalesDayMetrics;
  sameWeekdayPreviousWeek: SalesDayMetrics;
  periods: {
    last7: SalesPeriodMetrics | null;
    previous7: SalesPeriodMetrics | null;
    monthToDate: SalesPeriodMetrics | null;
    previousMonthToDate: SalesPeriodMetrics | null;
  };
  daily: SalesDailyRow[];
  topSkus: SalesSkuRow[];
  hourly: SalesHourlyRow[];
  weekdays: SalesWeekdayRow[];
}

export async function loadSalesDashboard(): Promise<SalesDashboardData | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_sales_dashboard_data");

  if (error) {
    throw new Error(`Não foi possível carregar o painel de vendas: ${error.message}`);
  }

  if (!data || typeof data !== "object") return null;
  return data as SalesDashboardData;
}
