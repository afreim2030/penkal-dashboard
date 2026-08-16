import { ArrowDownRight, ArrowUpRight, Info, Minus } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import type { ProductDashboardRow, ProductsDashboardData } from "../_lib/load-products-dashboard";

const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const percentage = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });

function formatDate(value: string | null): string {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function Trend({ value }: { value: number | null }) {
  if (value === null || !Number.isFinite(value)) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Minus className="size-3" /> sem base
      </span>
    );
  }
  if (value > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
        <ArrowUpRight className="size-3" /> {percentage.format(value)}
      </span>
    );
  }
  if (value < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400">
        <ArrowDownRight className="size-3" /> {percentage.format(value)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <Minus className="size-3" /> 0%
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "Ativo") return <Badge>Ativo</Badge>;
  if (status === "Inativo") return <Badge variant="secondary">Inativo</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function daysWithoutSale(row: ProductDashboardRow): string {
  if (row.daysSinceSale === null) return "Sem venda";
  if (row.daysSinceSale === 0) return "0 dias";
  return `${integer.format(row.daysSinceSale)} dias`;
}

export function ProductsDashboard({ data }: { data: ProductsDashboardData }) {
  const periodLabel = `${data.asOf.salesDaysAvailable} dia${data.asOf.salesDaysAvailable === 1 ? "" : "s"} completos disponíveis`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Produtos</h1>
        <p className="text-muted-foreground text-sm">
          Visão consolidada por SKU. Um SKU continua sendo um único produto mesmo quando possui vários anúncios.
        </p>
      </div>

      {!data.asOf.performanceDate ? (
        <Alert>
          <Info />
          <AlertTitle>Visitas e conversão ainda não carregadas</AlertTitle>
          <AlertDescription>
            O painel já usa vendas e estoque FULL. Importe os relatórios de performance para preencher visitas e
            conversão por SKU.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Produtos cadastrados</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{integer.format(data.summary.products)}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">Consolidados por SKU</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Com anúncio ativo</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{integer.format(data.summary.activeProducts)}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">Ao menos um anúncio ativo</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Com estoque FULL</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{integer.format(data.summary.withFullStock)}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">Snapshot mais recente</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Unidades vendidas</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{integer.format(data.summary.unitsPeriod)}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">{periodLabel}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Afetando tempo de estoque</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {integer.format(data.summary.stockTimeAffectedUnits)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">Unidades do FULL</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Catálogo consolidado</CardTitle>
          <CardDescription>
            Vendas até {formatDate(data.asOf.salesDate)} · FULL atualizado em {formatDate(data.asOf.fullSnapshotAt)}
            {data.asOf.performanceDate ? ` · Performance até ${formatDate(data.asOf.performanceDate)}` : ""}.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">SKU</TableHead>
                <TableHead className="min-w-[280px]">Produto</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">FULL</TableHead>
                <TableHead className="text-right">Vendidas</TableHead>
                <TableHead className="text-right">Faturamento</TableHead>
                <TableHead className="text-right">Visitas 7d</TableHead>
                <TableHead className="text-right">Conversão</TableHead>
                <TableHead className="text-right">Sem vender</TableHead>
                <TableHead className="text-right">Tendência 7d</TableHead>
                <TableHead className="text-right">Tempo estoque</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.products.map((row) => (
                <TableRow key={row.sku}>
                  <TableCell className="font-medium tabular-nums">{row.sku}</TableCell>
                  <TableCell>
                    <div className="max-w-[460px]">
                      <p className="truncate font-medium" title={row.name}>
                        {row.name}
                      </p>
                      {row.category ? <p className="truncate text-muted-foreground text-xs">{row.category}</p> : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{integer.format(row.fullStock)}</TableCell>
                  <TableCell className="text-right tabular-nums">{integer.format(row.unitsPeriod)}</TableCell>
                  <TableCell className="text-right tabular-nums">{currency.format(row.revenuePeriod)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.visits7 === null ? "—" : integer.format(row.visits7)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.conversion7 === null ? "—" : percentage.format(row.conversion7)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{daysWithoutSale(row)}</TableCell>
                  <TableCell className="text-right">
                    <Trend value={row.trend7} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.stockTimeAffected > 0 ? (
                      <Badge variant="outline">{integer.format(row.stockTimeAffected)} un.</Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
