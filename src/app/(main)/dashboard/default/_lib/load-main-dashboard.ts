import { loadFullInboundsDashboard } from "@/app/(main)/dashboard/envios-full/_lib/load-full-inbounds-dashboard";
import { loadProductsDashboard } from "@/app/(main)/dashboard/produtos/_lib/load-products-dashboard";
import { loadSalesDashboard } from "@/app/(main)/dashboard/vendas/_lib/load-sales-dashboard";
import { loadAlertsDashboard } from "@/app/(main)/dashboard/alertas/_lib/load-alerts-dashboard";

function shiftMonthStart(date: string) {
  const value = new Date(`${date.slice(0, 8)}01T12:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() - 1);
  return value.toISOString().slice(0, 10);
}

function buildMonthComparison(sales: NonNullable<Awaited<ReturnType<typeof loadSalesDashboard>>>) {
  const asOf = sales.coverage.maxCompleteDate;
  if (!asOf) return null;
  const currentMonthStart = `${asOf.slice(0, 8)}01`;
  const previousMonthStart = shiftMonthStart(asOf);
  const dayCount = Number(asOf.slice(-2));
  const completeRevenue = new Map(sales.daily.filter((row) => row.coverageStatus === "complete" && row.date).map((row) => [row.date as string, row.revenue]));
  let currentCumulative = 0;
  let previousCumulative = 0;
  const daily = Array.from({ length: dayCount }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    currentCumulative += completeRevenue.get(`${currentMonthStart.slice(0, 8)}${day}`) ?? 0;
    previousCumulative += completeRevenue.get(`${previousMonthStart.slice(0, 8)}${day}`) ?? 0;
    return { day: index + 1, current: currentCumulative, previous: previousCumulative };
  });
  return { asOf, currentMonthStart, previousMonthStart, currentRevenue: currentCumulative, previousRevenue: previousCumulative, daily };
}


export async function loadMainDashboard() {
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
    monthComparison: buildMonthComparison(sales),
    products,
    inbounds,
    alerts,
    fullStock,
    affectedProducts,
  };
}

export type MainDashboardData = NonNullable<Awaited<ReturnType<typeof loadMainDashboard>>>;
