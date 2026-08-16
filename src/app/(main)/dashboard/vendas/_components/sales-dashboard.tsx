import { AlertCircle, Info, Minus, TrendingDown, TrendingUp } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import type { SalesDashboardData, SalesDayMetrics, SalesPeriodMetrics } from "../_lib/load-sales-dashboard";

const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const percent = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

const WEEKDAYS: Record<number, string> = {
  1: "Segunda",
  2: "Terça",
  3: "Quarta",
  4: "Quinta",
  5: "Sexta",
  6: "Sábado",
  7: "Domingo",
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function delta(current: number, previous: number | null | undefined): number | null {
  if (!previous) return null;
  return (current - previous) / previous;
}

function Delta({ value, label }: { value: number | null; label: string }) {
  if (value === null || !Number.isFinite(value)) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
        <Minus className="size-3" /> {label}: sem base
      </span>
    );
  }
  const positive = value > 0;
  const negative = value < 0;
  const Icon = positive ? TrendingUp : negative ? TrendingDown : Minus;
  return (
    <span
      className={
        positive
          ? "inline-flex items-center gap-1 text-emerald-600 text-xs dark:text-emerald-400"
          : negative
            ? "inline-flex items-center gap-1 text-red-600 text-xs dark:text-red-400"
            : "inline-flex items-center gap-1 text-muted-foreground text-xs"
      }
    >
      <Icon className="size-3" /> {label}: {percent.format(value)}
    </span>
  );
}

function MetricCard({
  label,
  value,
  description,
  previous,
  weekday,
}: {
  label: string;
  value: string;
  description: string;
  previous: number | null;
  weekday: number | null;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <p className="text-muted-foreground text-xs">{description}</p>
        <Delta value={previous} label="vs. dia anterior" />
        <Delta value={weekday} label="vs. semana anterior" />
      </CardContent>
    </Card>
  );
}

function PeriodCard({
  title,
  period,
  previous,
}: {
  title: string;
  period: SalesPeriodMetrics | null;
  previous: SalesPeriodMetrics | null;
}) {
  if (!period) {
    return (
      <Card>
        <CardHeader>
          <CardDescription>{title}</CardDescription>
          <CardTitle className="text-xl">Histórico incompleto</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          O período só é calculado quando todos os dias necessários têm cobertura completa.
        </CardContent>
      </Card>
    );
  }

  const previousUnitsDelta = previous ? delta(period.units, previous.units) : null;
  const previousRevenueDelta = previous ? delta(period.revenue, previous.revenue) : null;

  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-xl tabular-nums">{integer.format(period.units)} unidades</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">Faturamento</span>
          <strong className="tabular-nums">{currency.format(period.revenue)}</strong>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">Pedidos</span>
          <strong className="tabular-nums">{integer.format(period.orders)}</strong>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">Média diária</span>
          <strong className="tabular-nums">{decimal.format(period.units / period.days)} un.</strong>
        </div>
        <div className="pt-1 text-muted-foreground text-xs">
          {formatDate(period.start)} até {formatDate(period.end)}
        </div>
        <div className="flex flex-col gap-1 border-t pt-2">
          <Delta value={previousUnitsDelta} label="unidades vs. período anterior" />
          <Delta value={previousRevenueDelta} label="faturamento vs. período anterior" />
        </div>
      </CardContent>
    </Card>
  );
}

function dayValue(day: SalesDayMetrics | null | undefined, key: "units" | "orders" | "revenue" | "ticket"): number {
  return Number(day?.[key] ?? 0);
}

