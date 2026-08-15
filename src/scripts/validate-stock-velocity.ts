import {
  calculateAvailablePeriodVelocity,
  calculateStockVelocity,
  calculateTrend,
  type StockVelocitySale,
  saleBusinessDate,
} from "../app/(main)/dashboard/estoque-full/_lib/stock-velocity";
import assert from "node:assert/strict";

const sale = (day: string, quantity: number, overrides: Partial<StockVelocitySale> = {}): StockVelocitySale => ({
  saleDate: `${day}T12:00:00.000Z`,
  recordType: "sale_item",
  quantity,
  sku: "SKU-1",
  ...overrides,
});

const period = (sales: readonly StockVelocitySale[], start = "2026-08-01", end = "2026-08-10") =>
  calculateStockVelocity({ quantityFull: 100, coverageStart: start, coverageEndComplete: end, sales });

assert.equal(period([sale("2026-08-01", 10)], "2026-08-01", "2026-08-01").calendarDays, 1);
assert.equal(period([sale("2026-08-01", 7)], "2026-08-01", "2026-08-07").calendarDays, 7);
assert.equal(period([sale("2026-08-01", 30)], "2026-08-01", "2026-08-30").calendarDays, 30);
assert.equal(
  period(Array.from({ length: 10 }, (_, index) => sale(`2026-08-${String(index + 1).padStart(2, "0")}`, 2))).soldUnits,
  20,
);
assert.equal(period([sale("2026-08-05", 20)]).averageDailySales, 2, "dias sem venda entram no denominador");
assert.equal(period([]).averageDailySales, 0);
assert.equal(period([]).estimatedDaysOfStock, null);
assert.equal(saleBusinessDate("2026-08-11T01:30:00Z"), "2026-08-10");
assert.equal(saleBusinessDate("2026-08-11T02:59:59Z"), "2026-08-10");
assert.equal(saleBusinessDate("2026-08-11T03:00:00Z"), "2026-08-11");
assert.equal(
  period([{ ...sale("2026-08-11", 1), saleDate: "2026-08-11T01:30:00Z" }]).soldUnits,
  1,
  "coverageEndComplete inclui venda ainda pertencente ao dia 10 em São Paulo",
);
assert.equal(
  period([{ ...sale("2026-08-11", 1), saleDate: "2026-08-11T03:00:00Z" }]).soldUnits,
  0,
  "coverageEndComplete exclui venda pertencente ao dia 11 em São Paulo",
);
assert.equal(
  calculateAvailablePeriodVelocity(
    100,
    "2026-08-01",
    "2026-08-10",
    [{ ...sale("2026-08-11", 1), saleDate: "2026-08-11T01:30:00Z" }],
    7,
  )?.soldUnits,
  1,
  "últimos 7 dias usam o dia de negócio em São Paulo",
);
assert.equal(period([sale("2026-08-01", 20)], "2026-08-01", "2026-08-10").estimatedDaysOfStock, 50);
assert.equal(period([sale("2026-08-01", 20)], "2026-08-01", "2026-08-10").salesDaysWithActivity, 1);
assert.equal(
  calculateStockVelocity({
    ...{ quantityFull: 0, coverageStart: "2026-08-01", coverageEndComplete: "2026-08-01" },
    sales: [sale("2026-08-01", 2)],
  }).estimatedDaysOfStock,
  0,
);

const excluded = [
  sale("2026-08-01", 1, { recordType: "package_summary" }),
  sale("2026-08-01", 1, { recordType: "exchange_summary" }),
  sale("2026-08-01", 1, { saleStatus: "Cancelada pelo comprador" }),
  sale("2026-08-01", 1, { saleStatus: "Venda cancelada. Não envie." }),
  sale("2026-08-01", 1, { saleStatus: "Pacote cancelado pelo Mercado Livre" }),
  sale("2026-08-01", 1, { cancellationsRefunds: -0.01 }),
  sale("2026-08-01", 1, { quantity: null }),
  sale("2026-08-01", 1.5),
  sale("2026-08-01", 1, { sku: null }),
];
assert.equal(period(excluded).soldUnits, 0, "resumos, cancelamentos e linhas inválidas não contam");
assert.equal(
  period([
    sale("2026-08-01", 1, { saleStatus: "A caminho" }),
    sale("2026-08-02", 1, { saleStatus: "Processando no centro de distribuição" }),
    sale("2026-08-03", 1, { saleStatus: "Entregue" }),
    sale("2026-08-04", 1, { saleStatus: "Devolução em preparação" }),
  ]).soldUnits,
  4,
);
assert.equal(period([sale("2026-08-01", 2), sale("2026-08-01", 3, { sku: "SKU-2" })]).soldUnits, 5);
assert.equal(period([sale("2026-08-01", 2, { sku: "SKU-1" }), sale("2026-08-01", 3, { sku: "SKU-1" })]).soldUnits, 5);

const tenDays = Array.from({ length: 10 }, (_, index) => sale(`2026-08-${String(index + 1).padStart(2, "0")}`, 1));
assert.equal(calculateAvailablePeriodVelocity(100, "2026-08-01", "2026-08-10", tenDays, 7)?.soldUnits, 7);
assert.equal(calculateAvailablePeriodVelocity(100, "2026-08-01", "2026-08-10", tenDays, 14), null);
assert.equal(calculateAvailablePeriodVelocity(100, "2026-08-01", "2026-08-10", tenDays, 30), null);
assert.equal(calculateTrend(tenDays, "2026-08-01", "2026-08-10"), null);
assert.equal(
  calculateStockVelocity({
    quantityFull: 100,
    coverageStart: "2026-08-01",
    coverageEndComplete: "2026-08-10",
    sales: [...tenDays, sale("2026-08-11", 999)],
  }).soldUnits,
  10,
);

const fourteenDays = Array.from({ length: 14 }, (_, index) =>
  sale(`2026-08-${String(index + 1).padStart(2, "0")}`, index < 7 ? 10 : 20),
);
assert.equal(calculateTrend(fourteenDays, "2026-08-01", "2026-08-14"), 100);
assert.equal(
  calculateStockVelocity({ quantityFull: 0, coverageStart: "2026-08-01", coverageEndComplete: "2026-08-10", sales: [] })
    .soldUnits,
  0,
);

console.log("38 cenários de velocidade de vendas, timezone e exclusões: OK");
