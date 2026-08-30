import { loadFullInboundsDashboard } from "@/app/(main)/dashboard/envios-full/_lib/load-full-inbounds-dashboard";
import { loadProductsDashboard } from "@/app/(main)/dashboard/produtos/_lib/load-products-dashboard";
import { createClient } from "@/lib/supabase/server";

export type OperationalAlertSeverity = "critical" | "warning" | "info";
export interface OperationalAlert {
  id: string;
  severity: OperationalAlertSeverity;
  category: "Vendas" | "Estoque FULL" | "Envios FULL";
  title: string;
  description: string;
  href: string;
  value?: string;
}
export interface AlertsDashboardData {
  summary: { critical: number; warning: number; info: number; total: number };
  alerts: OperationalAlert[];
  resolved: { alertKey: string; resolvedAt: string }[];
}

export async function loadAlertsDashboard(): Promise<AlertsDashboardData> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) throw new Error("Usuário não autenticado.");

  const [products, inbounds, conflictsResult] = await Promise.all([
    loadProductsDashboard(),
    loadFullInboundsDashboard(),
    supabase
      .from("sales_import_conflicts")
      .select("id, conflict_type, sale_number, sku_raw, mlb_raw, created_at")
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  const alerts: OperationalAlert[] = [];

  for (const conflict of conflictsResult.data ?? []) {
    alerts.push({
      id: `sales-conflict-${conflict.id}`,
      severity: "critical",
      category: "Vendas",
      title: "Conflito de importação de venda",
      description: [
        conflict.sale_number ? `Venda ${conflict.sale_number}` : null,
        conflict.sku_raw ? `SKU ${conflict.sku_raw}` : null,
        conflict.conflict_type,
      ]
        .filter(Boolean)
        .join(" · "),
      href: "/importar-dados",
    });
  }

  const affected = (products?.products ?? [])
    .filter((product) => product.stockTimeAffected > 0)
    .sort((left, right) => right.stockTimeAffected - left.stockTimeAffected)
    .slice(0, 20);
  for (const product of affected) {
    alerts.push({
      id: `stock-time-${product.sku}`,
      severity: "warning",
      category: "Estoque FULL",
      title: `${product.sku} afetando tempo de estoque`,
      description: `${product.name} · ${product.fullStock} un. no FULL`,
      value: `${product.stockTimeAffected} un. afetadas`,
      href: "/dashboard/estoque-full",
    });
  }

  for (const inbound of (inbounds?.inbounds ?? []).filter((row) => row.hasDifference).slice(0, 20)) {
    alerts.push({
      id: `inbound-difference-${inbound.inboundId}`,
      severity: "info",
      category: "Envios FULL",
      title: `Diferença no envio ${inbound.inboundId}`,
      description: `${inbound.declared} declaradas · ${inbound.processed} processadas`,
      value: `${inbound.difference > 0 ? "+" : ""}${inbound.difference} un.`,
      href: "/dashboard/envios-full",
    });
  }

  if (alerts.length > 0) {
    const { error } = await supabase.from("operational_tasks").upsert(
      alerts.map((alert) => ({
        alert_key: alert.id,
        created_by: authData.user.id,
        title: alert.title,
        description: alert.description,
        category: alert.category,
        priority: alert.severity === "critical" ? "critical" : alert.severity === "warning" ? "high" : "medium",
        status: "pending",
      })),
      { onConflict: "alert_key", ignoreDuplicates: true },
    );
    if (error) throw new Error(`Não foi possível sincronizar os alertas com as tarefas: ${error.message}`);
  }

  const { data: resolved } = await supabase
    .from("alert_resolutions")
    .select("alert_key, resolved_at")
    .order("resolved_at", { ascending: false });
  const resolvedItems = (resolved ?? []).map((row) => ({ alertKey: row.alert_key, resolvedAt: row.resolved_at }));
  const resolvedKeys = new Set(resolvedItems.map((row) => row.alertKey));
  const visibleAlerts = alerts.filter((alert) => !resolvedKeys.has(alert.id));
  const summary = {
    critical: visibleAlerts.filter((alert) => alert.severity === "critical").length,
    warning: visibleAlerts.filter((alert) => alert.severity === "warning").length,
    info: visibleAlerts.filter((alert) => alert.severity === "info").length,
    total: visibleAlerts.length,
  };
  return { summary, alerts: visibleAlerts, resolved: resolvedItems };
}