export function SalesDashboard({ data }: { data: SalesDashboardData }) {
  const latest = data.latestDay;
  const previous = data.previousDay;
  const weekday = data.sameWeekdayPreviousWeek;
  const maxDailyUnits = Math.max(1, ...data.daily.map((row) => row.units));
  const topHours = [...data.hourly].sort((a, b) => b.units - a.units).slice(0, 8);
  const maxHourlyUnits = Math.max(1, ...topHours.map((row) => row.units));
  const partialExists = data.coverage.maxCoveredDate && data.coverage.maxCoveredDate !== data.coverage.maxCompleteDate;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Vendas</h1>
        <p className="text-muted-foreground text-sm">
          Indicadores do Mercado Livre usando somente dias com cobertura comprovada para comparações.
        </p>
      </div>

      {partialExists ? (
        <Alert>
          <Info />
          <AlertTitle>Existe um dia parcial no relatório</AlertTitle>
          <AlertDescription>
            O último dia completo é {formatDate(data.coverage.maxCompleteDate)}. Dados de{" "}
            {formatDate(data.coverage.maxCoveredDate)} aparecem na evolução diária, mas não entram nos comparativos
            fechados.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Unidades vendidas"
          value={integer.format(dayValue(latest, "units"))}
          description={`Último dia completo: ${formatDate(latest.date)}`}
          previous={delta(dayValue(latest, "units"), dayValue(previous, "units"))}
          weekday={delta(dayValue(latest, "units"), dayValue(weekday, "units"))}
        />
        <MetricCard
          label="Faturamento"
          value={currency.format(dayValue(latest, "revenue"))}
          description="Bruto do dia válido"
          previous={delta(dayValue(latest, "revenue"), dayValue(previous, "revenue"))}
          weekday={delta(dayValue(latest, "revenue"), dayValue(weekday, "revenue"))}
        />
        <MetricCard
          label="Pedidos"
          value={integer.format(dayValue(latest, "orders"))}
          description="Pedidos válidos distintos"
          previous={delta(dayValue(latest, "orders"), dayValue(previous, "orders"))}
          weekday={delta(dayValue(latest, "orders"), dayValue(weekday, "orders"))}
        />
        <MetricCard
          label="Ticket médio"
          value={currency.format(dayValue(latest, "ticket"))}
          description={`${integer.format(latest.cancelledOrders ?? 0)} pedidos cancelados no dia`}
          previous={delta(dayValue(latest, "ticket"), dayValue(previous, "ticket"))}
          weekday={delta(dayValue(latest, "ticket"), dayValue(weekday, "ticket"))}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PeriodCard title="Últimos 7 dias completos" period={data.periods.last7} previous={data.periods.previous7} />
        <PeriodCard
          title="Mês até o último dia completo"
          period={data.periods.monthToDate}
          previous={data.periods.previousMonthToDate}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <Card>
          <CardHeader>
            <CardTitle>Evolução diária</CardTitle>
            <CardDescription>Unidades válidas por dia; dias parciais ficam sinalizados.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {data.daily.map((row) => (
              <div key={row.date} className="grid grid-cols-[82px_1fr_64px] items-center gap-3 text-sm">
                <div className="flex flex-col">
                  <span className="font-medium">{formatDate(row.date).slice(0, 5)}</span>
                  {row.coverageStatus !== "complete" ? (
                    <span className="text-amber-600 text-[11px] dark:text-amber-400">Parcial</span>
                  ) : null}
                </div>
                <div className="h-7 overflow-hidden rounded-md bg-muted">
                  <div
                    className="flex h-full items-center rounded-md bg-primary/80 px-2 text-primary-foreground text-xs tabular-nums"
                    style={{ width: `${Math.max(5, (row.units / maxDailyUnits) * 100)}%` }}
                  >
                    {integer.format(row.units)}
                  </div>
                </div>
                <div className="text-right text-muted-foreground text-xs tabular-nums">
                  {integer.format(row.orders)} ped.
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Horários mais fortes</CardTitle>
            <CardDescription>Últimos até 30 dias completos disponíveis.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {topHours.map((row) => (
              <div key={row.hour} className="grid grid-cols-[52px_1fr_54px] items-center gap-2 text-sm">
                <span className="font-medium tabular-nums">{String(row.hour).padStart(2, "0")}:00</span>
                <div className="h-6 overflow-hidden rounded bg-muted">
                  <div
                    className="h-full rounded bg-primary/70"
                    style={{ width: `${Math.max(6, (row.units / maxHourlyUnits) * 100)}%` }}
                  />
                </div>
                <span className="text-right tabular-nums">{integer.format(row.units)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top SKUs por unidades</CardTitle>
          <CardDescription>Ranking consolidado por SKU nos últimos até 30 dias completos.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">#</TableHead>
                <TableHead className="w-28">SKU</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead className="text-right">Unidades</TableHead>
                <TableHead className="text-right">Pedidos</TableHead>
                <TableHead className="text-right">Faturamento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.topSkus.map((row, index) => (
                <TableRow key={row.sku}>
                  <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                  <TableCell className="font-medium">{row.sku}</TableCell>
                  <TableCell className="max-w-[440px] truncate" title={row.productName ?? undefined}>
                    {row.productName ?? "Produto sem nome vinculado"}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{integer.format(row.units)}</TableCell>
                  <TableCell className="text-right tabular-nums">{integer.format(row.orders)}</TableCell>
                  <TableCell className="text-right tabular-nums">{currency.format(row.revenue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Dia da semana</CardTitle>
            <CardDescription>Média de unidades por dia observado com cobertura completa.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dia</TableHead>
                  <TableHead className="text-right">Dias</TableHead>
                  <TableHead className="text-right">Unidades</TableHead>
                  <TableHead className="text-right">Média/dia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.weekdays.map((row) => (
                  <TableRow key={row.weekday}>
                    <TableCell className="font-medium">{WEEKDAYS[row.weekday] ?? row.weekday}</TableCell>
                    <TableCell className="text-right tabular-nums">{integer.format(row.daysObserved)}</TableCell>
                    <TableCell className="text-right tabular-nums">{integer.format(row.units)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {decimal.format(row.averageUnitsPerDay)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Qualidade da base</CardTitle>
            <CardDescription>Regras usadas para não inflar os indicadores.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex items-start gap-2">
              <Badge variant="outline">Venda válida</Badge>
              <p className="text-muted-foreground">
                Somente <code>sale_item</code>; pacotes e trocas ficam fora da soma por SKU.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <Badge variant="outline">Cancelamentos</Badge>
              <p className="text-muted-foreground">
                Status cancelados e reembolsos negativos são retirados dos indicadores.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <Badge variant="outline">Cobertura</Badge>
              <p className="text-muted-foreground">
                Comparações só são mostradas quando todos os dias do período estão comprovados como completos.
              </p>
            </div>
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <p className="text-muted-foreground">
                O faturamento prioriza Receita bruta do relatório e usa campos financeiros de fallback apenas quando ela
                está ausente.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
