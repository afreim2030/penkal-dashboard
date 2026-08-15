"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import type { FullFifoVelocitySkuAnalysis } from "../_lib/load-full-fifo-analysis";
import {
  buildStockPriorityAudit,
  impactPercentage,
  type StockActionClassification,
  type StockPriorityClassifiedRow,
  units90Plus,
} from "../_lib/stock-priority-audit";

const integer = new Intl.NumberFormat("pt-BR");
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const percentage = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

const CLASSIFICATION_ORDER: StockActionClassification[] = [
  "Prioridade alta",
  "Atenção",
  "Monitorar",
  "Provável saída pelo giro",
  "Sem prioridade por Tempo de estoque",
];

function classificationVariant(classification: StockActionClassification): "default" | "secondary" | "outline" {
  if (classification === "Prioridade alta") return "default";
  if (classification === "Sem prioridade por Tempo de estoque") return "outline";
  return "secondary";
}

function daysLabel(row: StockPriorityClassifiedRow): string {
  if (row.sold_units_available_period === 0) return "Sem venda";
  return row.days_of_stock_available_period === null
    ? "Indisponível"
    : `${decimal.format(row.days_of_stock_available_period)} d`;
}

function SummaryCard({
  classification,
  skuCount,
  unitsAffectStockTime,
}: {
  classification: StockActionClassification;
  skuCount: number;
  unitsAffectStockTime: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{classification}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{integer.format(skuCount)} SKUs</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground text-xs">
        {integer.format(unitsAffectStockTime)} unidades afetadas
      </CardContent>
    </Card>
  );
}

function PriorityBadge({ classification }: { classification: StockActionClassification }) {
  return <Badge variant={classificationVariant(classification)}>{classification}</Badge>;
}

function PriorityTable({ rows }: { rows: StockPriorityClassifiedRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Classificação</TableHead>
            <TableHead>SKU</TableHead>
            <TableHead className="min-w-56">Produto</TableHead>
            <TableHead>Estoque</TableHead>
            <TableHead>Vendas 10d</TableHead>
            <TableHead>Média/dia</TableHead>
            <TableHead>Dias de estoque</TableHead>
            <TableHead>Idade média FIFO</TableHead>
            <TableHead>FIFO 90+</TableHead>
            <TableHead>Afeta Tempo de estoque</TableHead>
            <TableHead>% afetado</TableHead>
            <TableHead className="min-w-80">Motivo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length ? (
            rows.map((row) => (
              <TableRow key={row.sku}>
                <TableCell>
                  <div className="flex min-w-44 flex-col items-start gap-1">
                    <PriorityBadge classification={row.classification} />
                    {row.hasFifo90Plus ? <Badge variant="outline">Possui estoque 90+</Badge> : null}
                  </div>
                </TableCell>
                <TableCell className="font-medium">{row.sku}</TableCell>
                <TableCell className="max-w-72 truncate" title={row.product_name ?? undefined}>
                  {row.product_name ?? "Produto não vinculado"}
                </TableCell>
                <TableCell className="tabular-nums">{integer.format(row.quantity_full)}</TableCell>
                <TableCell className="tabular-nums">{integer.format(row.sold_units_available_period)}</TableCell>
                <TableCell className="tabular-nums">
                  {decimal.format(row.average_daily_sales_available_period)}
                </TableCell>
                <TableCell className="tabular-nums">{daysLabel(row)}</TableCell>
                <TableCell className="tabular-nums">
                  {row.weighted_average_age_days === null
                    ? "Indisponível"
                    : `${decimal.format(row.weighted_average_age_days)} d`}
                </TableCell>
                <TableCell className="tabular-nums">{integer.format(units90Plus(row))}</TableCell>
                <TableCell className="tabular-nums">{integer.format(row.units_affect_stock_time)}</TableCell>
                <TableCell className="tabular-nums">
                  {impactPercentage(row) === null
                    ? "Indisponível"
                    : `${percentage.format(impactPercentage(row) ?? 0)}%`}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">{row.reason}</TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={12} className="text-muted-foreground">
                Nenhum SKU afeta o Tempo de estoque.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export function StockPriorityAudit({
  rows,
  totalQuantity,
}: {
  rows: FullFifoVelocitySkuAnalysis[];
  totalQuantity: number;
}) {
  const audit = buildStockPriorityAudit(rows, totalQuantity);
  const priorityRows = audit.classifiedRows
    .filter((row) => row.units_affect_stock_time > 0 && row.quantity_full > 0)
    .sort(
      (left, right) =>
        CLASSIFICATION_ORDER.indexOf(left.classification) - CLASSIFICATION_ORDER.indexOf(right.classification) ||
        right.units_affect_stock_time - left.units_affect_stock_time ||
        (right.impact_percentage ?? -1) - (left.impact_percentage ?? -1) ||
        left.sku.localeCompare(right.sku),
    );

  return (
    <section className="flex flex-col gap-4" aria-labelledby="stock-priority-title">
      <div>
        <h2 id="stock-priority-title" className="text-2xl tracking-tight">
          Prioridades de estoque
        </h2>
        <p className="text-muted-foreground text-sm">
          Classificação operacional interna para orientar atenção. É uma estimativa e não representa regra oficial do
          Mercado Livre; não recomenda quantidades de retirada ou envio.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {CLASSIFICATION_ORDER.slice(0, 4).map((classification) => (
          <SummaryCard
            key={classification}
            classification={classification}
            {...audit.classificationSummary[classification]}
          />
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Classificação por SKU</CardTitle>
          <CardDescription>
            Apenas SKUs com estoque e unidades que afetam Tempo de estoque. Ordenação por classe, impacto e percentual
            afetado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PriorityTable rows={priorityRows} />
        </CardContent>
      </Card>
    </section>
  );
}
