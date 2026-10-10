import Link from "next/link";
import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { PerformanceDashboard } from "./_components/performance-dashboard";
import { loadPerformanceDashboard } from "./_lib/load-performance-dashboard";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; start?: string; end?: string }>;
}) {
  try {
    const params = await searchParams;
    const baseData = await loadPerformanceDashboard();
    if (!baseData?.coverage.maxDate)
      return (
        <Alert>
          <AlertCircle />
          <AlertTitle>Sem dados de performance</AlertTitle>
          <AlertDescription>Importe um relatório de performance para liberar visitas e conversão.</AlertDescription>
        </Alert>
      );

    const isDate = (value: string | undefined) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
    const customRange = isDate(params.start) && isDate(params.end) && params.start! <= params.end!;
    const period = params.period ?? "7d";
    const makeDate = (value: string) => new Date(`${value}T12:00:00`);
    const endDate = customRange ? makeDate(params.end!) : makeDate(baseData.coverage.maxDate);
    const days = period === "today" ? 1 : period === "yesterday" ? 1 : period === "30d" ? 30 : period === "month" ? endDate.getDate() : 7;
    if (!customRange && period === "yesterday") endDate.setDate(endDate.getDate() - 1);
    const startDate = customRange ? makeDate(params.start!) : new Date(endDate);
    if (!customRange) startDate.setDate(startDate.getDate() - days + 1);
    const iso = (value: Date) => value.toISOString().slice(0, 10);
    const start = iso(startDate);
    const end = iso(endDate);
    const data = (await loadPerformanceDashboard(start, end)) ?? baseData;

    return (
      <div className="flex flex-col gap-5">
        <Card>
          <CardContent className="flex flex-col gap-3 p-3">
            <div className="flex flex-wrap gap-2">
              {[["today", "Último dia"], ["yesterday", "Dia anterior"], ["7d", "Últimos 7 dias"], ["30d", "Últimos 30 dias"], ["month", "Este mês"]].map(([value, label]) => (
                <Link
                  key={value}
                  href={`/dashboard/performance?period=${value}`}
                  className={`rounded-md px-3 py-2 text-sm font-medium ${!customRange && period === value ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                >
                  {label}
                </Link>
              ))}
            </div>
            <form className="flex flex-wrap items-end gap-2" action="/dashboard/performance">
              <label className="grid gap-1 text-sm font-medium">De<Input name="start" type="date" defaultValue={start} className="w-40" /></label>
              <label className="grid gap-1 text-sm font-medium">Até<Input name="end" type="date" defaultValue={end} className="w-40" /></label>
              <Button type="submit">Aplicar período</Button>
            </form>
          </CardContent>
        </Card>
        <PerformanceDashboard data={data} />
      </div>
    );
  } catch (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>Não foi possível carregar Performance</AlertTitle>
        <AlertDescription>
          {error instanceof Error ? error.message : "Ocorreu um erro ao consultar os dados de performance."}
        </AlertDescription>
      </Alert>
    );
  }
}
