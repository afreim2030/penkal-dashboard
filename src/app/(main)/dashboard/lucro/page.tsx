import { createClient } from "@/lib/supabase/server";
import { importUnitCosts, saveUnitCost } from "./_actions/cost-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Link from "next/link";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default async function Page({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period = "today" } = await searchParams;
  const end = new Date();
  const days = period === "yesterday" ? 1 : period === "7d" ? 7 : period === "30d" ? 30 : period === "month" ? end.getDate() : 1;
  if (period === "yesterday") end.setDate(end.getDate() - 1);
  const start = new Date(end); start.setDate(start.getDate() - days + 1);
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  const previousEnd = new Date(start); previousEnd.setDate(previousEnd.getDate() - 1);
  const previousStart = new Date(previousEnd); previousStart.setDate(previousStart.getDate() - days + 1);
  const supabase = await createClient();
  const { data: account } = await supabase.rpc("get_active_marketplace_account_id");
  const [{ data: products }, { data: costs }] = await Promise.all([
    supabase.from("products").select("id,sku,name").eq("account_id", account ?? "").order("sku"),
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
  const cards = [["Vendas", metrics.revenue ?? 0, before.revenue ?? 0], ["Margem de contribuição", metrics.contribution ?? 0, before.contribution ?? 0], ["Despesas com publicidade", metrics.adsInvestment ?? 0, before.adsInvestment ?? 0], ["Margem após Ads", metrics.afterAds ?? 0, before.afterAds ?? 0]] as const;
  const productMargins = (byProduct ?? []) as Array<{sku:string;name:string;units:number;revenue:number;productCosts:number;operationalCosts:number;adsInvestment:number;afterAds:number}>;
  if (period === "costs") return <main className="flex flex-col gap-5"><div><Link href="/dashboard/lucro" className="text-sm text-primary hover:underline">← Voltar para lucratividade</Link><h1 className="mt-2 text-3xl font-semibold tracking-tight">Custos por SKU</h1></div><Card><CardContent className="overflow-x-auto pt-6"><Table><TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Produto</TableHead><TableHead className="text-right">Custo unitário</TableHead></TableRow></TableHeader><TableBody>{(products ?? []).map((product) => <TableRow key={product.id}><TableCell className="font-medium">{product.sku}</TableCell><TableCell>{product.name}</TableCell><TableCell><form action={saveUnitCost} className="flex justify-end gap-2"><input name="productId" type="hidden" value={product.id}/><Input name="unitCost" defaultValue={costByProduct.get(product.id) ?? ""} inputMode="decimal" placeholder="0,00" className="w-28 text-right"/><Button size="sm">Salvar</Button></form></TableCell></TableRow>)}</TableBody></Table></CardContent></Card></main>;
  return <main className="flex flex-col gap-5">
    <div><h1 className="text-3xl font-semibold tracking-tight">Lucratividade</h1><p className="text-muted-foreground text-sm">Resultado da conta ativa com custos, tarifas, fretes e publicidade.</p></div>
    <Card><CardContent className="flex flex-wrap gap-2 p-3">{[["today","Hoje"],["yesterday","Ontem"],["7d","Últimos 7 dias"],["30d","Últimos 30 dias"],["month","Este mês"]].map(([value,label]) => <Link key={value} href={`/dashboard/lucro?period=${value}`} className={`rounded-md px-3 py-2 text-sm font-medium ${period === value ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{label}</Link>)}</CardContent></Card>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label,value,old]) => { const change = old ? ((value - old) / Math.abs(old)) * 100 : null; return <Card key={label}><CardHeader className="pb-2"><CardDescription>{label}</CardDescription><CardTitle className="text-2xl tabular-nums">{money.format(value)}</CardTitle></CardHeader><CardContent className="text-muted-foreground text-xs">{change === null ? "Sem comparação anterior" : `${change >= 0 ? "+" : ""}${change.toFixed(1).replace(".", ",")}% vs. período anterior`}</CardContent></Card>; })}</div>
    <Card><CardHeader><CardTitle>Margem após Ads por produto</CardTitle><CardDescription>Ordenado da menor para a maior margem no período selecionado.</CardDescription></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Produto</TableHead><TableHead className="text-right">Vendas</TableHead><TableHead className="text-right">Custo produto</TableHead><TableHead className="text-right">Ads</TableHead><TableHead className="text-right">Margem após Ads</TableHead></TableRow></TableHeader><TableBody>{productMargins.map(row=><TableRow key={row.sku}><TableCell className="font-medium">{row.sku}</TableCell><TableCell className="max-w-80 truncate">{row.name}</TableCell><TableCell className="text-right">{money.format(row.revenue)}</TableCell><TableCell className="text-right">{money.format(row.productCosts)}</TableCell><TableCell className="text-right">{money.format(row.adsInvestment)}</TableCell><TableCell className={row.afterAds<0?"text-right font-semibold text-red-600":"text-right font-semibold text-emerald-600"}>{money.format(row.afterAds)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
    <Card><CardHeader><CardTitle>Importar custos por planilha</CardTitle><CardDescription>Envie XLSX com as colunas SKU e CUSTO UNITÁRIO.</CardDescription></CardHeader><CardContent><form action={importUnitCosts} className="flex flex-wrap gap-3"><Input name="file" type="file" accept=".xlsx" className="max-w-sm" required/><Button>Importar custos</Button></form></CardContent></Card>
    <Card><CardHeader><CardTitle>Custos por SKU</CardTitle><CardDescription>Para preencher manualmente, use a tabela abaixo nesta mesma página.</CardDescription></CardHeader><CardContent><Link className="text-sm font-medium text-primary hover:underline" href="/dashboard/lucro?period=costs">Abrir edição de custos por SKU</Link></CardContent></Card>
  </main>;
  return <main className="flex flex-col gap-5"><div><h1 className="text-3xl font-semibold tracking-tight">Lucro por SKU</h1><p className="text-muted-foreground text-sm">Cadastre o custo unitário. O lucro real será calculado com vendas, tarifas, fretes, descontos, reembolsos e Ads.</p></div><Card><CardHeader><CardTitle>Importar custos por planilha</CardTitle><CardDescription>Envie XLSX com as colunas: SKU e CUSTO UNITÁRIO.</CardDescription></CardHeader><CardContent><form action={importUnitCosts} className="flex flex-wrap gap-3"><Input name="file" type="file" accept=".xlsx" className="max-w-sm" required/><Button>Importar custos</Button></form></CardContent></Card><Card><CardHeader><CardTitle>Custo unitário dos produtos</CardTitle><CardDescription>Preencha por SKU. Cada custo fica separado para a conta ativa.</CardDescription></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Produto</TableHead><TableHead className="text-right">Custo unitário</TableHead><TableHead /></TableRow></TableHeader><TableBody>{(products ?? []).map((product) => <TableRow key={product.id}><TableCell className="font-medium">{product.sku}</TableCell><TableCell>{product.name}</TableCell><TableCell><form action={saveUnitCost} className="flex justify-end gap-2"><input name="productId" type="hidden" value={product.id}/><Input name="unitCost" defaultValue={costByProduct.get(product.id) ?? ""} inputMode="decimal" placeholder="0,00" className="w-28 text-right"/><Button size="sm">Salvar</Button></form></TableCell><TableCell className="text-right text-muted-foreground text-xs">{costByProduct.has(product.id) ? money.format(costByProduct.get(product.id) ?? 0) : "Não informado"}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card></main>;
}
