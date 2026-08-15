import { analyzeFullInventory } from "../app/(main)/dashboard/estoque-full/_lib/full-fifo-analysis";
import type { FullFifoVelocitySkuAnalysis } from "../app/(main)/dashboard/estoque-full/_lib/load-full-fifo-analysis";
import {
  buildStockPriorityAudit,
  classifyStockAction,
  impactPercentage,
  stockDaysBucket,
  units90Plus,
} from "../app/(main)/dashboard/estoque-full/_lib/stock-priority-audit";
import {
  calculateStockVelocity,
  type StockVelocitySale,
} from "../app/(main)/dashboard/estoque-full/_lib/stock-velocity";
import { parseFullInventoryXlsx } from "../app/(main)/importar-dados/_lib/parse-full-inventory-xlsx";
import { parseInboundsCsv } from "../app/(main)/importar-dados/_lib/parse-inbounds-csv";
import { parseSalesXlsx } from "../app/(main)/importar-dados/_lib/parse-sales-xlsx";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

function makeRow(overrides: Partial<FullFifoVelocitySkuAnalysis> = {}): FullFifoVelocitySkuAnalysis {
  return {
    sku: "SKU-BASE",
    product_id: null,
    product_name: "Produto base",
    quantity_full: 10,
    known_age_quantity: 10,
    unknown_age_quantity: 0,
    coverage_percentage: 100,
    weighted_average_age_days: 20,
    oldest_known_remaining_received_at: null,
    newest_known_remaining_received_at: null,
    units_0_30: 10,
    units_31_60: 0,
    units_61_90: 0,
    units_91_120: 0,
    units_121_180: 0,
    units_181_plus: 0,
    units_unknown: 0,
    units_affect_stock_time: 0,
    estimated_fifo_status: "Cobertura completa",
    allocations: [],
    coverage_problem_count: 0,
    sold_units_available_period: 5,
    average_daily_sales_available_period: 0.5,
    days_of_stock_available_period: 20,
    sales_days_observed_available_period: 5,
    sold_units_7d: 5,
    average_daily_sales_7d: 0.7,
    days_of_stock_7d: 14,
    sold_units_14d: null,
    days_of_stock_14d: null,
    sold_units_30d: null,
    days_of_stock_30d: null,
    sales_velocity_change_percentage: null,
    velocity_status: "Estoque com demanda",
    ...overrides,
  };
}

const rows = [
  makeRow({
    sku: "SEM-VENDA",
    sold_units_available_period: 0,
    average_daily_sales_available_period: 0,
    days_of_stock_available_period: null,
    units_affect_stock_time: 4,
    quantity_full: 20,
  }),
  makeRow({
    sku: "GIRO-FORTE",
    sold_units_available_period: 30,
    average_daily_sales_available_period: 3,
    days_of_stock_available_period: 10,
    units_affect_stock_time: 2,
    quantity_full: 30,
  }),
  makeRow({
    sku: "AFETA-90",
    sold_units_available_period: 1,
    average_daily_sales_available_period: 0.1,
    days_of_stock_available_period: 100,
    units_affect_stock_time: 8,
    quantity_full: 10,
    units_91_120: 3,
  }),
  makeRow({
    sku: "AFETA-30",
    sold_units_available_period: 10,
    average_daily_sales_available_period: 1,
    days_of_stock_available_period: 30,
    units_affect_stock_time: 5,
    quantity_full: 10,
  }),
  makeRow({
    sku: "SEM-ESTOQUE-DEMANDA",
    quantity_full: 0,
    sold_units_available_period: 2,
    average_daily_sales_available_period: 0.2,
    days_of_stock_available_period: 0,
    units_affect_stock_time: 0,
  }),
];

