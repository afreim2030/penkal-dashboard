import { createClient } from "@/lib/supabase/server";

import type { FullFifoInbound } from "./full-fifo";
import { analyzeFullInventory, type FullFifoSkuAnalysis, type FullFifoSummary } from "./full-fifo-analysis";

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

export interface FullFifoAnalysisData {
  snapshotAt: string;
  importId: string;
  rows: FullFifoSkuAnalysis[];
  summary: FullFifoSummary;
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

  const [productsResponse, inboundsResponse] = await Promise.all([
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
  return { snapshotAt: latest.snapshot_at, importId: latest.import_id, ...analysis };
}
