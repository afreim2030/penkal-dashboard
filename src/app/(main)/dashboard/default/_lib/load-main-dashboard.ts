import { loadFullInboundsDashboard } from "@/app/(main)/dashboard/envios-full/_lib/load-full-inbounds-dashboard";
import { loadProductsDashboard } from "@/app/(main)/dashboard/produtos/_lib/load-products-dashboard";
import { loadSalesDashboard } from "@/app/(main)/dashboard/vendas/_lib/load-sales-dashboard";
import { loadAlertsDashboard } from "@/app/(main)/dashboard/alertas/_lib/load-alerts-dashboard";

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function validDate(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function endOfMonth(date: string) {
  const value = new Date(`${date.slice(0, 8)}01T12:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + 1, 0);
  return value.toISOString().slice(0, 10);
}

function buildMonthComparison(sales: NonNullable<Awaited<ReturnType<typeof loadSalesDashboard>>>, requestedStart?: string, requestedEnd?: string) {
  const asOf = sales.coverage.maxCompleteDate;
  if (!asOf) return null;
  const defaultStart = `${asOf.slice(0, 8)}01`;
  const defaultEnd = endOfMonth(asOf);
  const start = validDate(requestedStart) ? requestedStart! : defaultStart;
  const end = validDate(requestedEnd) && requestedEnd! >= start ? requestedEnd! : defaultEnd;
  const days = Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000) + 1;
  const previousStart = shiftDate(start, -days);
  const completeRevenue = new Map(sales.daily.filter((row) => row.coverageStatus === "complete" && row.date).map((row) => [row.date as string, row.revenue]));
  const daily = Array.from({ length: days }, (_, index) => {
    const date = shiftDate(start, index);
    const previousDate = shiftDate(previousStart, index);
    return { date, label: date.slice(8, 10) + "/" + date.slice(5, 7), current: date <= asOf ? completeRevenue.get(date) ?? 0 : null, previous: completeRevenue.get(previousDate) ?? 0 };
  });
  const currentRevenue = daily.reduce((sum, row) => sum + (row.current ?? 0), 0);
  const previousRevenue = daily.reduce((sum, row) => sum + row.previous, 0);
  return { asOf, start, end, previousStart, previousEnd: shiftDate(start, -1), currentRevenue, previousRevenue, daily };
}

export async function loadMainDashboard(filters: { start?: string; end?: string } = {}) {
  const [sales, products, inbounds, alerts] = await Promise.all([
    loadSalesDashboard(),
    loadProductsDashboard(),
    loadFullInboundsDashboard(),
    loadAlertsDashboard(),
  ]);

  if (!sales || !products || !inbounds) return null;

  const fullStock = products.products.reduce((sum, product) => sum + product.fullStock, 0);
  const affectedProducts = products.products
    .filter((product) => product.stockTimeAffected > 0)
    .sort((left, right) => right.stockTimeAffected - left.stockTimeAffected)
    .slice(0, 8);

  return {
    sales,
    monthComparison: buildMonthComparison(sales, filters.start, filters.end),
    products,
    inbounds,
    alerts,
    fullStock,
    affectedProducts,
  };
}

export type MainDashboardData = NonNullable<Awaited<ReturnType<typeof loadMainDashboard>>>;
