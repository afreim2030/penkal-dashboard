import type { FullFifoVelocitySkuAnalysis } from "./load-full-fifo-analysis";

export const STOCK_ACTION_CLASSIFICATIONS = [
  "Prioridade alta",
  "Atenção",
  "Monitorar",
  "Provável saída pelo giro",
  "Sem prioridade por Tempo de estoque",
] as const;

export type StockActionClassification = (typeof STOCK_ACTION_CLASSIFICATIONS)[number];

export interface StockActionClassificationResult {
  classification: StockActionClassification;
  reason: string;
  hasFifo90Plus: boolean;
}

export interface StockActionInput {
  quantityFull: number;
  soldUnits: number;
  daysOfStock: number | null;
  unitsAffectStockTime: number;
  units90Plus: number;
  impactPercentage: number | null;
}

export function classifyStockAction(input: StockActionInput): StockActionClassificationResult {
  const hasFifo90Plus = input.units90Plus > 0;

  if (input.quantityFull <= 0 || input.unitsAffectStockTime <= 0) {
    return {
      classification: "Sem prioridade por Tempo de estoque",
      reason: "Não afeta Tempo de estoque",
      hasFifo90Plus,
    };
  }

  if (input.soldUnits === 0) {
    return {
      classification: "Prioridade alta",
      reason: "Afeta Tempo de estoque e não teve venda no período",
      hasFifo90Plus,
    };
  }

  if (input.daysOfStock !== null && input.daysOfStock > 90) {
    return {
      classification: "Prioridade alta",
      reason: "Afeta Tempo de estoque e possui mais de 90 dias de estoque estimado",
      hasFifo90Plus,
    };
  }

  if (input.daysOfStock !== null && input.daysOfStock > 60) {
    return {
      classification: "Atenção",
      reason: "Afeta Tempo de estoque e possui entre 61 e 90 dias de estoque estimado",
      hasFifo90Plus,
    };
  }

  if (input.daysOfStock !== null && input.daysOfStock > 30) {
    return {
      classification: "Monitorar",
      reason: "Afeta Tempo de estoque e possui entre 31 e 60 dias de estoque estimado",
      hasFifo90Plus,
    };
  }

  return {
    classification: "Provável saída pelo giro",
    reason: "Afeta Tempo de estoque, mas o giro atual indica até 30 dias de cobertura",
    hasFifo90Plus,
  };
}

export const STOCK_PRIORITY_DAYS_BUCKETS = [
  "0_7",
  "8_15",
  "16_30",
  "31_45",
  "46_60",
  "61_90",
  "91_120",
  "121_plus",
] as const;

export type StockPriorityDaysBucket = (typeof STOCK_PRIORITY_DAYS_BUCKETS)[number];

export interface StockPriorityDistributionRow {
  key: StockPriorityDaysBucket | "without_sales";
  label: string;
  skuCount: number;
  quantityFull: number;
  quantityPercentage: number;
  unitsAffectStockTime: number;
  units90Plus: number;
}

export interface StockPriorityAudit {
  rowsWithStock: FullFifoVelocitySkuAnalysis[];
  rowsWithoutStockWithDemand: FullFifoVelocitySkuAnalysis[];
  distributionByDays: StockPriorityDistributionRow[];
  affectingRows: FullFifoVelocitySkuAnalysis[];
  affectingWithoutSales: FullFifoVelocitySkuAnalysis[];
  affectingOver90Days: FullFifoVelocitySkuAnalysis[];
  affectingAtMost30Days: FullFifoVelocitySkuAnalysis[];
  affectingWithSales: FullFifoVelocitySkuAnalysis[];
  over60Days: StockPriorityDistributionRow;
  over90Days: StockPriorityDistributionRow;
  over120Days: StockPriorityDistributionRow;
  volumeDistribution: { key: string; label: string; skuCount: number; quantityFull: number }[];
  contradictions: string[];
  classifiedRows: StockPriorityClassifiedRow[];
  classificationSummary: Record<StockActionClassification, { skuCount: number; unitsAffectStockTime: number }>;
}

export interface StockPriorityClassifiedRow extends FullFifoVelocitySkuAnalysis, StockActionClassificationResult {
  impact_percentage: number | null;
}

const DAYS_LABELS: Record<StockPriorityDaysBucket, string> = {
  "0_7": "0–7 dias",
  "8_15": "8–15 dias",
  "16_30": "16–30 dias",
  "31_45": "31–45 dias",
  "46_60": "46–60 dias",
  "61_90": "61–90 dias",
  "91_120": "91–120 dias",
  "121_plus": "121+ dias",
};

export function units90Plus(row: FullFifoVelocitySkuAnalysis): number {
  return row.units_91_120 + row.units_121_180 + row.units_181_plus;
}

export function impactPercentage(row: FullFifoVelocitySkuAnalysis): number | null {
  if (row.quantity_full <= 0) return null;
  return (row.units_affect_stock_time / row.quantity_full) * 100;
}

function classifyRow(row: FullFifoVelocitySkuAnalysis): StockPriorityClassifiedRow {
  const impact = impactPercentage(row);
  return {
    ...row,
    ...classifyStockAction({
      quantityFull: row.quantity_full,
      soldUnits: row.sold_units_available_period,
      daysOfStock: row.days_of_stock_available_period,
      unitsAffectStockTime: row.units_affect_stock_time,
      units90Plus: units90Plus(row),
      impactPercentage: impact,
    }),
    impact_percentage: impact,
  };
}

