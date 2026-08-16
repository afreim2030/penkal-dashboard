import { loadFullInboundsDashboard } from "@/app/(main)/dashboard/envios-full/_lib/load-full-inbounds-dashboard";
import { loadProductsDashboard } from "@/app/(main)/dashboard/produtos/_lib/load-products-dashboard";
import { loadSalesDashboard } from "@/app/(main)/dashboard/vendas/_lib/load-sales-dashboard";

export async function loadMainDashboard() {
  const [sales, products, inbounds] = await Promise.all([
    loadSalesDashboard(),
    loadProductsDashboard(),
    loadFullInboundsDashboard(),
  ]);

  if (!sales || !products || !inbounds) return null;

  const fullStock = products.products.reduce((sum, product) => sum + product.fullStock, 0);
  const affectedProducts = products.products
    .filter((product) => product.stockTimeAffected > 0)
    .sort((left, right) => right.stockTimeAffected - left.stockTimeAffected)
    .slice(0, 8);

  return {
    sales,
    products,
    inbounds,
    fullStock,
    affectedProducts,
  };
}

export type MainDashboardData = NonNullable<Awaited<ReturnType<typeof loadMainDashboard>>>;
