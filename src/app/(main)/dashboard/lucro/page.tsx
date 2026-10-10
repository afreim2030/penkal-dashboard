import { createClient } from "@/lib/supabase/server";
import { importUnitCosts, saveUnitCost } from "./_actions/cost-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Link from "next/link";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });

export default async function Page({ searchParams }: { searchParams: Promise<{ period?: string; start?: string; end?: string }> }) {
  const { period = "7d", start: requestedStart, end: requestedEnd } = await searchParams;
  const isDate = (value: string | undefined) => Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
  const hasCustomRange = isDate(requestedStart) && isDate(requestedEnd) && requestedStart! <= requestedEnd!;
  const end = hasCustomRange ? new Date(`${requestedEnd}T12:00:00`) : new Date();
  const days = period === "yesterday" ? 1 : period === "7d" ? 7 : period === "30d" ? 30 : period === "month" ? end.getDate() : 1;
  if (!hasCustomRange && period === "yesterday") end.setDate(end.getDate() - 1);
  const start = hasCustomRange ? new Date(`${requestedStart}T12:00:00`) : new Date(end); if (!hasCustomRange) start.setDate(start.getDate() - days + 1);
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  const previousEnd = new Date(start); previousEnd.setDate(previousEnd.getDate() - 1);
  const previousStart = new Date(previousEnd); previousStart.setDate(previousStart.getDate() - days + 1);
  const supabase = await createClient();
  const { data: account } = await supabase.rpc("get_active_marketplace_account_id");
  const [{ data: products }, { data: costs }] = await Promise.all([
    supabase.from("products").select("id,sku,name").eq("account_id", account ?? "").is("excluded_at", null).order("sku"),
    supabase.from("product_costs").select("product_id,unit_cost").eq("account_id", account ?? ""),
  ]);
  const costByProduct = new Map((costs ?? []).map((cost) => [cost.product_id, Number(cost.unit_cost)]));
  const [{ data: current }, { data: previous }, { data: byProduct }] = await Promise.all([
    supabase.rpc("get_profit_dashboard_data", { p_start: iso(start), p_end: iso(end) }),
    supabase.rpc("get_profit_dashboard_data", { p_start: iso(previousStart), p_end: iso(previousEnd) }),
    supabase.rpc("get_profit_by_product", { p_start: iso(start), p_end: iso(end) }),
  ]);
  const metrics = (current ?? {}) as { revenue?: number; contribution?: number; adsInvestment?: number; afterAds?: number };
  const before = (previous ?? {}) as typeof metrics;
  const cards = [["Faturamento", metrics.revenue ?? 0, before.revenue ?? 0], ["Margem de contribuição", metrics.contribution ?? 0, before.contribution ?? 0], ["Despesas com publicidade", metrics.adsInvestment ?? 0, before.adsInvestment ?? 0], ["Lucro após Ads", metrics.afterAds ?? 0, before.afterAds ?? 0]] as const;
  const productMargins = (byProduct ?? []) as Array<{sku:string;name:string;units:number;revenue:number;productCosts:number;operationalCosts:number;adsInvestment:number;afterAds:number}>;
  if (period === "costs") return <main className="flex flex-col gap-5"><div><Link href="/dashboard/lucro" className="text-sm text-primary hover:underline">← Voltar para lucratividade</Link><h1 className="mt-2 text-3xl font-semibold tracking-tight">Custos por SKU</h1></div><Card><CardContent className="overflow-x-auto pt-6"><Table><TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Produto</TableHead><TableHead className="text-right">Custo unitário</TableHead></TableRow></TableHeader><TableBody>{(products ?? []).map((product) => <TableRow key={product.id}><TableCell className="font-medium">{product.sku}</TableCell><TableCell className="max-w-[420px] truncate" title={product.name}>{product.name}</TableCell><TableCell><form action={saveUnitCost} className="flex justify-end gap-2"><input name="productId" type="hidden" value={product.id}/><Input name="unitCost" defaultValue={costByProduct.get(product.id) ?? ""} inputMode="decimal" placeholder="0,00" className="w-28 text-right"/><Button size="sm">Salvar</Button></form></TableCell></TableRow>)}</TableBody></Table></CardContent></Card></main>;
  return <main className="flex flex-col gap-5">
    <div><h1 className="text-3xl font-semibold tracking-tight">Lucro por SKU</h1><p className="text-muted-foreground text-sm">Resultado da conta ativa usando somente dias completos: faturamento menos custo do produto, tarifas, fretes, descontos, reembolsos e Ads.</p></div>
    <Card><CardContent className="flex flex-col gap-3 p-3"><div className="flex flex-wrap gap-2">{[["today","Hoje"],["yesterday","Ontem"],["7d","Últimos 7 dias"],["30d","Últimos 30 dias"],["month","Este mês"]].map(([value,label]) => <Link key={value} href={`/dashboard/lucro?period=${value}`} className={`rounded-md px-3 py-2 text-sm font-medium ${!hasCustomRange && period === value ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{label}</Link>)}</div><form className="flex flex-wrap items-end gap-2" action="/dashboard/lucro"><label className="grid gap-1 text-sm font-medium">De<Input name="start" type="date" defaultValue={hasCustomRange ? requestedStart : iso(start)} className="w-40"/></label><label className="grid gap-1 text-sm font-medium">Até<Input name="end" type="date" defaultValue={hasCustomRange ? requestedEnd : iso(end)} className="w-40"/></label><Button type="submit">Aplicar período</Button></form></CardContent></Card>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label,value,old]) => { const change = old ? ((value - old) / Math.abs(old)) * 100 : null; return <Card key={label}><CardHeader className="pb-2"><CardDescription>{label}</CardDescription><CardTitle className="text-2xl tabular-nums">{money.format(value)}</CardTitle></CardHeader><CardContent className="text-muted-foreground text-xs">{change === null ? "Sem comparação anterior" : `${change >= 0 ? "+" : ""}${change.toFixed(1).replace(".", ",")}% vs. período anterior`}</CardContent></Card>; })}</div>
    <Card><CardHeader><CardTitle>Resultado por produto</CardTitle><CardDescription>Ordenado do menor para o maior lucro após Ads. Valores são do período selecionado.</CardDescription></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Produto</TableHead><TableHead className="text-right">Unidades</TableHead><TableHead className="text-right">Faturamento</TableHead><TableHead className="text-right">Custo produto</TableHead><TableHead className="text-right">Tarifas e fretes</TableHead><TableHead className="text-right">Ads</TableHead><TableHead className="text-right">Lucro após Ads</TableHead><TableHead className="text-right">Margem</TableHead></TableRow></TableHeader><TableBody>{productMargins.length === 0 ? <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">Não há vendas para este período.</TableCell></TableRow> : productMargins.map(row=>{ const margin = row.revenue > 0 ? row.afterAds / row.revenue : 0; return <TableRow key={row.sku}><TableCell className="font-medium">{row.sku}</TableCell><TableCell className="max-w-80 truncate" title={row.name}>{row.name}</TableCell><TableCell className="text-right tabular-nums">{integer.format(row.units)}</TableCell><TableCell className="text-right tabular-nums">{money.format(row.revenue)}</TableCell><TableCell className="text-right tabular-nums">{money.format(row.productCosts)}</TableCell><TableCell className="text-right tabular-nums">{money.format(row.operationalCosts)}</TableCell><TableCell className="text-right tabular-nums">{money.format(row.adsInvestment)}</TableCell><TableCell className={row.afterAds<0?"text-right font-semibold tabular-nums text-red-600":"text-right font-semibold tabular-nums text-emerald-600"}>{money.format(row.afterAds)}</TableCell><TableCell className={margin<0?"text-right font-medium tabular-nums text-red-600":"text-right font-medium tabular-nums text-emerald-600"}>{percent.format(margin)}</TableCell></TableRow>})}</TableBody></Table></CardContent></Card>
    <Card><CardHeader><CardTitle>Importar custos por planilha</CardTitle><CardDescription>Envie XLSX com as colunas SKU e CUSTO UNITÁRIO.</CardDescription></CardHeader><CardContent><form action={importUnitCosts} className="flex flex-wrap gap-3"><Input name="file" type="file" accept=".xlsx" className="max-w-sm" required/><Button>Importar custos</Button></form></CardContent></Card>
    <Card><CardHeader><CardTitle>Custos por SKU</CardTitle><CardDescription>Para preencher manualmente, use a tabela abaixo nesta mesma página.</CardDescription></CardHeader><CardContent><Link className="text-sm font-medium text-primary hover:underline" href="/dashboard/lucro?period=costs">Abrir edição de custos por SKU</Link></CardContent></Card>
  </main>;
}