export function stockDaysBucket(days: number | null): StockPriorityDaysBucket | null {
  if (days === null || !Number.isFinite(days)) return null;
  if (days <= 7) return "0_7";
  if (days <= 15) return "8_15";
  if (days <= 30) return "16_30";
  if (days <= 45) return "31_45";
  if (days <= 60) return "46_60";
  if (days <= 90) return "61_90";
  if (days <= 120) return "91_120";
  return "121_plus";
}

function summarize(
  key: StockPriorityDaysBucket | "without_sales",
  rows: FullFifoVelocitySkuAnalysis[],
  totalQuantity: number,
  label?: string,
): StockPriorityDistributionRow {
  return {
    key,
    label: label ?? (key === "without_sales" ? "Sem venda no período" : DAYS_LABELS[key]),
    skuCount: rows.length,
    quantityFull: rows.reduce((sum, row) => sum + row.quantity_full, 0),
    quantityPercentage:
      totalQuantity === 0 ? 0 : (rows.reduce((sum, row) => sum + row.quantity_full, 0) / totalQuantity) * 100,
    unitsAffectStockTime: rows.reduce((sum, row) => sum + row.units_affect_stock_time, 0),
    units90Plus: rows.reduce((sum, row) => sum + units90Plus(row), 0),
  };
}

function volumeBucket(row: FullFifoVelocitySkuAnalysis): string {
  if (row.sold_units_available_period === 0) return "without_sales";
  if (row.sold_units_available_period <= 2) return "1_2";
  if (row.sold_units_available_period <= 9) return "3_9";
  if (row.sold_units_available_period <= 29) return "10_29";
  return "30_plus";
}

export function buildStockPriorityAudit(
  rows: FullFifoVelocitySkuAnalysis[],
  totalQuantity: number,
): StockPriorityAudit {
  const rowsWithStock = rows.filter((row) => row.quantity_full > 0);
  const rowsWithoutStockWithDemand = rows.filter(
    (row) => row.quantity_full === 0 && row.sold_units_available_period > 0,
  );
  const distributionByDays = [
    ...STOCK_PRIORITY_DAYS_BUCKETS.map((key) =>
      summarize(
        key,
        rowsWithStock.filter((row) => stockDaysBucket(row.days_of_stock_available_period) === key),
        totalQuantity,
      ),
    ),
    summarize(
      "without_sales",
      rowsWithStock.filter((row) => row.sold_units_available_period === 0),
      totalQuantity,
    ),
  ];
  const affectingRows = rowsWithStock.filter((row) => row.units_affect_stock_time > 0);
  const affectingWithoutSales = affectingRows.filter((row) => row.sold_units_available_period === 0);
  const affectingOver90Days = affectingRows.filter((row) => (row.days_of_stock_available_period ?? 0) > 90);
  const affectingAtMost30Days = affectingRows.filter(
    (row) => row.days_of_stock_available_period !== null && row.days_of_stock_available_period <= 30,
  );
  const affectingWithSales = affectingRows.filter((row) => row.sold_units_available_period > 0);
  const classifiedRows = rows.map(classifyRow);
  const classificationSummary = Object.fromEntries(
    STOCK_ACTION_CLASSIFICATIONS.map((classification) => {
      const matching = classifiedRows.filter((row) => row.classification === classification);
      return [
        classification,
        {
          skuCount: matching.length,
          unitsAffectStockTime: matching.reduce((sum, row) => sum + row.units_affect_stock_time, 0),
        },
      ];
    }),
  ) as Record<StockActionClassification, { skuCount: number; unitsAffectStockTime: number }>;
  const volumeLabels = [
    ["without_sales", "Sem venda"],
    ["1_2", "Baixo volume observado (1–2)"],
    ["3_9", "Volume observado (3–9)"],
    ["10_29", "Volume relevante (10–29)"],
    ["30_plus", "Volume alto (30+)"],
  ] as const;
  const volumeDistribution = volumeLabels.map(([key, label]) => {
    const matching = rowsWithStock.filter((row) => volumeBucket(row) === key);
    return {
      key,
      label,
      skuCount: matching.length,
      quantityFull: matching.reduce((sum, row) => sum + row.quantity_full, 0),
    };
  });
  const contradictions: string[] = [];
  rows.forEach((row) => {
    if (row.units_affect_stock_time > row.quantity_full)
      contradictions.push(`${row.sku}: afeta métrica acima do estoque`);
    if (row.quantity_full === 0 && row.units_affect_stock_time > 0)
      contradictions.push(`${row.sku}: afeta métrica sem estoque`);
    if (units90Plus(row) > 0 && row.days_of_stock_available_period !== null && row.days_of_stock_available_period <= 30)
      contradictions.push(`${row.sku}: FIFO 90+ junto com dias de estoque <= 30`);
  });
  return {
    rowsWithStock,
    rowsWithoutStockWithDemand,
    distributionByDays,
    affectingRows,
    affectingWithoutSales,
    affectingOver90Days,
    affectingAtMost30Days,
    affectingWithSales,
    over60Days: summarize(
      "61_90",
      rowsWithStock.filter((row) => (row.days_of_stock_available_period ?? -1) > 60),
      totalQuantity,
      ">60 dias",
    ),
    over90Days: summarize(
      "91_120",
      rowsWithStock.filter((row) => (row.days_of_stock_available_period ?? -1) > 90),
      totalQuantity,
      ">90 dias",
    ),
    over120Days: summarize(
      "121_plus",
      rowsWithStock.filter((row) => (row.days_of_stock_available_period ?? -1) > 120),
      totalQuantity,
      ">120 dias",
    ),
    volumeDistribution,
    contradictions,
    classifiedRows,
    classificationSummary,
  };
}
