import {
  estimateFullInventoryFifo,
  FULL_FIFO_BUCKET_KEYS,
  type FullFifoAllocation,
  type FullFifoBucketKey,
  type FullFifoInbound,
} from "./full-fifo";

export type EstimatedFifoStatus = "Cobertura completa" | "Cobertura parcial" | "Sem estoque" | "Sem histórico";

export interface FullInventorySnapshotInput {
  productId: string | null;
  productName: string | null;
  sku: string;
  quantityFull: number;
  unitsAffectStockTime: number | null;
}

export interface FullFifoSkuAnalysis extends Record<FullFifoBucketKey, number> {
  sku: string;
  product_id: string | null;
  product_name: string | null;
  quantity_full: number;
  known_age_quantity: number;
  unknown_age_quantity: number;
  coverage_percentage: number | null;
  weighted_average_age_days: number | null;
  oldest_known_remaining_received_at: string | null;
  newest_known_remaining_received_at: string | null;
  units_affect_stock_time: number;
  estimated_fifo_status: EstimatedFifoStatus;
  allocations: FullFifoAllocation[];
  coverage_problem_count: number;
}

export interface FullFifoSummary {
  quantityFull: number;
  skusWithStock: number;
  knownAgeQuantity: number;
  unknownAgeQuantity: number;
  coveragePercentage: number | null;
  weightedAverageAgeDays: number | null;
  units90Plus: number;
  units180Plus: number;
  unitsAffectStockTime: number;
  buckets: Record<FullFifoBucketKey, number>;
  fullyCoveredSkus: number;
  partiallyCoveredSkus: number;
  noHistorySkus: number;
}

export function analyzeFullInventory(input: {
  snapshotAt: string;
  snapshots: readonly FullInventorySnapshotInput[];
  inboundsBySku: ReadonlyMap<string, readonly FullFifoInbound[]>;
}): { rows: FullFifoSkuAnalysis[]; summary: FullFifoSummary } {
  const rows = input.snapshots.map((snapshot): FullFifoSkuAnalysis => {
    const inbounds = input.inboundsBySku.get(snapshot.sku) ?? [];
    const result = estimateFullInventoryFifo({
      currentQuantity: snapshot.quantityFull,
      snapshotAt: input.snapshotAt,
      inbounds,
    });
    let estimatedFifoStatus: EstimatedFifoStatus = "Cobertura completa";
    if (snapshot.quantityFull === 0) estimatedFifoStatus = "Sem estoque";
    else if (result.knownAgeQuantity === 0) estimatedFifoStatus = "Sem histórico";
    else if (result.unknownAgeQuantity > 0) estimatedFifoStatus = "Cobertura parcial";
    return {
      sku: snapshot.sku,
      product_id: snapshot.productId,
      product_name: snapshot.productName,
      quantity_full: snapshot.quantityFull,
      known_age_quantity: result.knownAgeQuantity,
      unknown_age_quantity: result.unknownAgeQuantity,
      coverage_percentage: result.coveragePercentage,
      weighted_average_age_days: result.weightedAverageAgeDays,
      oldest_known_remaining_received_at: result.oldestKnownRemainingReceivedAt,
      newest_known_remaining_received_at: result.newestKnownRemainingReceivedAt,
      units_0_30: result.buckets.units_0_30,
      units_31_60: result.buckets.units_31_60,
      units_61_90: result.buckets.units_61_90,
      units_91_120: result.buckets.units_91_120,
      units_121_180: result.buckets.units_121_180,
      units_181_plus: result.buckets.units_181_plus,
      units_unknown: result.buckets.units_unknown,
      units_affect_stock_time: snapshot.unitsAffectStockTime ?? 0,
      estimated_fifo_status: estimatedFifoStatus,
      allocations: result.allocations,
      coverage_problem_count: result.coverageProblemCount,
    };
  });
  const quantityFull = rows.reduce((total, row) => total + row.quantity_full, 0);
  const knownAgeQuantity = rows.reduce((total, row) => total + row.known_age_quantity, 0);
  const buckets = Object.fromEntries(
    FULL_FIFO_BUCKET_KEYS.map((key) => [key, rows.reduce((total, row) => total + row[key], 0)]),
  ) as Record<FullFifoBucketKey, number>;
  const weightedAgeTotal = rows.reduce(
    (total, row) => total + (row.weighted_average_age_days ?? 0) * row.known_age_quantity,
    0,
  );
  return {
    rows,
    summary: {
      quantityFull,
      skusWithStock: rows.filter((row) => row.quantity_full > 0).length,
      knownAgeQuantity,
      unknownAgeQuantity: quantityFull - knownAgeQuantity,
      coveragePercentage: quantityFull === 0 ? null : (knownAgeQuantity / quantityFull) * 100,
      weightedAverageAgeDays: knownAgeQuantity === 0 ? null : weightedAgeTotal / knownAgeQuantity,
      units90Plus: buckets.units_91_120 + buckets.units_121_180 + buckets.units_181_plus,
      units180Plus: buckets.units_181_plus,
      unitsAffectStockTime: rows.reduce((total, row) => total + row.units_affect_stock_time, 0),
      buckets,
      fullyCoveredSkus: rows.filter(
        (row) => row.quantity_full > 0 && row.estimated_fifo_status === "Cobertura completa",
      ).length,
      partiallyCoveredSkus: rows.filter((row) => row.estimated_fifo_status === "Cobertura parcial").length,
      noHistorySkus: rows.filter((row) => row.estimated_fifo_status === "Sem histórico").length,
    },
  };
}
