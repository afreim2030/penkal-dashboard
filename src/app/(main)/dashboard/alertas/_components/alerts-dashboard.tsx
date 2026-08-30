import Link from "next/link";

import { AlertTriangle, CircleAlert, Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { resolveAlert } from "../_actions/alert-actions";
import type { AlertsDashboardData, OperationalAlertSeverity } from "../_lib/load-alerts-dashboard";

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

export function AlertsDashboard({ data }: { data: AlertsDashboardData }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Alertas</h1>
        <p className="text-muted-foreground text-sm">
          Pendências objetivas já encontradas nas importações, no estoque FULL e nos envios FULL.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{data.summary.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Críticos</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{data.summary.critical}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Atenção</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{data.summary.warning}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Informativos</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{data.summary.info}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pendências atuais</CardTitle>
          <CardDescription>
            Sem criar uma nova pontuação: esta tela apenas reúne regras e diferenças que o sistema já calcula.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {data.alerts.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma pendência encontrada nas fontes carregadas.</p>
          ) : (
            data.alerts.map((alert) => (
              <div key={alert.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  {icon(alert.severity)}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{alert.title}</p>
                      <Badge variant="outline">{label(alert.severity)}</Badge>
                      <Badge variant="secondary">{alert.category}</Badge>
                    </div>
                    <p className="mt-1 text-muted-foreground text-sm">{alert.description}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {alert.value ? <span className="font-medium tabular-nums text-sm">{alert.value}</span> : null}
                  <Button asChild size="sm" variant="outline">
                    <Link href={alert.href}>Ver</Link>
                  </Button>
                  <form action={resolveAlert}>
                    <input name="alertKey" type="hidden" value={alert.id} />
                    <Button size="sm" type="submit">
                      Resolver
                    </Button>
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
