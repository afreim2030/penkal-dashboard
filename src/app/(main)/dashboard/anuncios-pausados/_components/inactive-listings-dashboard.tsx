import { CirclePause, PackageX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import type { InactiveListingRow } from "../_lib/load-inactive-listings-dashboard";

function formatDate(value: string | null): string {
  if (!value) return "Data não disponível";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function InactiveListingsDashboard({ rows }: { rows: InactiveListingRow[] }) {
  const historical = rows.filter((row) => row.source === "histórico importado").length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Anúncios pausados</h1>
        <p className="text-muted-foreground text-sm">
          Veja quais anúncios estão inativos ou pausados e quando esta situação foi registrada.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Anúncios atualmente pausados</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl tabular-nums">
              <CirclePause className="size-5" /> {rows.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">Conta atualmente visualizada</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Datas históricas estimadas</CardDescription>
            <CardTitle className="flex items-center gap-2 text-2xl tabular-nums">
              <PackageX className="size-5" /> {historical}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">Identificadas na última importação do catálogo</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quando cada anúncio foi pausado</CardTitle>
          <CardDescription>
            A partir de agora, toda troca para Inativo ou Pausado será registrada automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Produto / anúncio</TableHead>
                <TableHead>MLB</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data da pausa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Não há anúncios pausados nesta conta.</TableCell></TableRow>
              ) : rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.sku ?? "Sem SKU"}</TableCell>
                  <TableCell className="max-w-[480px]">
                    <p className="truncate font-medium" title={row.title}>{row.title}</p>
                    {row.productName && row.productName !== row.title ? <p className="truncate text-muted-foreground text-xs">{row.productName}</p> : null}
                  </TableCell>
                  <TableCell className="tabular-nums">{row.mlb ?? "—"}</TableCell>
                  <TableCell><Badge variant="secondary">{row.status}</Badge></TableCell>
                  <TableCell>
                    <p>{formatDate(row.pausedAt)}</p>
                    {row.source === "histórico importado" ? <p className="text-muted-foreground text-xs">Identificado pelo sistema</p> : null}
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
