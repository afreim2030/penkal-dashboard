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
  stockDays: number | null;
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

  const dashboard = data as ProductsDashboardData;
  const { data: snapshots, error: snapshotsError } = await supabase
    .from("full_inventory_snapshots")
    .select("product_id, quantity_full, sales_30d, snapshot_at")
    .not("product_id", "is", null);
  if (snapshotsError) throw new Error(`Não foi possível calcular o tempo de estoque: ${snapshotsError.message}`);

  const latestSnapshotAt = (snapshots ?? []).reduce<string | null>(
    (latest, snapshot) => (!latest || snapshot.snapshot_at > latest ? snapshot.snapshot_at : latest),
    null,
  );
  const stockByProduct = new Map<string, { stock: number; sales30d: number }>();
  for (const snapshot of snapshots ?? []) {
    if (snapshot.snapshot_at !== latestSnapshotAt || !snapshot.product_id) continue;
    const current = stockByProduct.get(snapshot.product_id) ?? { stock: 0, sales30d: 0 };
    current.stock += snapshot.quantity_full ?? 0;
    current.sales30d += snapshot.sales_30d ?? 0;
    stockByProduct.set(snapshot.product_id, current);
  }

  const { data: productRecords, error: productsError } = await supabase.from("products").select("id, sku");
  if (productsError) throw new Error(`Não foi possível calcular o tempo de estoque: ${productsError.message}`);
  const productIds = new Map((productRecords ?? []).map((product) => [product.sku, product.id]));
  const listingRecords: Array<{ product_id: string | null; status: string | null }> = [];
  const listingPageSize = 1000;
  for (let from = 0; ; from += listingPageSize) {
    const { data: page, error: listingsError } = await supabase
      .from("listings")
      .select("product_id, status")
      .not("product_id", "is", null)
      .range(from, from + listingPageSize - 1);
    if (listingsError) throw new Error("Não foi possível identificar anúncios excluídos: " + listingsError.message);
    listingRecords.push(...(page ?? []));
    if (!page || page.length < listingPageSize) break;
  }
  const visibleProductIds = new Set<string>();
  for (const listing of listingRecords) {
    if (listing.product_id && listing.status !== "Excluído") visibleProductIds.add(listing.product_id);
  }
  const { data: excluded, error: excludedError } = await supabase.from("products").select("sku").not("excluded_at", "is", null);
  if (excludedError) throw new Error("Não foi possível carregar anúncios excluídos: " + excludedError.message);
  const excludedSkus = new Set((excluded ?? []).map((product) => product.sku));

  dashboard.products = dashboard.products.map((product) => {
    const full = stockByProduct.get(productIds.get(product.sku) ?? "");
    const stockDays = full && full.stock > 0 && full.sales30d > 0 ? Math.ceil((full.stock / full.sales30d) * 30) : null;
    return { ...product, stockDays };
  }).filter((product) => !excludedSkus.has(product.sku) && (visibleProductIds.has(productIds.get(product.sku) ?? "") || product.listingCount === 0));
  dashboard.summary = {
    products: dashboard.products.length,
    activeProducts: dashboard.products.filter((product) => product.status === "Ativo").length,
    withFullStock: dashboard.products.filter((product) => product.fullStock > 0).length,
    stockTimeAffectedUnits: dashboard.products.reduce((total, product) => total + product.stockTimeAffected, 0),
    unitsPeriod: dashboard.products.reduce((total, product) => total + product.unitsPeriod, 0),
    revenuePeriod: dashboard.products.reduce((total, product) => total + product.revenuePeriod, 0),
  };

  return dashboard;
}
