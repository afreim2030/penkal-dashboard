import Link from "next/link";

import { AlertTriangle, ArrowRight, CircleAlert, Info, ListTodo, ShoppingCart, Warehouse } from "lucide-react";

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

function ActionIcon({ severity }: { severity: "critical" | "warning" | "info" }) {
  if (severity === "critical") return <CircleAlert className="mt-0.5 size-5 shrink-0 text-red-600" />;
  if (severity === "warning") return <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />;
  return <Info className="mt-0.5 size-5 shrink-0 text-blue-600" />;
}

export function MainDashboard({ data }: { data: MainDashboardData }) {
  const last7 = data.sales.periods.last7;
  const topSkus = data.sales.topSkus.slice(0, 8);
  const recentInbounds = data.inbounds.inbounds.slice(0, 5);
  const actions = data.alerts.alerts.slice(0, 6);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 border-b pb-5">
        <p className="font-medium text-primary text-xs uppercase tracking-[0.18em]">Painel da operação</p>
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Visão geral</h1>
            <p className="mt-1 text-muted-foreground text-sm">Entenda o cenário e resolva primeiro o que afeta suas vendas.</p>
          </div>
          <Badge variant="outline" className="w-fit">Dados até {formatDate(data.sales.coverage.maxCompleteDate)}</Badge>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.45fr_0.55fr]">
      <Card className="border-amber-300/70 bg-amber-50/40 shadow-sm dark:border-amber-800/70 dark:bg-amber-950/10">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><ListTodo className="size-5" />O que fazer agora</CardTitle>
              <CardDescription>Prioridades que exigem atenção nesta conta.</CardDescription>
            </div>
            <Badge variant="outline">{integer.format(data.alerts.summary.total)} pendências</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {actions.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma pendência encontrada para esta conta.</p>
          ) : (
            actions.map((action) => (
              <Link key={action.id} href={action.href} className="group flex items-center gap-3 rounded-md border bg-background/80 p-3 transition-colors hover:bg-muted/60">
                <ActionIcon severity={action.severity} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm">{action.title}</p>
                  <p className="truncate text-muted-foreground text-xs">{action.description}</p>
                </div>
                {action.value ? <Badge variant="secondary" className="shrink-0">{action.value}</Badge> : null}
                <ArrowRight className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
              </Link>
            ))
          )}
          {data.alerts.summary.total > actions.length ? <Link href="/dashboard/alertas" className="pt-1 text-sm font-medium text-primary hover:underline">Ver todas as pendências ({integer.format(data.alerts.summary.total)})</Link> : null}
        </CardContent>
      </Card>
      <Card className="bg-primary text-primary-foreground shadow-sm">
        <CardHeader className="pb-2">
          <CardDescription className="text-primary-foreground/70">Atalhos de gestão</CardDescription>
          <CardTitle className="text-xl">Acesse a análise certa</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          <Link href="/dashboard/reposicao-full" className="flex items-center justify-between rounded-md bg-primary-foreground/10 px-3 py-2.5 text-sm font-medium hover:bg-primary-foreground/15">Repor estoque FULL <ArrowRight className="size-4" /></Link>
          <Link href="/dashboard/lucro" className="flex items-center justify-between rounded-md bg-primary-foreground/10 px-3 py-2.5 text-sm font-medium hover:bg-primary-foreground/15">Ver lucro por SKU <ArrowRight className="size-4" /></Link>
          <Link href="/dashboard/publicidade" className="flex items-center justify-between rounded-md bg-primary-foreground/10 px-3 py-2.5 text-sm font-medium hover:bg-primary-foreground/15">Revisar publicidade <ArrowRight className="size-4" /></Link>
        </CardContent>
      </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Unidades vendidas · 7 dias</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl tabular-nums">
              <ShoppingCart className="size-5" />
              {last7 ? integer.format(last7.units) : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">Média {last7 ? decimal.format(last7.units / last7.days) : "—"} por dia</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Faturamento · 7 dias</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{last7 ? currency.format(last7.revenue) : "—"}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">{last7 ? integer.format(last7.orders) : "—"} pedidos válidos</CardContent>
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
            <CardDescription>Pendências para revisar</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl tabular-nums">
              <ListTodo className="size-5" />
              {integer.format(data.alerts.summary.total)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">Abra os alertas para decidir a próxima ação</CardContent>
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
