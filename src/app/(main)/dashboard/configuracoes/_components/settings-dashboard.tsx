import { AlertTriangle, CheckCircle2, CircleDashed, Database, LockKeyhole, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import type { SettingsDashboardData, SourceHealthStatus } from "../_lib/load-settings-dashboard";

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function HealthBadge({ status, label }: { status: SourceHealthStatus; label: string }) {
  if (status === "ok") {
    return (
      <Badge className="gap-1" variant="outline">
        <CheckCircle2 className="size-3.5 text-emerald-600" /> {label}
      </Badge>
    );
  }
  if (status === "warning") {
    return (
      <Badge className="gap-1" variant="outline">
        <AlertTriangle className="size-3.5 text-amber-600" /> {label}
      </Badge>
    );
  }
  return (
    <Badge className="gap-1" variant="secondary">
      <CircleDashed className="size-3.5" /> {label}
    </Badge>
  );
}

export function SettingsDashboard({ data }: { data: SettingsDashboardData }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground text-sm">Conta, regras fixas do painel e situação das fontes de dados.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Conta</CardDescription>
            <CardTitle className="flex items-center gap-2 text-lg">
              <LockKeyhole className="size-5" /> Acesso privado
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Usuário</p>
              <p className="truncate font-medium">{data.account.email ?? "Usuário autenticado"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Modo de acesso</p>
              <p>{data.account.accessMode}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Horário do negócio</CardDescription>
            <CardTitle className="text-lg">São Paulo</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p className="text-muted-foreground">{data.account.timezone}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Vendas diárias e comparações usam a data comercial do Brasil, não UTC.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Saúde da base</CardDescription>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Database className="size-5" /> {data.health.failedImports} falhas pendentes
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p>{data.health.conflicts} conflitos de vendas registrados.</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Falhas e conflitos ficam visíveis; o sistema não preenche dados ausentes por suposição.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fontes de dados</CardTitle>
          <CardDescription>Último estado conhecido de cada parte da operação.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-36">Fonte</TableHead>
                <TableHead className="min-w-40">Situação</TableHead>
                <TableHead className="min-w-[360px]">Detalhe</TableHead>
                <TableHead className="min-w-40 text-right">Última atualização</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.health.sources.map((source) => (
                <TableRow key={source.key}>
                  <TableCell className="font-medium">{source.label}</TableCell>
                  <TableCell>
                    <HealthBadge status={source.status} label={source.statusLabel} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{source.detail}</TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {formatDateTime(source.lastUpdate)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5" /> Regras fixas de integridade
          </CardTitle>
          <CardDescription>Critérios que o painel deve respeitar em todas as telas.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-2">
          <div className="rounded-lg border p-4">
            <p className="font-medium">Produto = SKU</p>
            <p className="mt-1 text-muted-foreground">
              O SKU identifica o produto. Um mesmo SKU pode ter vários anúncios, sem duplicar o produto.
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="font-medium">Estoque real = FULL</p>
            <p className="mt-1 text-muted-foreground">
              O painel usa somente a quantidade oficial do relatório FULL como estoque atual.
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="font-medium">SKU ausente não é inventado</p>
            <p className="mt-1 text-muted-foreground">
              Registros sem vínculo confiável permanecem sem identificação até existir uma correspondência real.
            </p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="font-medium">Comparações exigem cobertura completa</p>
            <p className="mt-1 text-muted-foreground">
              Dias parciais podem ser exibidos, mas não entram silenciosamente em comparativos fechados.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
