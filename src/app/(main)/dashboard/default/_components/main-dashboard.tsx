import Link from "next/link";

import { ArrowRight, Boxes, PackageCheck, ShoppingCart, Truck, Warehouse } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import type { MainDashboardData } from "../_lib/load-main-dashboard";

const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = value.slice(0, 10);
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function QuickLink({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link href={href} className="group rounded-lg border p-4 transition-colors hover:bg-muted/50">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium">{title}</p>
          <p className="mt-1 text-muted-foreground text-xs">{description}</p>
        </div>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

export function MainDashboard({ data }: { data: MainDashboardData }) {
  const latest = data.sales.latestDay;
  const last7 = data.sales.periods.last7;
  const topSkus = data.sales.topSkus.slice(0, 8);
  const recentInbounds = data.inbounds.inbounds.slice(0, 5);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard Mercado Livre</h1>
        <p className="text-muted-foreground text-sm">
          Visão executiva da operação. Vendas fechadas até {formatDate(data.sales.coverage.maxCompleteDate)}.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Unidades no último dia</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl tabular-nums">
              <ShoppingCart className="size-5" />
              {integer.format(latest.units)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">Dia completo {formatDate(latest.date)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Faturamento do dia</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{currency.format(latest.revenue)}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            {integer.format(latest.orders)} pedidos válidos
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Estoque FULL</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl tabular-nums">
              <Warehouse className="size-5" />
              {integer.format(data.fullStock)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            {integer.format(data.products.summary.withFullStock)} SKUs com saldo
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Afetando tempo de estoque</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl tabular-nums">
              <Boxes className="size-5" />
              {integer.format(data.products.summary.stockTimeAffectedUnits)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">Unidades no snapshot FULL mais recente</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Recebido pelo FULL</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl tabular-nums">
              <PackageCheck className="size-5" />
              {integer.format(data.inbounds.summary.processed)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            {integer.format(data.inbounds.summary.inbounds)} envios no histórico
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Ritmo de vendas</CardTitle>
            <CardDescription>Últimos 7 dias completos disponíveis.</CardDescription>
          </CardHeader>
          <CardContent>
            {last7 ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <div>
                  <p className="text-muted-foreground text-xs">Unidades</p>
                  <p className="text-3xl font-semibold tabular-nums">{integer.format(last7.units)}</p>
                  <p className="text-muted-foreground text-xs">
                    Média {decimal.format(last7.units / last7.days)} por dia
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Faturamento</p>
                  <p className="text-2xl font-semibold tabular-nums">{currency.format(last7.revenue)}</p>
                  <p className="text-muted-foreground text-xs">{integer.format(last7.orders)} pedidos</p>
                </div>
                <div className="border-t pt-3 text-muted-foreground text-xs">
                  {formatDate(last7.start)} até {formatDate(last7.end)}
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Ainda não há 7 dias completos consecutivos.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Produtos que mais venderam</CardTitle>
            <CardDescription>Ranking por unidades usando somente dias completos.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Unidades</TableHead>
                  <TableHead className="text-right">Faturamento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topSkus.map((row) => (
                  <TableRow key={row.sku}>
                    <TableCell className="font-medium">{row.sku}</TableCell>
                    <TableCell className="max-w-[380px] truncate" title={row.productName ?? undefined}>
                      {row.productName ?? "Produto sem nome vinculado"}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{integer.format(row.units)}</TableCell>
                    <TableCell className="text-right tabular-nums">{currency.format(row.revenue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tempo de estoque</CardTitle>
            <CardDescription>SKUs com mais unidades atualmente afetando a métrica.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">FULL</TableHead>
                  <TableHead className="text-right">Afetadas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.affectedProducts.map((row) => (
                  <TableRow key={row.sku}>
                    <TableCell className="font-medium">{row.sku}</TableCell>
                    <TableCell className="max-w-[320px] truncate" title={row.name}>
                      {row.name}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{integer.format(row.fullStock)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline">{integer.format(row.stockTimeAffected)}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recebimentos FULL recentes</CardTitle>
            <CardDescription>Últimos envios processados pelo Mercado Livre.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Envio</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="text-right">Processadas</TableHead>
                  <TableHead className="text-right">Diferença</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentInbounds.map((row) => (
                  <TableRow key={row.inboundId}>
                    <TableCell className="font-medium tabular-nums">{row.inboundId}</TableCell>
                    <TableCell>{formatDate(row.receivedAt)}</TableCell>
                    <TableCell className="text-right tabular-nums">{integer.format(row.processed)}</TableCell>
                    <TableCell
                      className={
                        row.difference < 0
                          ? "text-right text-red-600 tabular-nums dark:text-red-400"
                          : row.difference > 0
                            ? "text-right text-emerald-600 tabular-nums dark:text-emerald-400"
                            : "text-right text-muted-foreground tabular-nums"
                      }
                    >
                      {row.difference > 0 ? "+" : ""}
                      {integer.format(row.difference)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Acessos rápidos</CardTitle>
          <CardDescription>Abra diretamente a análise que precisa.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <QuickLink href="/dashboard/vendas" title="Vendas" description="Dias, horários e ranking por SKU" />
          <QuickLink href="/dashboard/produtos" title="Produtos" description="Catálogo consolidado por SKU" />
          <QuickLink href="/dashboard/estoque-full" title="Estoque FULL" description="FIFO, giro e cobertura" />
          <QuickLink href="/dashboard/envios-full" title="Envios FULL" description="Recebimentos e diferenças" />
        </CardContent>
      </Card>
    </div>
  );
}
