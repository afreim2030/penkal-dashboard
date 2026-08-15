import { Temporal } from "temporal-polyfill";

const SALES_TIME_ZONE = "America/Sao_Paulo";

const CANCELLED_STATUSES = new Set([
  "Cancelada pelo comprador",
  "Venda cancelada. Não envie.",
  "Pacote cancelado pelo Mercado Livre",
]);

export interface StockVelocitySale {
  saleDate: string;
  recordType: string;
  quantity: number | null;
  sku: string | null;
  saleStatus?: string | null;
  cancellationsRefunds?: number | null;
}

export interface StockVelocityInput {
  quantityFull: number;
  coverageStart: string;
  coverageEndComplete: string;
  sales: readonly StockVelocitySale[];
}

export interface StockVelocityResult {
  soldUnits: number;
  calendarDays: number;
  salesDaysWithActivity: number;
  averageDailySales: number;
  estimatedDaysOfStock: number | null;
}

export function saleBusinessDate(saleDate: string): string | null {
  try {
    return Temporal.Instant.from(saleDate).toZonedDateTimeISO(SALES_TIME_ZONE).toPlainDate().toString();
  } catch {
    return null;
  }
}

export function calendarDaysBetween(start: string, end: string): number {
  return Temporal.PlainDate.from(start).until(Temporal.PlainDate.from(end)).days + 1;
}

export function addCalendarDays(value: string, days: number): string {
  return Temporal.PlainDate.from(value).add({ days }).toString();
}

export function isValidStockSale(sale: StockVelocitySale): boolean {
  if (sale.recordType !== "sale_item" || sale.quantity === null) return false;
  if (!Number.isInteger(sale.quantity) || sale.quantity <= 0 || !sale.sku) return false;
  if (CANCELLED_STATUSES.has(sale.saleStatus ?? "")) return false;
  if ((sale.cancellationsRefunds ?? 0) < 0) return false;
  return saleBusinessDate(sale.saleDate) !== null;
}

export function calculateStockVelocity(input: StockVelocityInput): StockVelocityResult {
  const calendarDays = calendarDaysBetween(input.coverageStart, input.coverageEndComplete);
  const activityDays = new Set<string>();
  let soldUnits = 0;

  for (const sale of input.sales) {
    if (!isValidStockSale(sale)) continue;
    const saleDay = saleBusinessDate(sale.saleDate) as string;
    if (saleDay < input.coverageStart || saleDay > input.coverageEndComplete) continue;
    soldUnits += sale.quantity as number;
    activityDays.add(saleDay);
  }

  const averageDailySales = soldUnits / calendarDays;
  return {
    soldUnits,
    calendarDays,
    salesDaysWithActivity: activityDays.size,
    averageDailySales,
    estimatedDaysOfStock: averageDailySales > 0 ? input.quantityFull / averageDailySales : null,
  };
}

export function calculateAvailablePeriodVelocity(
  quantityFull: number,
  coverageStart: string,
  coverageEndComplete: string,
  sales: readonly StockVelocitySale[],
  days: number,
): StockVelocityResult | null {
  if (calendarDaysBetween(coverageStart, coverageEndComplete) < days) return null;
  const periodStart = addCalendarDays(coverageEndComplete, -(days - 1));
  return calculateStockVelocity({ quantityFull, coverageStart: periodStart, coverageEndComplete, sales });
}

export function calculateTrend(
  sales: readonly StockVelocitySale[],
  coverageStart: string,
  coverageEndComplete: string,
): number | null {
  if (calendarDaysBetween(coverageStart, coverageEndComplete) < 14) return null;
  const recentStart = addCalendarDays(coverageEndComplete, -6);
  const previousEnd = addCalendarDays(recentStart, -1);
  const previousStart = addCalendarDays(previousEnd, -6);
  const recent = calculateStockVelocity({ quantityFull: 0, coverageStart: recentStart, coverageEndComplete, sales });
  const previous = calculateStockVelocity({
    quantityFull: 0,
    coverageStart: previousStart,
    coverageEndComplete: previousEnd,
    sales,
  });
  if (previous.soldUnits === 0) return recent.soldUnits === 0 ? 0 : null;
  return ((recent.soldUnits - previous.soldUnits) / previous.soldUnits) * 100;
}
