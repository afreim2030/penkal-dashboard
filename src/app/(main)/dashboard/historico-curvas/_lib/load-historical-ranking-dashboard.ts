import { createClient } from "@/lib/supabase/server";

import { type Curve, loadAbcdeDashboard } from "../../curva-abcde/_lib/load-abcde-dashboard";

export type HistoricalSituation =
  | "Precisa recuperar"
  | "Sem vender com estoque"
  | "Sem estoque FULL"
  | "Anúncio pausado"
  | "Anúncio excluído"
  | "SKU não localizado"
  | "Mantém resultado";
export type HistoricalPriority = "Crítica" | "Alta" | "Média" | "Normal";
export interface HistoricalRankingDashboardRow {
  sku: string;
  productName: string;
  historicalRank: number;
  historicalCurve: Exclude<Curve, "Sem vendas">;
  historicalUnits: number;
  currentCurve: Curve;
  currentUnits: number;
  currentRevenue: number;
  currentVisits: number;
  currentConversion: number;
  fullStock: number;
  listingStatus: string;
  situation: HistoricalSituation;
  priority: HistoricalPriority;
}
export interface HistoricalRankingDashboardData {
  period: { start: string | null; end: string | null };
  rows: HistoricalRankingDashboardRow[];
  summary: { historical: number; recover: number; noSalesWithStock: number; noFull: number; inactive: number };
}

function currentListingStatus(statuses: Array<string | null>): string {
  const normalized = statuses.map((status) => status?.toLocaleLowerCase("pt-BR") ?? "");
  if (normalized.some((status) => status === "ativo" || status === "active")) return "Ativo";
  if (
    normalized.length &&
    normalized.every((status) => status === "excluído" || status === "excluido" || status === "deleted")
  )
    return "Excluído";
  if (normalized.some((status) => status.includes("paus") || status.includes("inativ"))) return "Pausado";
  return statuses.find(Boolean) ?? "Sem anúncio";
}

function hasFallenFromStrongHistory(historicalCurve: string, currentCurve: Curve): boolean {
  return (historicalCurve === "A" || historicalCurve === "B") && ["C", "D", "E", "Sem vendas"].includes(currentCurve);
}

function priorityFor(situation: HistoricalSituation, historicalCurve: string): HistoricalPriority {
  if (situation === "Sem vender com estoque" && historicalCurve === "A") return "Crítica";
  if (situation === "Precisa recuperar" || (situation === "Sem estoque FULL" && historicalCurve === "A")) return "Alta";
  if (situation === "Mantém resultado") return "Normal";
  return "Média";
}