assert.equal(stockDaysBucket(0), "0_7");
assert.equal(stockDaysBucket(30), "16_30");
assert.equal(stockDaysBucket(45), "31_45");
assert.equal(stockDaysBucket(60), "46_60");
assert.equal(stockDaysBucket(90), "61_90");
assert.equal(stockDaysBucket(91), "91_120");
assert.equal(stockDaysBucket(121), "121_plus");
assert.equal(stockDaysBucket(null), null);
assert.equal(impactPercentage(rows[2]), 80);
assert.equal(impactPercentage(rows[4]), null);
assert.equal(units90Plus(rows[2]), 3);

const classificationCases = [
  [
    "sem venda + afeta",
    {
      quantityFull: 20,
      soldUnits: 0,
      daysOfStock: null,
      unitsAffectStockTime: 4,
      units90Plus: 0,
      impactPercentage: 20,
    },
    "Prioridade alta",
  ],
  [
    ">90 dias + afeta",
    { quantityFull: 10, soldUnits: 1, daysOfStock: 100, unitsAffectStockTime: 8, units90Plus: 3, impactPercentage: 80 },
    "Prioridade alta",
  ],
  [
    "61–90 dias",
    { quantityFull: 10, soldUnits: 1, daysOfStock: 90, unitsAffectStockTime: 1, units90Plus: 0, impactPercentage: 10 },
    "Atenção",
  ],
  [
    "31–60 dias",
    { quantityFull: 10, soldUnits: 1, daysOfStock: 60, unitsAffectStockTime: 1, units90Plus: 0, impactPercentage: 10 },
    "Monitorar",
  ],
  [
    "até 30 dias",
    { quantityFull: 10, soldUnits: 1, daysOfStock: 30, unitsAffectStockTime: 1, units90Plus: 0, impactPercentage: 10 },
    "Provável saída pelo giro",
  ],
] as const;
for (const [, input, expected] of classificationCases) {
  assert.equal(classifyStockAction(input).classification, expected);
}
assert.equal(
  classifyStockAction({
    quantityFull: 10,
    soldUnits: 5,
    daysOfStock: 15,
    unitsAffectStockTime: 0,
    units90Plus: 2,
    impactPercentage: 0,
  }).classification,
  "Sem prioridade por Tempo de estoque",
);
assert.equal(
  classifyStockAction({
    quantityFull: 10,
    soldUnits: 5,
    daysOfStock: 15,
    unitsAffectStockTime: 1,
    units90Plus: 2,
    impactPercentage: 10,
  }).hasFifo90Plus,
  true,
);
assert.equal(
  classifyStockAction({
    quantityFull: 10,
    soldUnits: 5,
    daysOfStock: 15,
    unitsAffectStockTime: 1,
    units90Plus: 2,
    impactPercentage: 90,
  }).classification,
  "Provável saída pelo giro",
);
assert.equal(
  classifyStockAction({
    quantityFull: 10,
    soldUnits: 0,
    daysOfStock: null,
    unitsAffectStockTime: 1,
    units90Plus: 0,
    impactPercentage: 10,
  }).classification,
  "Prioridade alta",
);
assert.equal(
  classifyStockAction({
    quantityFull: 0,
    soldUnits: 5,
    daysOfStock: 0,
    unitsAffectStockTime: 0,
    units90Plus: 0,
    impactPercentage: null,
  }).classification,
  "Sem prioridade por Tempo de estoque",
);
const unchangedRow = makeRow({ units_91_120: 2, units_affect_stock_time: 1, days_of_stock_available_period: 15 });
const unchangedFifoAndVelocity = {
  fifo: [unchangedRow.units_0_30, unchangedRow.units_91_120, unchangedRow.units_181_plus],
  velocity: [unchangedRow.sold_units_available_period, unchangedRow.average_daily_sales_available_period],
};
classifyStockAction({
  quantityFull: unchangedRow.quantity_full,
  soldUnits: unchangedRow.sold_units_available_period,
  daysOfStock: unchangedRow.days_of_stock_available_period,
  unitsAffectStockTime: unchangedRow.units_affect_stock_time,
  units90Plus: units90Plus(unchangedRow),
  impactPercentage: impactPercentage(unchangedRow),
});
assert.deepEqual(
  {
    fifo: [unchangedRow.units_0_30, unchangedRow.units_91_120, unchangedRow.units_181_plus],
    velocity: [unchangedRow.sold_units_available_period, unchangedRow.average_daily_sales_available_period],
  },
  unchangedFifoAndVelocity,
);

