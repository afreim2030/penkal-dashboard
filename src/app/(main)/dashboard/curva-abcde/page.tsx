import { AlertCircle, ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import type { Curve } from "./_lib/load-abcde-dashboard";
import { loadAbcdeDashboard } from "./_lib/load-abcde-dashboard";

const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const percentage = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function month(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function CurveBadge({ curve }: { curve: Curve }) {
  const styles = { A: "bg-emerald-600 text-white", B: "bg-blue-600 text-white", C: "bg-amber-500 text-white", D: "bg-orange-600 text-white", E: "bg-slate-600 text-white" };
  return <Badge className={styles[curve]}>Curva {curve}</Badge>;
}

function Movement({ previous, current, movement }: { previous: Curve | null; current: Curve; movement: string }) {
  if (!previous) return <span className="text-muted-foreground text-xs">Sem comparação</span>;
  if (movement === "caiu") return <span className="flex items-center gap-1 font-medium text-red-600 text-sm"><ArrowDownRight className="size-4" />{previous} <ArrowRight className="size-3" /> {current}</span>;
  if (movement === "subiu") return <span className="flex items-center gap-1 font-medium text-emerald-600 text-sm"><ArrowUpRight className="size-4" />{previous} <ArrowRight className="size-3" /> {current}</span>;
  return <span className="flex items-center gap-1 text-muted-foreground text-sm"><Minus className="size-4" />{previous} <ArrowRight className="size-3" /> {current}</span>;
}

export default async function Page() {
  try {
    const data = await loadAbcdeDashboard();
    if (!data || data.rows.length === 0) {
      return <Alert><AlertCircle /><AlertTitle>Sem dados de performance</AlertTitle><AlertDescription>Importe relatórios de desempenho para montar a Curva ABCDE.</AlertDescription></Alert>;
    }
    return <main className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <p className="font-medium text-primary text-xs uppercase tracking-[0.18em]">Classificação por faturamento</p>
        <h1 className="text-3xl font-semibold tracking-tight">Curva ABCDE</h1>
        <p className="text-muted-foreground text-sm">Compare {month(data.currentMonth)} com {month(data.previousMonth)}. A queda de curva aparece diretamente como A → C.</p>
      </div>
      {!data.hasPreviousMonth ? <Alert><AlertCircle /><AlertTitle>Ainda não há mês anterior</AlertTitle><AlertDescription>A Curva atual já está calculada. Importe a performance do mês anterior para exibir as mudanças de curva.</AlertDescription></Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardDescription>Produtos analisados</CardDescription><CardTitle className="text-2xl tabular-nums">{integer.format(data.summary.products)}</CardTitle></CardHeader><CardContent className="text-muted-foreground text-xs">Com visitas, vendas ou faturamento</CardContent></Card>
        <Card className="border-red-200"><CardHeader className="pb-2"><CardDescription>Caíram de curva</CardDescription><CardTitle className="text-2xl tabular-nums text-red-600">{integer.format(data.summary.dropped)}</CardTitle></CardHeader><CardContent className="text-muted-foreground text-xs">Ex.: Curva A → Curva C</CardContent></Card>
        <Card className="border-emerald-200"><CardHeader className="pb-2"><CardDescription>Subiram de curva</CardDescription><CardTitle className="text-2xl tabular-nums text-emerald-600">{integer.format(data.summary.improved)}</CardTitle></CardHeader><CardContent className="text-muted-foreground text-xs">Ganharam participação no faturamento</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Mantiveram a curva</CardDescription><CardTitle className="text-2xl tabular-nums">{integer.format(data.summary.stable)}</CardTitle></CardHeader><CardContent className="text-muted-foreground text-xs">Mesmo grupo no mês anterior</CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Produtos e mudança de curva</CardTitle><CardDescription>Curva A concentra os produtos com maior faturamento acumulado; B, C, D e E seguem a participação restante.</CardDescription></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>SKU / MLB</TableHead><TableHead>Produto</TableHead><TableHead>Curva atual</TableHead><TableHead>Mudança</TableHead><TableHead className="text-right">Visitas</TableHead><TableHead className="text-right">Vendas</TableHead><TableHead className="text-right">Conversão</TableHead><TableHead className="text-right">Faturamento</TableHead></TableRow></TableHeader><TableBody>{data.rows.map((row) => <TableRow key={`${row.sku ?? ""}-${row.mlb ?? ""}`}><TableCell className="whitespace-nowrap font-medium"><div>{row.sku ?? "—"}</div><div className="text-muted-foreground text-xs">{row.mlb ?? ""}</div></TableCell><TableCell className="min-w-64 max-w-96"><p className="truncate" title={row.productName}>{row.productName}</p></TableCell><TableCell><CurveBadge curve={row.currentCurve} /></TableCell><TableCell><Movement previous={row.previousCurve} current={row.currentCurve} movement={row.movement} /></TableCell><TableCell className="text-right tabular-nums">{integer.format(row.currentVisits)}</TableCell><TableCell className="text-right tabular-nums">{integer.format(row.currentSales)}</TableCell><TableCell className="text-right tabular-nums">{percentage.format(row.currentConversion)}</TableCell><TableCell className="text-right tabular-nums">{currency.format(row.currentRevenue)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
    </main>;
  } catch (error) {
    return <Alert variant="destructive"><AlertCircle /><AlertTitle>Não foi possível carregar a Curva ABCDE</AlertTitle><AlertDescription>{error instanceof Error ? error.message : "Ocorreu um erro ao consultar os dados."}</AlertDescription></Alert>;
  }
}
