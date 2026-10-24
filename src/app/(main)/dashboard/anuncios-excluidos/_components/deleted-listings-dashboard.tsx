import { PackageX, Trash2 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import type { DeletedListingRow } from "../_lib/load-deleted-listings-dashboard";

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

export function DeletedListingsDashboard({ rows }: { rows: DeletedListingRow[] }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Anúncios excluídos</h1>
        <p className="text-muted-foreground text-sm">
          Anúncios que não constam mais no último relatório completo da conta. Eles não aparecem nas telas normais de
          produtos.
        </p>
      </div>
      <Card className="max-w-sm">
        <CardHeader className="pb-2">
          <CardDescription>Excluídos da plataforma</CardDescription>
          <CardTitle className="flex items-center gap-2 text-2xl tabular-nums">
            <Trash2 className="size-5" /> {rows.length}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-xs">Conta atualmente visualizada</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Histórico de anúncios excluídos</CardTitle>
          <CardDescription>
            Se um anúncio voltar a aparecer em uma nova planilha, ele será restaurado automaticamente com o status
            informado pelo Mercado Livre.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Produto / anúncio</TableHead>
                <TableHead>MLB</TableHead>
                <TableHead>Identificado como excluído</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                    Não há anúncios excluídos nesta conta.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.sku ?? "Sem SKU"}</TableCell>
                    <TableCell className="max-w-[520px]">
                      <p className="truncate font-medium" title={row.title}>
                        {row.title}
                      </p>
                      {row.productName && row.productName !== row.title ? (
                        <p className="truncate text-muted-foreground text-xs">{row.productName}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="tabular-nums">{row.mlb ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(row.deletedAt)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {rows.length > 0 ? (
        <p className="flex items-center gap-2 text-muted-foreground text-xs">
          <PackageX className="size-4" /> O histórico de vendas permanece preservado, mas os anúncios não entram nas
          listagens ativas ou pausadas.
        </p>
      ) : null}
    </div>
  );
}
