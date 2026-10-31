import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { HistoricalRankingTable } from "./_components/historical-ranking-table";
import { loadHistoricalRankingDashboard } from "./_lib/load-historical-ranking-dashboard";

function date(value: string | null) {
  return value ? new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T12:00:00`)) : "—";
}
export default async function Page({ searchParams }: { searchParams: Promise<{ start?: string; end?: string }> }) {
  const { start, end } = await searchParams;
  const selectedStart = /^\d{4}-\d{2}-\d{2}$/.test(start ?? "") ? start : undefined;
  const selectedEnd = /^\d{4}-\d{2}-\d{2}$/.test(end ?? "") ? end : undefined;
  try {
    const data = await loadHistoricalRankingDashboard(selectedStart, selectedEnd);
    if (!data)
      return (
        <Alert>
          <AlertCircle />
          <AlertTitle>Sem ranking histórico</AlertTitle>
          <AlertDescription>Importe a planilha consolidada de SKUs em Importar dados para esta conta.</AlertDescription>
        </Alert>
      );
    return (
      <main className="flex flex-col gap-5">
        <div>
          <p className="font-medium text-primary text-xs uppercase tracking-[0.18em]">Histórico consolidado por SKU</p>
          <h1 className="text-3xl font-semibold tracking-tight">Histórico x Situação Atual</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Compare produtos fortes no histórico com vendas, anúncios e estoque atuais. Período atual:{" "}
            {date(data.period.start)} até {date(data.period.end)}.
          </p>
          <form action="/dashboard/historico-curvas" className="mt-3 flex flex-wrap items-end gap-2">
            <label className="grid gap-1 text-xs text-muted-foreground">
              De
              <input
                name="start"
                type="date"
                defaultValue={data.period.start ?? ""}
                className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
              />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Até
              <input
                name="end"
                type="date"
                defaultValue={data.period.end ?? ""}
                className="h-9 rounded-md border bg-background px-2 text-sm text-foreground"
              />
            </label>
            <button
              type="submit"
              className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
            >
              Aplicar
            </button>
            <a href="/dashboard/historico-curvas" className="h-9 rounded-md bg-muted px-3 py-2 text-sm font-medium">
              Padrão
            </a>
          </form>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label="SKUs históricos" value={data.summary.historical} />
          <Metric label="Precisa recuperar" value={data.summary.recover} emphasis="text-orange-600" />
          <Metric label="Sem vender com estoque" value={data.summary.noSalesWithStock} emphasis="text-red-600" />
          <Metric label="Sem estoque FULL" value={data.summary.noFull} />
          <Metric label="Pausados/excluídos" value={data.summary.inactive} />
        </div>
        <HistoricalRankingTable rows={data.rows} />
      </main>
    );
  } catch (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>Não foi possível carregar o histórico</AlertTitle>
        <AlertDescription>
          {error instanceof Error ? error.message : "Ocorreu um erro ao consultar os dados."}
        </AlertDescription>
      </Alert>
    );
  }
}
function Metric({ label, value, emphasis = "" }: { label: string; value: number; emphasis?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className={`text-2xl tabular-nums ${emphasis}`}>{value.toLocaleString("pt-BR")}</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground text-xs">No ranking histórico da conta ativa</CardContent>
    </Card>
  );
}
