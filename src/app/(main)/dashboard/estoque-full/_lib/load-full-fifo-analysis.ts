import { createClient } from "@/lib/supabase/server";

import type { FullFifoInbound } from "./full-fifo";
import { analyzeFullInventory, type FullFifoSkuAnalysis, type FullFifoSummary } from "./full-fifo-analysis";
import {
  calculateAvailablePeriodVelocity,
  calculateStockVelocity,
  calculateTrend,
  type StockVelocitySale,
} from "./stock-velocity";

export const APPROVED_SALES_COVERAGE_START = "2026-08-01";
export const APPROVED_SALES_COVERAGE_END_COMPLETE = "2026-08-10";
const PARTIAL_DAY_END = "2026-08-11";

interface SnapshotRecord {
  import_id: string;
  product_id: string | null;
  quantity_full: number;
  sku_raw: string | null;
  snapshot_at: string;
  units_affect_stock_time: number | null;
}

interface ProductRecord {
  id: string;
  name: string;
}

interface InboundRecord {
  inbound_id: string;
  received_at: string | null;
  sku_raw: string;
  units_processed: number | null;
}

interface SalesRecord {
  sale_date: string;
  sale_status: string | null;
  cancellations_refunds: number | null;
  quantity: number | null;
  sku_raw: string | null;
  record_type: string;
}

export interface StockVelocitySkuAnalysis {
  sold_units_available_period: number;
  average_daily_sales_available_period: number;
  days_of_stock_available_period: number | null;
  sales_days_observed_available_period: number;
  sold_units_7d: number | null;
  average_daily_sales_7d: number | null;
  days_of_stock_7d: number | null;
  sold_units_14d: number | null;
  days_of_stock_14d: number | null;
  sold_units_30d: number | null;
  days_of_stock_30d: number | null;
  sales_velocity_change_percentage: number | null;
  velocity_status: "Sem estoque" | "Sem estoque com demanda observada" | "Sem venda no período" | "Estoque com demanda";
}

export type FullFifoVelocitySkuAnalysis = FullFifoSkuAnalysis & StockVelocitySkuAnalysis;

export interface SalesCoverage {
  coverageStart: string;
  coverageEndComplete: string;
  calendarDays: number;
  validSoldUnits: number;
  averageDailySales: number;
  validSoldUnitsPartialDay: number;
  partialDay: string;
  partialDayExcluded: boolean;
}

export interface FullFifoAnalysisData {
  snapshotAt: string;
  importId: string;
  rows: FullFifoVelocitySkuAnalysis[];
  summary: FullFifoSummary;
  salesCoverage: SalesCoverage;
}

async function loadSales(supabase: Awaited<ReturnType<typeof createClient>>): Promise<StockVelocitySale[]> {
  const rows: SalesRecord[] = [];
  const pageSize = 1000;
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await supabase
      .from("sales")
      .select("sale_date,sale_status,cancellations_refunds,quantity,sku_raw,record_type")
      .gte("sale_date", `${APPROVED_SALES_COVERAGE_START}T00:00:00.000Z`)
      .lt("sale_date", "2026-08-12T00:00:00.000Z")
      .order("sale_date", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`Não foi possível carregar as vendas: ${error.message}`);
    const page = (data ?? []) as SalesRecord[];
    rows.push(...page);
    hasMore = page.length === pageSize;
    offset += pageSize;
  }
  return rows.map((row) => ({
    saleDate: row.sale_date,
    saleStatus: row.sale_status,
    cancellationsRefunds: row.cancellations_refunds,
    quantity: row.quantity,
    sku: row.sku_raw,
    recordType: row.record_type,
  }));
}

