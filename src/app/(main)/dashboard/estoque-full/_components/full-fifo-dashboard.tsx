"use client";

import { useMemo, useState } from "react";

import { ArrowDownUp, Info, Search } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import type { FullFifoBucketKey } from "../_lib/full-fifo";
import type { FullFifoAnalysisData, FullFifoVelocitySkuAnalysis } from "../_lib/load-full-fifo-analysis";

const integer = new Intl.NumberFormat("pt-BR");
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const coverage = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const date = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const dateTime = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const BUCKETS: { key: FullFifoBucketKey; label: string }[] = [
  { key: "units_0_30", label: "0–30" },
  { key: "units_31_60", label: "31–60" },
  { key: "units_61_90", label: "61–90" },
  { key: "units_91_120", label: "91–120" },
  { key: "units_121_180", label: "121–180" },
  { key: "units_181_plus", label: "181+" },
  { key: "units_unknown", label: "Desconhecido" },
];

type SortKey =
  | "quantity"
  | "average_age"
  | "units_90_plus"
  | "units_180_plus"
  | "unknown"
  | "stock_time"
  | "sold"
  | "average_daily"
  | "days_low"
  | "days_high";
type DemandFilter = "all" | "with_sale" | "without_sale" | "out_of_stock_demand";
type DaysFilter = "all" | "0_7" | "8_15" | "16_30" | "31_60" | "61_90" | "91_plus";

function metric(value: string, label: string, description?: string) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      {description ? <CardContent className="text-muted-foreground text-xs">{description}</CardContent> : null}
    </Card>
  );
}

function sortableValue(row: FullFifoVelocitySkuAnalysis, sort: SortKey): number {
  if (sort === "average_age") return row.weighted_average_age_days ?? -1;
  if (sort === "units_90_plus") return row.units_91_120 + row.units_121_180 + row.units_181_plus;
  if (sort === "units_180_plus") return row.units_181_plus;
  if (sort === "unknown") return row.units_unknown;
  if (sort === "stock_time") return row.units_affect_stock_time;
  if (sort === "sold") return row.sold_units_available_period;
  if (sort === "average_daily") return row.average_daily_sales_available_period;
  if (sort === "days_low" || sort === "days_high")
    return row.days_of_stock_available_period ?? Number.POSITIVE_INFINITY;
  return row.quantity_full;
}

function inDaysFilter(days: number | null, filter: DaysFilter): boolean {
  if (filter === "all") return true;
  if (days === null) return false;
  if (filter === "0_7") return days <= 7;
  if (filter === "8_15") return days > 7 && days <= 15;
  if (filter === "16_30") return days > 15 && days <= 30;
  if (filter === "31_60") return days > 30 && days <= 60;
  if (filter === "61_90") return days > 60 && days <= 90;
  return days > 90;
}

function matchesDemandFilter(row: FullFifoVelocitySkuAnalysis, filter: DemandFilter): boolean {
  if (filter === "all") return true;
  if (filter === "with_sale") return row.sold_units_available_period > 0;
  if (filter === "without_sale") return row.quantity_full > 0 && row.sold_units_available_period === 0;
  return row.quantity_full === 0 && row.sold_units_available_period > 0;
}

function formatStockDays(days: number | null, status: FullFifoVelocitySkuAnalysis["velocity_status"]): string {
  if (status === "Sem venda no período") return "Sem venda no período";
  return days === null ? "—" : `${decimal.format(days)} d`;
}

function formatSevenDayStockDays(row: FullFifoVelocitySkuAnalysis): string {
  if (row.days_of_stock_7d !== null) return `${decimal.format(row.days_of_stock_7d)} d`;
  return row.sold_units_7d === 0 ? "Sem venda no período" : "—";
}

