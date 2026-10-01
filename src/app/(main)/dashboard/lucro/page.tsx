import { createClient } from "@/lib/supabase/server";
import { importUnitCosts, saveUnitCost } from "./_actions/cost-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default async function Page() {
  const supabase = await createClient();
  const { data: account } = await supabase.rpc("get_active_marketplace_account_id");
  const [{ data: products }, { data: costs }] = await Promise.all([
    supabase.from("products").select("id,sku,name").eq("account_id", account ?? "").order("sku"),
    supabase.from("product_costs").select("product_id,unit_cost").eq("account_id", account ?? ""),
  ]);
  const costByProduct = new Map((costs ?? []).map((cost) => [cost.product_id, Number(cost.unit_cost)]));
  return <main className="flex flex-col gap-5"><div><h1 className="text-3xl font-semibold tracking-tight">Lucro por SKU</h1><p className="text-muted-foreground text-sm">Cadastre o custo unitário. O lucro real será calculado com vendas, tarifas, fretes, descontos, reembolsos e Ads.</p></div><Card><CardHeader><CardTitle>Importar custos por planilha</CardTitle><CardDescription>Envie XLSX com as colunas: SKU e CUSTO UNITÁRIO.</CardDescription></CardHeader><CardContent><form action={importUnitCosts} className="flex flex-wrap gap-3"><Input name="file" type="file" accept=".xlsx" className="max-w-sm" required/><Button>Importar custos</Button></form></CardContent></Card><Card><CardHeader><CardTitle>Custo unitário dos produtos</CardTitle><CardDescription>Preencha por SKU. Cada custo fica separado para a conta ativa.</CardDescription></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Produto</TableHead><TableHead className="text-right">Custo unitário</TableHead><TableHead /></TableRow></TableHeader><TableBody>{(products ?? []).map((product) => <TableRow key={product.id}><TableCell className="font-medium">{product.sku}</TableCell><TableCell>{product.name}</TableCell><TableCell><form action={saveUnitCost} className="flex justify-end gap-2"><input name="productId" type="hidden" value={product.id}/><Input name="unitCost" defaultValue={costByProduct.get(product.id) ?? ""} inputMode="decimal" placeholder="0,00" className="w-28 text-right"/><Button size="sm">Salvar</Button></form></TableCell><TableCell className="text-right text-muted-foreground text-xs">{costByProduct.has(product.id) ? money.format(costByProduct.get(product.id) ?? 0) : "Não informado"}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card></main>;
}
