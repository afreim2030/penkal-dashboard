import { AlertTriangle, CheckCircle2, PackageCheck, Truck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import type { FullInboundsDashboardData } from "../_lib/load-full-inbounds-dashboard";

const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function Difference({ value }: { value: number }) {
  if (value === 0) return <span className="text-muted-foreground">0</span>;
  return (
    <span
      className={
        value > 0 ? "font-medium text-emerald-600 dark:text-emerald-400" : "font-medium text-red-600 dark:text-red-400"
      }
    >
      {value > 0 ? "+" : ""}
      {integer.format(value)}
    </span>
  );
}

export function FullInboundsDashboard({ data }: { data: FullInboundsDashboardData }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Envios FULL</h1>
        <p className="text-muted-foreground text-sm">
          Histórico real de recebimentos no Mercado Livre FULL, consolidado por envio e por SKU.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Envios recebidos</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl tabular-nums">
              <Truck className="size-5" />
              {integer.format(data.summary.inbounds)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            {formatDate(data.summary.firstReceivedAt)} até {formatDate(data.summary.lastReceivedAt)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Unidades declaradas</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{integer.format(data.summary.declared)}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">Quantidade enviada ao FULL</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Unidades processadas</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl tabular-nums">
              <PackageCheck className="size-5" />
              {integer.format(data.summary.processed)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            {integer.format(data.summary.sellable)} vendáveis
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Diferença acumulada</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              <Difference value={data.summary.difference} />
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">Processadas menos declaradas</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Envios com diferença</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl tabular-nums">
              <AlertTriangle className="size-5" />
              {integer.format(data.summary.withDifference)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            {integer.format(data.summary.unidentified)} unidades não identificadas
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de envios</CardTitle>
          <CardDescription>Comparação entre quantidade declarada e efetivamente processada pelo FULL.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Envio</TableHead>
                <TableHead>Recebido em</TableHead>
                <TableHead className="text-right">SKUs</TableHead>
                <TableHead className="text-right">Declaradas</TableHead>
                <TableHead className="text-right">Processadas</TableHead>
                <TableHead className="text-right">Diferença</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.inbounds.map((row) => (
                <TableRow key={row.inboundId}>
                  <TableCell className="font-medium tabular-nums">{row.inboundId}</TableCell>
                  <TableCell>{formatDate(row.receivedAt)}</TableCell>
                  <TableCell className="text-right tabular-nums">{integer.format(row.skus)}</TableCell>
                  <TableCell className="text-right tabular-nums">{integer.format(row.declared)}</TableCell>
                  <TableCell className="text-right tabular-nums">{integer.format(row.processed)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Difference value={row.difference} />
                  </TableCell>
                  <TableCell>
                    {row.hasDifference ? (
                      <Badge variant="outline" className="gap-1">
                        <AlertTriangle className="size-3" />
                        Com diferença
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <CheckCircle2 className="size-3" />
                        Correto
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Maiores diferenças por SKU</CardTitle>
            <CardDescription>Diferença acumulada entre processado e declarado em todos os envios.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Declaradas</TableHead>
                  <TableHead className="text-right">Processadas</TableHead>
                  <TableHead className="text-right">Dif.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topDifferences.map((row) => (
                  <TableRow key={row.sku ?? `sem-sku-${row.productName}`}>
                    <TableCell className="font-medium">{row.sku ?? "Sem SKU"}</TableCell>
                    <TableCell className="max-w-[260px] truncate" title={row.productName ?? undefined}>
                      {row.productName ?? "Produto não identificado"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{integer.format(row.declared)}</TableCell>
                    <TableCell className="text-right tabular-nums">{integer.format(row.processed)}</TableCell>
                    <TableCell className="text-right">
                      <Difference value={row.difference} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mais unidades recebidas</CardTitle>
            <CardDescription>SKUs com maior volume processado no histórico FULL.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Processadas</TableHead>
                  <TableHead className="text-right">Envios</TableHead>
                  <TableHead>Último receb.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topReceived.map((row) => (
                  <TableRow key={row.sku ?? `sem-sku-${row.productName}`}>
                    <TableCell className="font-medium">{row.sku ?? "Sem SKU"}</TableCell>
                    <TableCell className="max-w-[260px] truncate" title={row.productName ?? undefined}>
                      {row.productName ?? "Produto não identificado"}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {integer.format(row.processed)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{integer.format(row.inboundCount)}</TableCell>
                    <TableCell>{formatDate(row.lastReceivedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