export async function loadFullFifoAnalysis(): Promise<FullFifoAnalysisData | null> {
  const supabase = await createClient();
  const { data: latest, error: latestError } = await supabase
    .from("full_inventory_snapshots")
    .select("import_id,snapshot_at")
    .order("snapshot_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw new Error(`Não foi possível localizar o snapshot atual: ${latestError.message}`);
  if (!latest) return null;

  const { data: snapshotData, error: snapshotError } = await supabase
    .from("full_inventory_snapshots")
    .select("import_id,product_id,quantity_full,sku_raw,snapshot_at,units_affect_stock_time")
    .eq("import_id", latest.import_id)
    .order("sku_raw");
  if (snapshotError) throw new Error(`Não foi possível carregar o snapshot atual: ${snapshotError.message}`);
  const snapshots = (snapshotData ?? []) as SnapshotRecord[];
  const productIds = [...new Set(snapshots.flatMap((snapshot) => (snapshot.product_id ? [snapshot.product_id] : [])))];
  const skus = snapshots.flatMap((snapshot) => (snapshot.sku_raw ? [snapshot.sku_raw] : []));

  const [productsResponse, inboundsResponse, sales] = await Promise.all([
    productIds.length
      ? supabase.from("products").select("id,name").in("id", productIds)
      : Promise.resolve({ data: [] as ProductRecord[], error: null }),
    skus.length
      ? supabase
          .from("full_inbounds")
          .select("inbound_id,received_at,sku_raw,units_processed")
          .in("sku_raw", skus)
          .order("received_at", { ascending: false })
      : Promise.resolve({ data: [] as InboundRecord[], error: null }),
    loadSales(supabase),
  ]);
  if (productsResponse.error)
    throw new Error(`Não foi possível carregar os produtos: ${productsResponse.error.message}`);
  if (inboundsResponse.error)
    throw new Error(`Não foi possível carregar os recebimentos FULL: ${inboundsResponse.error.message}`);

  const productNames = new Map(
    ((productsResponse.data ?? []) as ProductRecord[]).map((product) => [product.id, product.name]),
  );
  const inboundsBySku = new Map<string, FullFifoInbound[]>();
  for (const inbound of (inboundsResponse.data ?? []) as InboundRecord[]) {
    const rows = inboundsBySku.get(inbound.sku_raw) ?? [];
    rows.push({
      inboundId: inbound.inbound_id,
      receivedAt: inbound.received_at,
      unitsProcessed: inbound.units_processed,
    });
    inboundsBySku.set(inbound.sku_raw, rows);
  }
  const analysis = analyzeFullInventory({
    snapshotAt: latest.snapshot_at,
    snapshots: snapshots.flatMap((snapshot) =>
      snapshot.sku_raw
        ? [
            {
              productId: snapshot.product_id,
              productName: snapshot.product_id ? (productNames.get(snapshot.product_id) ?? null) : null,
              sku: snapshot.sku_raw,
              quantityFull: snapshot.quantity_full,
              unitsAffectStockTime: snapshot.units_affect_stock_time,
            },
          ]
        : [],
    ),
    inboundsBySku,
  });
  const salesBySku = new Map<string, StockVelocitySale[]>();
  for (const sale of sales) {
    if (!sale.sku) continue;
    const skuSales = salesBySku.get(sale.sku) ?? [];
    skuSales.push(sale);
    salesBySku.set(sale.sku, skuSales);
  }
  const rows = analysis.rows.map((row): FullFifoVelocitySkuAnalysis => {
    const skuSales = salesBySku.get(row.sku) ?? [];
    const available = calculateStockVelocity({
      quantityFull: row.quantity_full,
      coverageStart: APPROVED_SALES_COVERAGE_START,
      coverageEndComplete: APPROVED_SALES_COVERAGE_END_COMPLETE,
      sales: skuSales,
    });
    const sevenDays = calculateAvailablePeriodVelocity(
      row.quantity_full,
      APPROVED_SALES_COVERAGE_START,
      APPROVED_SALES_COVERAGE_END_COMPLETE,
      skuSales,
      7,
    );
    const fourteenDays = calculateAvailablePeriodVelocity(
      row.quantity_full,
      APPROVED_SALES_COVERAGE_START,
      APPROVED_SALES_COVERAGE_END_COMPLETE,
      skuSales,
      14,
    );
    const thirtyDays = calculateAvailablePeriodVelocity(
      row.quantity_full,
      APPROVED_SALES_COVERAGE_START,
      APPROVED_SALES_COVERAGE_END_COMPLETE,
      skuSales,
      30,
    );
    let velocityStatus: StockVelocitySkuAnalysis["velocity_status"] = "Estoque com demanda";
    if (row.quantity_full === 0) {
      velocityStatus = available.soldUnits > 0 ? "Sem estoque com demanda observada" : "Sem estoque";
    } else if (available.soldUnits === 0) {
      velocityStatus = "Sem venda no período";
    }
    return {
      ...row,
      sold_units_available_period: available.soldUnits,
      average_daily_sales_available_period: available.averageDailySales,
      days_of_stock_available_period: available.estimatedDaysOfStock,
      sales_days_observed_available_period: available.salesDaysWithActivity,
      sold_units_7d: sevenDays?.soldUnits ?? null,
      average_daily_sales_7d: sevenDays?.averageDailySales ?? null,
      days_of_stock_7d: sevenDays?.estimatedDaysOfStock ?? null,
      sold_units_14d: fourteenDays?.soldUnits ?? null,
      days_of_stock_14d: fourteenDays?.estimatedDaysOfStock ?? null,
      sold_units_30d: thirtyDays?.soldUnits ?? null,
      days_of_stock_30d: thirtyDays?.estimatedDaysOfStock ?? null,
      sales_velocity_change_percentage: calculateTrend(
        skuSales,
        APPROVED_SALES_COVERAGE_START,
        APPROVED_SALES_COVERAGE_END_COMPLETE,
      ),
      velocity_status: velocityStatus,
    };
  });
  const validPeriod = calculateStockVelocity({
    quantityFull: 0,
    coverageStart: APPROVED_SALES_COVERAGE_START,
    coverageEndComplete: APPROVED_SALES_COVERAGE_END_COMPLETE,
    sales,
  });
  const partialDay = calculateStockVelocity({
    quantityFull: 0,
    coverageStart: PARTIAL_DAY_END,
    coverageEndComplete: PARTIAL_DAY_END,
    sales,
  });
  return {
    snapshotAt: latest.snapshot_at,
    importId: latest.import_id,
    rows,
    summary: analysis.summary,
    salesCoverage: {
      coverageStart: APPROVED_SALES_COVERAGE_START,
      coverageEndComplete: APPROVED_SALES_COVERAGE_END_COMPLETE,
      calendarDays: validPeriod.calendarDays,
      validSoldUnits: validPeriod.soldUnits,
      averageDailySales: validPeriod.averageDailySales,
      validSoldUnitsPartialDay: partialDay.soldUnits,
      partialDay: PARTIAL_DAY_END,
      partialDayExcluded: true,
    },
  };
}