export async function loadHistoricalRankingDashboard(
  start?: string,
  end?: string,
): Promise<HistoricalRankingDashboardData | null> {
  const supabase = await createClient();
  const { data: accountId, error: accountError } = await supabase.rpc("get_active_marketplace_account_id");
  if (accountError || !accountId) throw new Error("Não foi possível identificar a conta ativa.");
  const [{ data: historical, error: historicalError }, curveData] = await Promise.all([
    supabase
      .from("historical_sku_rankings")
      .select("sku,product_name,historical_rank,historical_curve,historical_units")
      .eq("account_id", accountId)
      .order("historical_rank"),
    loadAbcdeDashboard(start, end),
  ]);
  if (historicalError) throw new Error(`Não foi possível carregar o ranking histórico: ${historicalError.message}`);
  if (!historical?.length) return null;
  const skus = historical.map((row) => row.sku as string);
  const [{ data: products, error: productsError }, { data: latestSnapshot, error: snapshotError }] = await Promise.all([
    supabase.from("products").select("id,sku,name").eq("account_id", accountId).is("excluded_at", null).in("sku", skus),
    supabase
      .from("full_inventory_snapshots")
      .select("snapshot_at")
      .eq("account_id", accountId)
      .order("snapshot_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (productsError) throw new Error(`Não foi possível localizar os produtos: ${productsError.message}`);
  if (snapshotError) throw new Error(`Não foi possível carregar o estoque FULL: ${snapshotError.message}`);
  const productBySku = new Map((products ?? []).map((product) => [product.sku as string, product]));
  const productIds = (products ?? []).map((product) => product.id as string);
  const [{ data: listings, error: listingsError }, { data: stock, error: stockError }] = await Promise.all([
    productIds.length
      ? supabase.from("listings").select("product_id,status").eq("account_id", accountId).in("product_id", productIds)
      : Promise.resolve({ data: [], error: null }),
    latestSnapshot?.snapshot_at
      ? supabase
          .from("full_inventory_snapshots")
          .select("sku_raw,quantity_full")
          .eq("account_id", accountId)
          .eq("snapshot_at", latestSnapshot.snapshot_at)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (listingsError) throw new Error(`Não foi possível carregar os anúncios: ${listingsError.message}`);
  if (stockError) throw new Error(`Não foi possível carregar o estoque FULL: ${stockError.message}`);
  const listingStatuses = new Map<string, Array<string | null>>();
  for (const listing of listings ?? []) {
    const statuses = listingStatuses.get(listing.product_id as string) ?? [];
    statuses.push(listing.status as string | null);
    listingStatuses.set(listing.product_id as string, statuses);
  }
  const stockBySku = new Map<string, number>();
  for (const item of stock ?? [])
    stockBySku.set(
      item.sku_raw as string,
      (stockBySku.get(item.sku_raw as string) ?? 0) + Number(item.quantity_full ?? 0),
    );
  const curveBySku = new Map((curveData?.rows ?? []).filter((row) => row.sku).map((row) => [row.sku as string, row]));
  const rows: HistoricalRankingDashboardRow[] = historical.map((history) => {
    const sku = history.sku as string;
    const product = productBySku.get(sku);
    const current = curveBySku.get(sku);
    const currentCurve = current?.currentCurve ?? "Sem vendas";
    const fullStock = stockBySku.get(sku) ?? 0;
    const listingStatus = product
      ? currentListingStatus(listingStatuses.get(product.id as string) ?? [])
      : "Não localizado";
    let situation: HistoricalSituation = "Mantém resultado";
    if (!product) situation = "SKU não localizado";
    else if (listingStatus === "Excluído") situation = "Anúncio excluído";
    else if (listingStatus !== "Ativo") situation = "Anúncio pausado";
    else if ((current?.currentUnits ?? 0) <= 0 && fullStock > 0) situation = "Sem vender com estoque";
    else if (fullStock <= 0) situation = "Sem estoque FULL";
    else if (hasFallenFromStrongHistory(history.historical_curve as string, currentCurve))
      situation = "Precisa recuperar";
    const priority = priorityFor(situation, history.historical_curve as string);
    return {
      sku,
      productName: product?.name ?? (history.product_name as string) ?? "Produto não localizado",
      historicalRank: Number(history.historical_rank),
      historicalCurve: history.historical_curve as Exclude<Curve, "Sem vendas">,
      historicalUnits: Number(history.historical_units),
      currentCurve,
      currentUnits: current?.currentUnits ?? 0,
      currentRevenue: current?.currentRevenue ?? 0,
      currentVisits: current?.currentVisits ?? 0,
      currentConversion: current?.currentConversion ?? 0,
      fullStock,
      listingStatus,
      situation,
      priority,
    };
  });
  return {
    period: {
      start: curveData?.period?.start ?? curveData?.currentMonth ?? null,
      end: curveData?.period?.end ?? curveData?.currentMonth ?? null,
    },
    rows,
    summary: {
      historical: rows.length,
      recover: rows.filter((row) => row.situation === "Precisa recuperar").length,
      noSalesWithStock: rows.filter((row) => row.situation === "Sem vender com estoque").length,
      noFull: rows.filter((row) => row.situation === "Sem estoque FULL").length,
      inactive: rows.filter((row) => row.situation === "Anúncio pausado" || row.situation === "Anúncio excluído")
        .length,
    },
  };
}
