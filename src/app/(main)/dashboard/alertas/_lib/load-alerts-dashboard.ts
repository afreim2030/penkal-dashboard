import { loadFullInboundsDashboard } from "@/app/(main)/dashboard/envios-full/_lib/load-full-inbounds-dashboard";
import { loadProductsDashboard } from "@/app/(main)/dashboard/produtos/_lib/load-products-dashboard";
import { loadPerformanceDashboard } from "@/app/(main)/dashboard/performance/_lib/load-performance-dashboard";
import { createClient } from "@/lib/supabase/server";

export type OperationalAlertSeverity = "critical" | "warning" | "info";
export interface OperationalAlert { id: string; severity: OperationalAlertSeverity; category: "Vendas" | "Estoque FULL" | "Envios FULL" | "Publicidade"; title: string; description: string; href: string; value?: string }
export interface AlertsDashboardData { summary: { critical: number; warning: number; info: number; total: number }; alerts: OperationalAlert[]; resolved: { alertKey: string; resolvedAt: string }[] }

export async function loadAlertsDashboard(): Promise<AlertsDashboardData> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) throw new Error("Usuário não autenticado.");
  const [products, performance, inbounds, conflictsResult, campaignsResult] = await Promise.all([
    loadProductsDashboard(), loadPerformanceDashboard(), loadFullInboundsDashboard(),
    supabase.from("sales_import_conflicts").select("id, conflict_type, sale_number, sku_raw, mlb_raw, created_at").is("resolved_at", null).order("created_at", { ascending: false }).limit(20),
    supabase.rpc("get_campaign_history_data"),
  ]);
  const alerts: OperationalAlert[] = [];
  for (const conflict of conflictsResult.data ?? []) alerts.push({ id: `sales-conflict-${conflict.id}`, severity: "critical", category: "Vendas", title: "Conflito de importação de venda", description: [conflict.sale_number ? `Venda ${conflict.sale_number}` : null, conflict.sku_raw ? `SKU ${conflict.sku_raw}` : null, conflict.conflict_type].filter(Boolean).join(" · "), href: "/importar-dados" });
  const lowStock = (products?.products ?? []).filter((product) => product.fullStock > 0 && product.stockDays !== null && product.stockDays <= 14).sort((left, right) => (left.stockDays ?? 99) - (right.stockDays ?? 99)).slice(0, 20);
  for (const product of lowStock) alerts.push({ id: `full-rupture-${product.sku}`, severity: (product.stockDays ?? 99) <= 7 ? "critical" : "warning", category: "Estoque FULL", title: `Risco de ruptura: ${product.sku}`, description: `${product.name} · ${product.fullStock} un. no FULL`, value: `${product.stockDays} dias`, href: "/dashboard/reposicao-full" });
  const stopped = (products?.products ?? []).filter((product) => product.fullStock > 0 && (product.daysSinceSale ?? 0) >= 30).sort((a,b)=>(b.daysSinceSale??0)-(a.daysSinceSale??0)).slice(0, 15);
  for (const product of stopped) alerts.push({ id: `full-stopped-${product.sku}`, severity: "warning", category: "Estoque FULL", title: `Produto parado com estoque FULL: ${product.sku}`, description: `${product.name} · ainda possui ${product.fullStock} un.`, value: `${product.daysSinceSale} dias sem vender`, href: "/dashboard/produtos" });
  for (const inbound of (inbounds?.inbounds ?? []).filter((row) => row.hasDifference).slice(0, 20)) alerts.push({ id: `inbound-difference-${inbound.inboundId}`, severity: "info", category: "Envios FULL", title: `Diferença no envio ${inbound.inboundId}`, description: `${inbound.declared} declaradas · ${inbound.processed} processadas`, value: `${inbound.difference > 0 ? "+" : ""}${inbound.difference} un.`, href: "/dashboard/envios-full" });

  const campaignData = campaignsResult.data as { campaigns?: Array<{ campaignName: string; daysWithoutChange: number; acos: number | null; roas: number | null }> } | null;
  for (const campaign of (campaignData?.campaigns ?? []).filter((row) => row.daysWithoutChange >= 14).slice(0, 20)) {
    alerts.push({ id: `campaign-stale-${campaign.campaignName}`, severity: "warning", category: "Publicidade", title: "Campanha sem alteração há 14+ dias", description: campaign.campaignName, value: `${campaign.daysWithoutChange} dias`, href: "/dashboard/publicidade" });
  }
  for (const campaign of (campaignData?.campaigns ?? []).filter((row) => row.acos !== null && row.acos >= 0.35).slice(0, 15)) {
    alerts.push({ id: `campaign-acos-${campaign.campaignName}`, severity: "warning", category: "Publicidade", title: "ACOS alto: revisar campanha", description: campaign.campaignName, value: `${((campaign.acos ?? 0) * 100).toFixed(1).replace(".", ",")}%`, href: "/dashboard/publicidade" });
  }
  for (const row of (performance?.visitsWithoutSales ?? []).filter((row) => row.visits >= 20).slice(0, 15)) {
    alerts.push({ id: `visits-no-sales-${row.mlb ?? row.sku ?? "unknown"}`, severity: "warning", category: "Vendas", title: "Visitas sem vendas", description: `${row.productName ?? row.mlb ?? "Anúncio não vinculado"} · ${row.visits} visitas no período`, value: "0 vendas", href: "/dashboard/performance" });
  }

  if (alerts.length > 0) {
    const { error } = await supabase.from("operational_tasks").upsert(alerts.map((alert) => ({ alert_key: alert.id, created_by: authData.user.id, title: alert.title, description: alert.description, category: alert.category, priority: alert.severity === "critical" ? "critical" : alert.severity === "warning" ? "high" : "medium", status: "pending" })), { onConflict: "alert_key", ignoreDuplicates: true });
    if (error) throw new Error(`Não foi possível sincronizar os alertas com as tarefas: ${error.message}`);
  }
  const { data: resolved } = await supabase.from("alert_resolutions").select("alert_key, resolved_at").order("resolved_at", { ascending: false });
  const resolvedItems = (resolved ?? []).map((row) => ({ alertKey: row.alert_key, resolvedAt: row.resolved_at }));
  const resolvedKeys = new Set(resolvedItems.map((row) => row.alertKey));
  const visibleAlerts = alerts.filter((alert) => !resolvedKeys.has(alert.id));
  const summary = { critical: visibleAlerts.filter((alert) => alert.severity === "critical").length, warning: visibleAlerts.filter((alert) => alert.severity === "warning").length, info: visibleAlerts.filter((alert) => alert.severity === "info").length, total: visibleAlerts.length };
  return { summary, alerts: visibleAlerts, resolved: resolvedItems };
}
