import {
  estimateFullInventoryFifo,
  FULL_FIFO_BUCKET_KEYS,
  type FullFifoInbound,
} from "../app/(main)/dashboard/estoque-full/_lib/full-fifo";
import { analyzeFullInventory } from "../app/(main)/dashboard/estoque-full/_lib/full-fifo-analysis";
import { parseFullInventoryXlsx } from "../app/(main)/importar-dados/_lib/parse-full-inventory-xlsx";
import { parseInboundsCsv } from "../app/(main)/importar-dados/_lib/parse-inbounds-csv";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const DAY = 86_400_000;
const reference = "2026-08-15T12:00:00.000Z";
const atAge = (days: number) => new Date(Date.parse(reference) - days * DAY).toISOString();
const inbound = (inboundId: string, days: number, unitsProcessed: number | null): FullFifoInbound => ({
  inboundId,
  receivedAt: atAge(days),
  unitsProcessed,
});
const fifo = (currentQuantity: number, inbounds: FullFifoInbound[], snapshotAt = reference) =>
  estimateFullInventoryFifo({ currentQuantity, snapshotAt, inbounds });

function assertConservation(currentQuantity: number, result: ReturnType<typeof fifo>) {
  assert.equal(result.knownAgeQuantity + result.unknownAgeQuantity, currentQuantity);
  assert.equal(
    FULL_FIFO_BUCKET_KEYS.reduce((total, key) => total + result.buckets[key], 0),
    currentQuantity,
  );
  assert.equal(
    result.allocations.reduce((total, allocation) => total + allocation.allocatedQuantity, 0),
    result.knownAgeQuantity,
  );
  for (const allocation of result.allocations) {
    assert.ok(allocation.allocatedQuantity <= allocation.unitsProcessed);
    assert.ok(allocation.allocatedQuantity >= 0);
  }
}

const zero = fifo(0, [inbound("A", 10, 20)]);
assert.equal(zero.coveragePercentage, null, "1. estoque zero deve ter cobertura nula");
assertConservation(0, zero);

const oneLot = fifo(10, [inbound("A", 10, 20)]);
assert.equal(oneLot.allocations[0].allocatedQuantity, 10, "2/5. lote mais recente pode ser parcialmente alocado");

const manyLots = fifo(120, [inbound("old", 66, 80), inbound("new", 36, 100), inbound("newest", 27, 50)]);
assert.deepEqual(
  manyLots.allocations.map(({ inboundId, allocatedQuantity }) => [inboundId, allocatedQuantity]),
  [
    ["newest", 50],
    ["new", 70],
  ],
  "3/4. FIFO deve reconstruir os lotes de trás para frente",
);

const equalHistory = fifo(30, [inbound("A", 10, 10), inbound("B", 20, 20)]);
assert.equal(equalHistory.knownAgeQuantity, 30, "6. estoque igual ao histórico deve ter cobertura completa");
assert.equal(equalHistory.coveragePercentage, 100);

const insufficient = fifo(50, [inbound("A", 10, 20)]);
assert.equal(insufficient.knownAgeQuantity, 20, "7. histórico insuficiente deve preservar apenas a parte conhecida");
assert.equal(insufficient.unknownAgeQuantity, 30);
assert.equal(insufficient.buckets.units_unknown, 30, "20. desconhecido deve ocupar faixa própria");
assert.equal(insufficient.coveragePercentage, 40, "23. cobertura deve usar estoque atual como denominador");

const noHistory = fifo(12, []);
assert.equal(noHistory.knownAgeQuantity, 0, "8. SKU sem histórico não deve ganhar data inventada");
assert.equal(noHistory.unknownAgeQuantity, 12);

const nullProcessed = fifo(12, [inbound("null", 10, null)]);
assert.equal(nullProcessed.knownAgeQuantity, 0, "9. units_processed null não pode ser inventado");
assert.equal(nullProcessed.coverageProblemCount, 1);

const zeroUnits = fifo(12, [inbound("zero", 10, 0)]);
assert.equal(zeroUnits.knownAgeQuantity, 0, "10. lote de zero unidades não pode ser alocado");

const dates = fifo(2, [inbound("day-2", 2, 1), inbound("day-1", 1, 1)]);
assert.deepEqual(
  dates.allocations.map(({ ageDays }) => ageDays),
  [1, 2],
  "11/12. idade deve usar dias completos",
);
assert.equal(dates.weightedAverageAgeDays, 1.5, "13. média deve ser ponderada pelas unidades conhecidas");

for (const [age, key] of [
  [30, "units_0_30"],
  [31, "units_31_60"],
  [61, "units_61_90"],
  [91, "units_91_120"],
  [121, "units_121_180"],
  [181, "units_181_plus"],
] as const) {
  const result = fifo(1, [inbound(String(age), age, 1)]);
  assert.equal(result.buckets[key], 1, `14–19. idade ${age} deve cair em ${key}`);
  assertConservation(1, result);
}

const unordered = fifo(15, [inbound("old", 100, 10), inbound("new", 5, 10), inbound("middle", 50, 10)]);
assert.deepEqual(
  unordered.allocations.map(({ inboundId }) => inboundId),
  ["new", "middle"],
  "24. deve ordenar por data",
);