const audit = buildStockPriorityAudit(rows, 70);
assert.equal(audit.rowsWithStock.length, 4);
assert.equal(audit.rowsWithoutStockWithDemand.length, 1);
assert.equal(audit.affectingRows.length, 4);
assert.equal(audit.affectingWithoutSales.length, 1);
assert.equal(audit.affectingAtMost30Days.length, 2);
assert.equal(audit.affectingOver90Days.length, 1);
assert.equal(audit.distributionByDays.find((item) => item.key === "without_sales")?.quantityFull, 20);
assert.equal(
  audit.affectingRows.reduce((sum, row) => sum + row.units_affect_stock_time, 0),
  19,
);
assert.equal(
  rows.some((row) => row.quantity_full < 0),
  false,
);
assert.equal(
  rows.some((row) => row.sold_units_14d === 0 || row.sold_units_30d === 0),
  false,
);
assert.equal(
  audit.contradictions.some((item) => item.includes("recomend")),
  false,
);

console.log("validate:stock-priority: OK");

function printRealAudit() {
  const root = process.cwd();
  const inventoryPath = path.join(root, "FULL(1).xlsx");
  const salesPath = path.join(
    root,
    "20260811_Vendas_BR_Mercado_Libre_y_Mercado_Shops_2026-08-11_14-43hs_1102986048(1).xlsx",
  );
  const inventory = parseFullInventoryXlsx(readFileSync(inventoryPath));
  const salesFile = parseSalesXlsx(readFileSync(salesPath));
  const inboundFiles = readdirSync(path.join(root, "arquivos-envios-full")).filter((file) => file.endsWith(".csv"));
  const inboundRows = inboundFiles.flatMap(
    (file) => parseInboundsCsv(readFileSync(path.join(root, "arquivos-envios-full", file))).rows,
  );
  const inboundsBySku = new Map<
    string,
    { inboundId: string; receivedAt: string | null; unitsProcessed: number | null }[]
  >();
  for (const inbound of inboundRows) {
    const list = inboundsBySku.get(inbound.skuRaw) ?? [];
    list.push({ inboundId: inbound.inboundId, receivedAt: inbound.receivedAt, unitsProcessed: inbound.unitsProcessed });
    inboundsBySku.set(inbound.skuRaw, list);
  }
  const snapshotAt = process.env.FULL_FIFO_SNAPSHOT_AT ?? statSync(inventoryPath).mtime.toISOString();
  const fifo = analyzeFullInventory({
    snapshotAt,
    snapshots: inventory.rows.map((row) => ({
      productId: null,
      productName: row.title,
      sku: row.skuRaw,
      quantityFull: row.quantityFull,
      unitsAffectStockTime: row.unitsAffectStockTime,
    })),
    inboundsBySku,
  });
  const salesBySku = new Map<string, StockVelocitySale[]>();
  for (const sale of salesFile.rows) {
    if (!sale.skuRaw) continue;
    const list = salesBySku.get(sale.skuRaw) ?? [];
    list.push({
      saleDate: sale.saleDate,
      saleStatus: sale.saleStatus,
      cancellationsRefunds: sale.cancellationsRefunds,
      quantity: sale.quantity,
      sku: sale.skuRaw,
      recordType: sale.recordType,
    });
    salesBySku.set(sale.skuRaw, list);
  }
  const rowsWithVelocity = fifo.rows.map((row) => {
    const velocity = calculateStockVelocity({
      quantityFull: row.quantity_full,
      coverageStart: "2026-08-01",
      coverageEndComplete: "2026-08-10",
      sales: salesBySku.get(row.sku) ?? [],
    });
    return {
      ...row,
      sold_units_available_period: velocity.soldUnits,
      average_daily_sales_available_period: velocity.averageDailySales,
      days_of_stock_available_period: velocity.estimatedDaysOfStock,
      sales_days_observed_available_period: velocity.salesDaysWithActivity,
      sold_units_7d: null,
      average_daily_sales_7d: null,
      days_of_stock_7d: null,
      sold_units_14d: null,
      days_of_stock_14d: null,
      sold_units_30d: null,
      days_of_stock_30d: null,
      sales_velocity_change_percentage: null,
      velocity_status:
        row.quantity_full > 0 && velocity.soldUnits === 0 ? "Sem venda no período" : "Estoque com demanda",
    } satisfies FullFifoVelocitySkuAnalysis;
  });
  const audit = buildStockPriorityAudit(rowsWithVelocity, fifo.summary.quantityFull);
  const top20 = audit.classifiedRows
    .filter((row) => row.quantity_full > 0 && row.classification === "Prioridade alta")
    .map((row) => ({
      sku: row.sku,
      produto: row.product_name,
      estoque: row.quantity_full,
      vendas10d: row.sold_units_available_period,
      mediaDia: row.average_daily_sales_available_period,
      diasEstoque: row.days_of_stock_available_period,
      idadeMedia: row.weighted_average_age_days,
      fifo90Mais: units90Plus(row),
      afetaTempo: row.units_affect_stock_time,
      impactoPercentual: row.impact_percentage,
      classificacao: row.classification,
      motivo: row.reason,
      possuiFifo90Mais: row.hasFifo90Plus,
    }))
    .sort((left, right) => right.afetaTempo - left.afetaTempo || left.sku.localeCompare(right.sku))
    .slice(0, 20);
  const byClassification = Object.fromEntries(
    ["Prioridade alta", "Atenção", "Monitorar", "Provável saída pelo giro"].map((classification) => [
      classification,
      audit.classifiedRows.filter((row) => row.classification === classification),
    ]),
  );
  console.log("\nAUDITORIA REAL DOS FIXTURES (somente leitura)");
  console.log(
    JSON.stringify(
      {
        snapshotAt,
        salesRows: salesFile.rows.length,
        validSalesUnits: rowsWithVelocity.reduce((sum, row) => sum + row.sold_units_available_period, 0),
        skusWithSales: audit.rowsWithStock.filter((row) => row.sold_units_available_period > 0).length,
        skusWithoutSales: audit.rowsWithStock.filter((row) => row.sold_units_available_period === 0).length,
        distributionByDays: audit.distributionByDays,
        volumeDistribution: audit.volumeDistribution,
        affectingSkuCount: audit.affectingRows.length,
        affectingUnits: audit.affectingRows.reduce((sum, row) => sum + row.units_affect_stock_time, 0),
        classes: audit.classificationSummary,
        top20PrioridadeAlta: top20,
        prioridadeAltaSemVenda: audit.classifiedRows
          .filter((row) => row.classification === "Prioridade alta" && row.sold_units_available_period === 0)
          .map((row) => row.sku),
        prioridadeAltaMais90Dias: audit.classifiedRows
          .filter((row) => row.classification === "Prioridade alta" && (row.days_of_stock_available_period ?? 0) > 90)
          .map((row) => row.sku),
        fifo90MaisPorClasse: Object.fromEntries(
          Object.entries(byClassification).map(([classification, classRows]) => [
            classification,
            (classRows as typeof audit.classifiedRows).filter((row) => row.hasFifo90Plus).map((row) => row.sku),
          ]),
        ),
        outOfStockWithDemand: audit.rowsWithoutStockWithDemand.map((row) => ({
          sku: row.sku,
          produto: row.product_name,
          vendas10d: row.sold_units_available_period,
          mediaDia: row.average_daily_sales_available_period,
        })),
        coverageOver60: audit.over60Days,
        coverageOver90: audit.over90Days,
        coverageOver120: audit.over120Days,
        contradictions: audit.contradictions,
      },
      null,
      2,
    ),
  );
}

printRealAudit();
