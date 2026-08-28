import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import { saveIdentifierOverride } from "../_actions/link-actions";
import type { LinkingDashboardData } from "../_lib/load-linking-dashboard";

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

export function LinkingDashboard({ data }: { data: LinkingDashboardData }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Vínculos pendentes</h1>
        <p className="text-muted-foreground text-sm">
          Corrija SKUs e MLBs antigos sem alterar o conteúdo original das importações.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Identificadores pendentes" value={data.summary.identifiers} />
        <SummaryCard label="Linhas afetadas" value={data.summary.affectedRows} />
        <SummaryCard label="SKUs pendentes" value={data.summary.skuIdentifiers} />
        <SummaryCard label="MLBs pendentes" value={data.summary.mlbIdentifiers} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fila de correção</CardTitle>
          <CardDescription>
            Informe um SKU ou MLB que já exista no catálogo. Resumos de vendas e itens FULL com vários anúncios são
            tratados separadamente e não entram nesta fila.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {data.issues.length === 0 ? (
            <p className="text-muted-foreground text-sm">Todos os identificadores estão vinculados.</p>
          ) : (
            data.issues.map((issue) => (
              <div
                className="grid gap-3 rounded-lg border p-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(260px,0.8fr)] lg:items-center"
                key={`${issue.identifierType}:${issue.rawValue}:${issue.source}`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{issue.identifierType.toUpperCase()}</Badge>
                    <Badge variant="secondary">{issue.source}</Badge>
                    <span className="font-mono text-sm">{issue.rawValue}</span>
                  </div>
                </div>
                <span className="text-muted-foreground text-sm tabular-nums">
                  {issue.affectedRows} {issue.affectedRows === 1 ? "linha" : "linhas"}
                </span>
                <form action={saveIdentifierOverride} className="flex gap-2">
                  <input name="identifierType" type="hidden" value={issue.identifierType} />
                  <input name="rawValue" type="hidden" value={issue.rawValue} />
                  <Input
                    aria-label={issue.identifierType === "sku" ? "SKU correto" : "MLB correto"}
                    name="targetValue"
                    placeholder={issue.identifierType === "sku" ? "SKU correto" : "MLB correto"}
                    required
                  />
                  <Button type="submit">Vincular</Button>
                </form>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
