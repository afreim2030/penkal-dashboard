"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { AlertTriangle, CircleAlert, Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { resolveAlert } from "../_actions/alert-actions";
import type { AlertsDashboardData, OperationalAlert, OperationalAlertSeverity } from "../_lib/load-alerts-dashboard";

type AlertTab = "all" | "full" | "ads" | "adsNoImpressions" | "adsLowCtr" | "adsVisitsNoSales" | "noPromotion" | "sales" | "shipping" | "system";

const tabs: Array<{ id: AlertTab; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "full", label: "FULL" },
  { id: "ads", label: "ADS" },
  { id: "adsNoImpressions", label: "ADS sem impressões" },
  { id: "adsLowCtr", label: "ADS CTR baixo" },
  { id: "adsVisitsNoSales", label: "ADS visitas sem venda" },
  { id: "noPromotion", label: "Sem promoção" },
  { id: "sales", label: "Vendas" },
  { id: "shipping", label: "Envios" },
  { id: "system", label: "Sistema" },
];

function icon(severity: OperationalAlertSeverity) {
  if (severity === "critical") return <CircleAlert className="size-5 text-red-600" />;
  if (severity === "warning") return <AlertTriangle className="size-5 text-amber-600" />;
  return <Info className="size-5 text-blue-600" />;
}

function label(severity: OperationalAlertSeverity) {
  if (severity === "critical") return "Crítico";
  if (severity === "warning") return "Atenção";
  return "Informativo";
}

function isSystemAlert(alert: OperationalAlert) {
  return alert.id.startsWith("sales-conflict-") || alert.title.toLowerCase().includes("importação");
}

function belongsToTab(alert: OperationalAlert, tab: AlertTab) {
  if (tab === "all") return true;
  if (tab === "full") return alert.category === "Estoque FULL";
  if (tab === "ads") return alert.category === "Publicidade"
    && !alert.id.startsWith("listing-no-promotion-")
    && !alert.id.startsWith("ads-no-impressions-")
    && !alert.id.startsWith("ads-low-ctr-")
    && !alert.id.startsWith("visits-no-sales-");
  if (tab === "adsNoImpressions") return alert.id.startsWith("ads-no-impressions-");
  if (tab === "adsLowCtr") return alert.id.startsWith("ads-low-ctr-");
  if (tab === "adsVisitsNoSales") return alert.id.startsWith("visits-no-sales-");
  if (tab === "noPromotion") return alert.id.startsWith("listing-no-promotion-");
  if (tab === "shipping") return alert.category === "Envios FULL";
  if (tab === "system") return isSystemAlert(alert);
  return alert.category === "Vendas" && !isSystemAlert(alert);
}

export function AlertsDashboard({ data }: { data: AlertsDashboardData }) {
  const [activeTab, setActiveTab] = useState<AlertTab>("all");
  const visibleAlerts = useMemo(
    () => data.alerts.filter((alert) => belongsToTab(alert, activeTab)),
    [activeTab, data.alerts],
  );
  const countFor = (tab: AlertTab) => data.alerts.filter((alert) => belongsToTab(alert, tab)).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Alertas</h1>
        <p className="text-muted-foreground text-sm">
          Pendências organizadas por área para agir mais rápido.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardDescription>Total</CardDescription><CardTitle className="text-2xl tabular-nums">{data.summary.total}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Críticos</CardDescription><CardTitle className="text-2xl tabular-nums">{data.summary.critical}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Atenção</CardDescription><CardTitle className="text-2xl tabular-nums">{data.summary.warning}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Informativos</CardDescription><CardTitle className="text-2xl tabular-nums">{data.summary.info}</CardTitle></CardHeader></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pendências atuais</CardTitle>
          <CardDescription>Selecione a área que deseja analisar.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2 border-b pb-4">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${isActive ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >
                  {tab.label} <span className="ml-1 tabular-nums opacity-80">({countFor(tab.id)})</span>
                </button>
              );
            })}
          </div>

          {visibleAlerts.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground text-sm">Nenhuma pendência nesta categoria.</p>
          ) : (
            visibleAlerts.map((alert) => (
              <div key={alert.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  {icon(alert.severity)}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{alert.title}</p>
                      <Badge variant="outline">{label(alert.severity)}</Badge>
                      <Badge variant="secondary">{isSystemAlert(alert) ? "Sistema" : alert.category}</Badge>
                    </div>
                    <p className="mt-1 text-muted-foreground text-sm">{alert.description}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {alert.value ? <span className="font-medium tabular-nums text-sm">{alert.value}</span> : null}
                  <Button asChild size="sm" variant="outline"><Link href={alert.href}>Ver</Link></Button>
                  <form action={resolveAlert}>
                    <input name="alertKey" type="hidden" value={alert.id} />
                    <Button size="sm" type="submit">Resolver</Button>
                  </form>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