export function FullFifoDashboard({ data }: { data: FullFifoAnalysisData }) {
  const [sku, setSku] = useState("");
  const [product, setProduct] = useState("");
  const [bucket, setBucket] = useState<FullFifoBucketKey | "all">("all");
  const [withStock, setWithStock] = useState(true);
  const [affectsStockTime, setAffectsStockTime] = useState(false);
  const [incompleteCoverage, setIncompleteCoverage] = useState(false);
  const [with90Plus, setWith90Plus] = useState(false);
  const [demandFilter, setDemandFilter] = useState<DemandFilter>("all");
  const [daysFilter, setDaysFilter] = useState<DaysFilter>("all");
  const [sort, setSort] = useState<SortKey>("quantity");
  const [selected, setSelected] = useState<FullFifoVelocitySkuAnalysis | null>(null);
  const rows = useMemo(() => {
    const normalizedSku = sku.trim().toLocaleLowerCase("pt-BR");
    const normalizedProduct = product.trim().toLocaleLowerCase("pt-BR");
    return data.rows
      .filter((row) => !normalizedSku || row.sku.toLocaleLowerCase("pt-BR").includes(normalizedSku))
      .filter(
        (row) => !normalizedProduct || (row.product_name ?? "").toLocaleLowerCase("pt-BR").includes(normalizedProduct),
      )
      .filter((row) => bucket === "all" || row[bucket] > 0)
      .filter((row) => !withStock || demandFilter === "out_of_stock_demand" || row.quantity_full > 0)
      .filter((row) => !affectsStockTime || row.units_affect_stock_time > 0)
      .filter((row) => !incompleteCoverage || (row.coverage_percentage ?? 100) < 100)
      .filter((row) => !with90Plus || row.units_91_120 + row.units_121_180 + row.units_181_plus > 0)
      .filter((row) => matchesDemandFilter(row, demandFilter))
      .filter((row) => inDaysFilter(row.days_of_stock_available_period, daysFilter))
      .sort((left, right) => {
        const direction = sort === "days_low" ? -1 : 1;
        return (
          direction * (sortableValue(right, sort) - sortableValue(left, sort)) || left.sku.localeCompare(right.sku)
        );
      });
  }, [
    affectsStockTime,
    bucket,
    data.rows,
    daysFilter,
    demandFilter,
    incompleteCoverage,
    product,
    sku,
    sort,
    withStock,
    with90Plus,
  ]);

  const stockWithSale = data.rows.filter((row) => row.quantity_full > 0 && row.sold_units_available_period > 0).length;
  const stockWithoutSale = data.rows.filter(
    (row) => row.quantity_full > 0 && row.sold_units_available_period === 0,
  ).length;
  const outOfStockWithDemand = data.rows.filter(
    (row) => row.quantity_full === 0 && row.sold_units_available_period > 0,
  ).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl tracking-tight">Estoque FULL</h1>
        <p className="text-muted-foreground text-sm">
          Idade estimada por FIFO com referência no snapshot de {dateTime.format(new Date(data.snapshotAt))}.
        </p>
      </div>

      <Alert>
        <Info />
        <AlertTitle>Estimativa baseada no histórico disponível</AlertTitle>
        <AlertDescription>
          A estimativa considera que as unidades mais antigas saem primeiro. Unidades anteriores ao histórico disponível
          aparecem como idade desconhecida. O FIFO estimado não representa rastreabilidade física do Mercado Livre.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Giro e cobertura de estoque</CardTitle>
          <CardDescription>
            Baseado em vendas de {date.format(new Date(`${data.salesCoverage.coverageStart}T12:00:00Z`))} a{" "}
            {date.format(new Date(`${data.salesCoverage.coverageEndComplete}T12:00:00Z`))} ·{" "}
            {data.salesCoverage.calendarDays} dias completos.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {metric(integer.format(data.salesCoverage.validSoldUnits), "Unidades válidas vendidas")}
          {metric(decimal.format(data.salesCoverage.averageDailySales), "Média diária geral")}
          {metric(integer.format(stockWithSale), "SKUs com estoque e venda")}
          {metric(integer.format(stockWithoutSale), "SKUs com estoque sem venda")}
          {metric(integer.format(outOfStockWithDemand), "Sem estoque com demanda")}
        </CardContent>
        <CardContent className="pt-0 text-muted-foreground text-xs">
          11/08/2026 foi excluído por ser dia parcial: {integer.format(data.salesCoverage.validSoldUnitsPartialDay)}{" "}
          unidades válidas até 15:35. Períodos de 14 e 30 dias e tendência permanecem indisponíveis por falta de
          cobertura.
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metric(integer.format(data.summary.quantityFull), "Estoque atual")}
        {metric(integer.format(data.summary.skusWithStock), "SKUs com estoque")}
        {metric(integer.format(data.summary.knownAgeQuantity), "Unidades com idade conhecida")}
        {metric(integer.format(data.summary.unknownAgeQuantity), "Unidades com idade desconhecida")}
        {metric(
          data.summary.coveragePercentage === null ? "—" : `${coverage.format(data.summary.coveragePercentage)}%`,
          "Cobertura histórica",
        )}
        {metric(
          data.summary.weightedAverageAgeDays === null
            ? "—"
            : `${decimal.format(data.summary.weightedAverageAgeDays)} dias`,
          "Idade média estimada",
          "Somente unidades com idade conhecida",
        )}
        {metric(integer.format(data.summary.units90Plus), "Unidades 90+ dias")}
        {metric(integer.format(data.summary.units180Plus), "Unidades 180+ dias")}
        {metric(
          integer.format(data.summary.unitsAffectStockTime),
          "Unidades que afetam Tempo de estoque",
          "Métrica do Mercado Livre, independente da idade estimada FIFO",
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Distribuição por idade estimada</CardTitle>
          <CardDescription>Quantidade de unidades e participação no estoque atual.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {BUCKETS.map(({ key, label }) => {
            const quantity = data.summary.buckets[key];
            const percentage = data.summary.quantityFull === 0 ? 0 : (quantity / data.summary.quantityFull) * 100;
            const bucketLabel = key === "units_unknown" ? "Idade desconhecida" : `${label} dias`;
            return (
              <div key={key} className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span>{bucketLabel}</span>
                  <span className="font-medium tabular-nums">
                    {integer.format(quantity)} · {decimal.format(percentage)}%
                  </span>
                </div>
                <Progress value={percentage} aria-label={`${label}: ${decimal.format(percentage)}% do estoque`} />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Análise por SKU</CardTitle>
          <CardDescription>{integer.format(rows.length)} SKUs correspondem aos filtros atuais.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FieldGroup className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field>
              <FieldLabel htmlFor="fifo-sku">SKU</FieldLabel>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="fifo-sku" value={sku} onChange={(event) => setSku(event.target.value)} className="pl-9" />
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="fifo-product">Nome do produto</FieldLabel>
              <Input id="fifo-product" value={product} onChange={(event) => setProduct(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel>Faixa de idade</FieldLabel>
              <Select value={bucket} onValueChange={(value) => setBucket(value as FullFifoBucketKey | "all")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">Todas as faixas</SelectItem>
                    {BUCKETS.map((item) => (
                      <SelectItem key={item.key} value={item.key}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Ordenar por</FieldLabel>
              <Select value={sort} onValueChange={(value) => setSort(value as SortKey)}>
                <SelectTrigger className="w-full">
                  <ArrowDownUp />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="quantity">Maior estoque</SelectItem>
                    <SelectItem value="average_age">Maior idade média</SelectItem>
                    <SelectItem value="units_90_plus">Maior quantidade 90+</SelectItem>
                    <SelectItem value="units_180_plus">Maior quantidade 180+</SelectItem>
                    <SelectItem value="unknown">Maior desconhecido</SelectItem>
                    <SelectItem value="stock_time">Maior impacto no Tempo de estoque</SelectItem>
                    <SelectItem value="sold">Maior venda no período</SelectItem>
                    <SelectItem value="average_daily">Maior média diária</SelectItem>
                    <SelectItem value="days_low">Menor dias de estoque</SelectItem>
                    <SelectItem value="days_high">Maior dias de estoque</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Demanda</FieldLabel>
              <Select value={demandFilter} onValueChange={(value) => setDemandFilter(value as DemandFilter)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="with_sale">Com venda</SelectItem>
                    <SelectItem value="without_sale">Sem venda no período</SelectItem>
                    <SelectItem value="out_of_stock_demand">Sem estoque com demanda</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Dias de estoque</FieldLabel>
              <Select value={daysFilter} onValueChange={(value) => setDaysFilter(value as DaysFilter)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">Todas as faixas</SelectItem>
                    <SelectItem value="0_7">0–7</SelectItem>
                    <SelectItem value="8_15">8–15</SelectItem>
                    <SelectItem value="16_30">16–30</SelectItem>
                    <SelectItem value="31_60">31–60</SelectItem>
                    <SelectItem value="61_90">61–90</SelectItem>
                    <SelectItem value="91_plus">91+</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <FieldSet>
            <FieldLegend variant="label">Filtros rápidos</FieldLegend>
            <FieldGroup className="flex flex-row flex-wrap gap-4">
              <Field orientation="horizontal">
                <Checkbox
                  id="with-stock"
                  checked={withStock}
                  onCheckedChange={(value) => setWithStock(value === true)}
                />
                <FieldLabel htmlFor="with-stock">Somente com estoque</FieldLabel>
              </Field>
              <Field orientation="horizontal">
                <Checkbox
                  id="stock-time"
                  checked={affectsStockTime}
                  onCheckedChange={(value) => setAffectsStockTime(value === true)}
                />
                <FieldLabel htmlFor="stock-time">Afeta Tempo de estoque</FieldLabel>
              </Field>
              <Field orientation="horizontal">
                <Checkbox
                  id="coverage"
                  checked={incompleteCoverage}
                  onCheckedChange={(value) => setIncompleteCoverage(value === true)}
                />
                <FieldLabel htmlFor="coverage">Cobertura menor que 100%</FieldLabel>
              </Field>
              <Field orientation="horizontal">
                <Checkbox
                  id="with-90-plus"
                  checked={with90Plus}
                  onCheckedChange={(value) => setWith90Plus(value === true)}
                />
                <FieldLabel htmlFor="with-90-plus">Com unidades 90+</FieldLabel>
              </Field>
            </FieldGroup>
          </FieldSet>

          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead className="min-w-60">Produto</TableHead>
                  <TableHead>Estoque FULL</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Venda período</TableHead>
                  <TableHead>Média/dia</TableHead>
                  <TableHead>Dias estoque</TableHead>
                  <TableHead>Venda 7d</TableHead>
                  <TableHead>Média 7d</TableHead>
                  <TableHead>Dias 7d</TableHead>
                  <TableHead>Venda 14d</TableHead>
                  <TableHead>Dias 14d</TableHead>
                  <TableHead>Venda 30d</TableHead>
                  <TableHead>Dias 30d</TableHead>
                  <TableHead>Tendência</TableHead>
                  <TableHead>Idade média</TableHead>
                  <TableHead>Mais antigo</TableHead>
                  <TableHead>Cobertura</TableHead>
                  {BUCKETS.map(({ key, label }) => (
                    <TableHead key={key}>{label}</TableHead>
                  ))}
                  <TableHead>Afeta tempo</TableHead>
                  <TableHead>
                    <span className="sr-only">Detalhes</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.sku}>
                    <TableCell className="font-medium">{row.sku}</TableCell>
                    <TableCell className="max-w-80 truncate" title={row.product_name ?? undefined}>
                      {row.product_name ?? "Produto não vinculado"}
                    </TableCell>
                    <TableCell className="tabular-nums">{integer.format(row.quantity_full)}</TableCell>
                    <TableCell>
                      <Badge variant={row.velocity_status === "Sem venda no período" ? "outline" : "secondary"}>
                        {row.velocity_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">{integer.format(row.sold_units_available_period)}</TableCell>
                    <TableCell className="tabular-nums">
                      {decimal.format(row.average_daily_sales_available_period)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatStockDays(row.days_of_stock_available_period, row.velocity_status)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {row.sold_units_7d === null ? "—" : integer.format(row.sold_units_7d)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {row.average_daily_sales_7d === null ? "—" : decimal.format(row.average_daily_sales_7d)}
                    </TableCell>
                    <TableCell className="tabular-nums">{formatSevenDayStockDays(row)}</TableCell>
                    <TableCell className="tabular-nums">
                      {row.sold_units_14d === null ? "—" : integer.format(row.sold_units_14d)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {row.days_of_stock_14d === null ? "—" : `${decimal.format(row.days_of_stock_14d)} d`}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {row.sold_units_30d === null ? "—" : integer.format(row.sold_units_30d)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {row.days_of_stock_30d === null ? "—" : `${decimal.format(row.days_of_stock_30d)} d`}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {row.sales_velocity_change_percentage === null
                        ? "—"
                        : `${decimal.format(row.sales_velocity_change_percentage)}%`}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {row.weighted_average_age_days === null
                        ? "—"
                        : `${decimal.format(row.weighted_average_age_days)} d`}
                    </TableCell>
                    <TableCell>
                      {row.oldest_known_remaining_received_at
                        ? date.format(new Date(row.oldest_known_remaining_received_at))
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {row.coverage_percentage === null ? "—" : `${decimal.format(row.coverage_percentage)}%`}
                      </Badge>
                    </TableCell>
                    {BUCKETS.map(({ key }) => (
                      <TableCell key={key} className="tabular-nums">
                        {integer.format(row[key])}
                      </TableCell>
                    ))}
                    <TableCell className="tabular-nums">{integer.format(row.units_affect_stock_time)}</TableCell>
                    <TableCell>
                      <Button variant="outline" size="sm" onClick={() => setSelected(row)}>
                        Lotes
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>FIFO estimado · SKU {selected?.sku}</SheetTitle>
            <SheetDescription>
              Estoque atual: {integer.format(selected?.quantity_full ?? 0)} unidades. Somente lotes com alocação
              estimada maior que zero.
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4 pb-4">
            <Badge variant="secondary" className="w-fit">
              {selected?.estimated_fifo_status}
            </Badge>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recebimento</TableHead>
                    <TableHead>Envio</TableHead>
                    <TableHead>Recebidas</TableHead>
                    <TableHead>Ainda no estoque</TableHead>
                    <TableHead>Idade</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selected?.allocations.map((allocation) => (
                    <TableRow key={`${allocation.inboundId}-${allocation.receivedAt}`}>
                      <TableCell>{date.format(new Date(allocation.receivedAt))}</TableCell>
                      <TableCell>{allocation.inboundId}</TableCell>
                      <TableCell>{integer.format(allocation.unitsProcessed)}</TableCell>
                      <TableCell>{integer.format(allocation.allocatedQuantity)}</TableCell>
                      <TableCell>{integer.format(allocation.ageDays)} dias</TableCell>
                    </TableRow>
                  ))}
                  {selected && selected.unknown_age_quantity > 0 ? (
                    <TableRow>
                      <TableCell colSpan={3}>Anterior ao histórico disponível</TableCell>
                      <TableCell>{integer.format(selected.unknown_age_quantity)}</TableCell>
                      <TableCell>Desconhecida</TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
            {selected && selected.coverage_problem_count > 0 ? (
              <p className="text-muted-foreground text-xs">
                {integer.format(selected.coverage_problem_count)} linha(s) de recebimento sem data ou units_processed
                não puderam contribuir para a cobertura.
              </p>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