const alternateQuantities = [
  {
    inboundId: "only-processed",
    receivedAt: atAge(5),
    unitsProcessed: 3,
    unitsDeclared: 999,
    unitsSellable: 888,
  },
];
assert.equal(
  estimateFullInventoryFifo({ currentQuantity: 10, snapshotAt: reference, inbounds: alternateQuantities })
    .knownAgeQuantity,
  3,
  "25/26. não deve usar units_declared nem units_sellable",
);

const fixedReference = fifo(1, [{ inboundId: "fixed", receivedAt: "2026-08-14T12:00:00.000Z", unitsProcessed: 1 }]);
assert.equal(fixedReference.allocations[0].ageDays, 1, "27. não deve usar a data atual");

const source = [inbound("B", 30, 5), inbound("A", 10, 5)];
const sourceCopy = structuredClone(source);
fifo(6, source);
assert.deepEqual(source, sourceCopy, "28. não deve alterar os dados de origem");
assertConservation(120, manyLots);
assertConservation(50, insufficient);

function validateFixtures() {
  const root = process.cwd();
  const inventoryPath = path.join(root, "FULL(1).xlsx");
  const inboundsDirectory = path.join(root, "arquivos-envios-full");
  const parsedInventory = parseFullInventoryXlsx(readFileSync(inventoryPath));
  assert.equal(parsedInventory.problems.filter((problem) => problem.severity === "error").length, 0);
  const inboundFiles = readdirSync(inboundsDirectory)
    .filter((file) => file.endsWith(".csv"))
    .sort();
  const inboundRows = inboundFiles.flatMap((file) => {
    const parsed = parseInboundsCsv(readFileSync(path.join(inboundsDirectory, file)));
    assert.equal(parsed.problems.filter((problem) => problem.severity === "error").length, 0, file);
    return parsed.rows;
  });
  const logicalInbounds = new Map<string, (typeof inboundRows)[number]>();
  for (const row of inboundRows) logicalInbounds.set(`${row.inboundId}\u001f${row.skuRaw}`, row);
  const inboundsBySku = new Map<string, FullFifoInbound[]>();
  for (const row of logicalInbounds.values()) {
    const rows = inboundsBySku.get(row.skuRaw) ?? [];
    rows.push({ inboundId: row.inboundId, receivedAt: row.receivedAt, unitsProcessed: row.unitsProcessed });
    inboundsBySku.set(row.skuRaw, rows);
  }
  const snapshotAt = process.env.FULL_FIFO_SNAPSHOT_AT ?? statSync(inventoryPath).mtime.toISOString();
  const analysis = analyzeFullInventory({
    snapshotAt,
    snapshots: parsedInventory.rows.map((row) => ({
      productId: null,
      productName: row.title,
      sku: row.skuRaw,
      quantityFull: row.quantityFull,
      unitsAffectStockTime: row.unitsAffectStockTime,
    })),
    inboundsBySku,
  });
  for (const row of analysis.rows)
    assertConservation(row.quantity_full, {
      allocations: row.allocations,
      knownAgeQuantity: row.known_age_quantity,
      unknownAgeQuantity: row.unknown_age_quantity,
      coveragePercentage: row.coverage_percentage,
      weightedAverageAgeDays: row.weighted_average_age_days,
      oldestKnownRemainingReceivedAt: row.oldest_known_remaining_received_at,
      newestKnownRemainingReceivedAt: row.newest_known_remaining_received_at,
      buckets: Object.fromEntries(FULL_FIFO_BUCKET_KEYS.map((key) => [key, row[key]])) as Record<
        (typeof FULL_FIFO_BUCKET_KEYS)[number],
        number
      >,
      coverageProblemCount: row.coverage_problem_count,
    });
  assert.equal(analysis.summary.quantityFull, 4_052, "A soma das faixas dos fixtures deve ser 4.052");
  assert.equal(analysis.summary.skusWithStock, 114, "Os fixtures devem conter 114 SKUs com estoque");
  assert.equal(
    analysis.summary.unitsAffectStockTime,
    418,
    "Os fixtures devem conter 418 unidades que afetam Tempo de estoque",
  );
  const top20 = analysis.rows
    .map((row) => ({
      sku: row.sku,
      product: row.product_name,
      units90Plus: row.units_91_120 + row.units_121_180 + row.units_181_plus,
    }))
    .sort((left, right) => right.units90Plus - left.units90Plus || left.sku.localeCompare(right.sku))
    .slice(0, 20);
  const report = {
    snapshotAt,
    inventoryRows: parsedInventory.rows.length,
    inboundRows: logicalInbounds.size,
    inboundShipments: new Set([...logicalInbounds.values()].map((row) => row.inboundId)).size,
    uniqueInboundSkus: new Set([...logicalInbounds.values()].map((row) => row.skuRaw)).size,
    summary: analysis.summary,
    top20,
    details: top20.slice(0, 5).map(({ sku }) => {
      const row = analysis.rows.find((item) => item.sku === sku) as (typeof analysis.rows)[number];
      return { sku, quantityFull: row.quantity_full, unknown: row.unknown_age_quantity, allocations: row.allocations };
    }),
  };
  console.log("\nVALIDAÇÃO DOS FIXTURES REAIS (somente leitura)");
  console.log(JSON.stringify(report, null, 2));
}

console.log("28 cenários e invariantes da função FIFO: OK");
validateFixtures();
