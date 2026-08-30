import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";

const n = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const days: Record<number, string> = { 1: "Segunda-feira", 2: "Terça-feira", 3: "Quarta-feira", 4: "Quinta-feira", 5: "Sexta-feira", 6: "Sábado", 7: "Domingo" };

interface ProductRank { rank: number; sku: string; name: string; orders: number; units: number; revenue: number }
interface Report {
  coverage: { start: string | null; end: string | null; days: number };
  periods: Array<{ period: string; orders: number; units: number; revenue: number }>;
  hours: Array<{ hour: number; units: number; orders: number; revenue: number }>;
  weekdays: Array<{ weekday: number; orders: number; units: number; revenue: number; days_observed: number; average_units: number }>;
  products: { morning: ProductRank[]; evening: ProductRank[]; saturday: ProductRank[]; sunday: ProductRank[] };
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function ProductRanking({ title, description, rows, limit }: { title: string; description: string; rows: ProductRank[]; limit: number }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="w-12">#</TableHead><TableHead className="w-24">SKU</TableHead><TableHead className="min-w-64">Produto</TableHead><TableHead className="text-right">Pedidos</TableHead><TableHead className="text-right">Unidades</TableHead><TableHead className="text-right">Faturamento</TableHead></TableRow></TableHeader><TableBody>{rows.slice(0, limit).map((row) => <TableRow key={`${title}-${row.sku}`}><TableCell className="text-muted-foreground tabular-nums">{row.rank}</TableCell><TableCell className="font-medium tabular-nums">{row.sku}</TableCell><TableCell><p className="max-w-96 truncate" title={row.name}>{row.name}</p></TableCell><TableCell className="text-right tabular-nums">{n.format(row.orders)}</TableCell><TableCell className="text-right font-medium tabular-nums">{n.format(row.units)}</TableCell><TableCell className="text-right tabular-nums">{brl.format(row.revenue)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>;
}

export default async function Page() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_sales_time_reports");
    if (error) throw new Error(error.message);
    const report = (data ?? { coverage: { start: null, end: null, days: 0 }, periods: [], hours: [], weekdays: [], products: { morning: [], evening: [], saturday: [], sunday: [] } }) as Report;
    const max = Math.max(1, ...report.hours.map((row) => row.units));
    return <div className="flex flex-col gap-5">
      <div><h1 className="text-3xl font-semibold tracking-tight">Relatórios de vendas</h1><p className="text-muted-foreground text-sm">Histórico consolidado por SKU entre {formatDate(report.coverage.start)} e {formatDate(report.coverage.end)} · {n.format(report.coverage.days)} dias completos.</p></div>
      <div className="grid gap-4 sm:grid-cols-2">{report.periods.map((period) => <Card key={period.period}><CardHeader className="pb-2"><CardDescription>{period.period}</CardDescription><CardTitle>{n.format(period.units)} unidades</CardTitle></CardHeader><CardContent className="text-muted-foreground text-xs">{n.format(period.orders)} pedidos · {brl.format(period.revenue)}</CardContent></Card>)}</div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Top horários</CardTitle><CardDescription>As 24 horas ordenadas por unidades vendidas.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">{report.hours.map((row) => <div key={row.hour} className="grid grid-cols-[50px_1fr_60px] items-center gap-2 text-sm"><span className="font-medium">{String(row.hour).padStart(2, "0")}:00</span><div className="h-6 overflow-hidden rounded bg-muted"><div className="h-full rounded bg-primary/75" style={{ width: `${Math.max(5, (row.units / max) * 100)}%` }} /></div><span className="text-right tabular-nums">{n.format(row.units)}</span></div>)}</CardContent></Card>
        <Card><CardHeader><CardTitle>Dia da semana</CardTitle><CardDescription>Volume total e média por dia completo observado.</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Dia</TableHead><TableHead className="text-right">Dias</TableHead><TableHead className="text-right">Pedidos</TableHead><TableHead className="text-right">Unidades</TableHead><TableHead className="text-right">Média/dia</TableHead></TableRow></TableHeader><TableBody>{report.weekdays.map((row) => <TableRow key={row.weekday}><TableCell className="font-medium">{days[row.weekday] ?? row.weekday}</TableCell><TableCell className="text-right tabular-nums">{n.format(row.days_observed)}</TableCell><TableCell className="text-right tabular-nums">{n.format(row.orders)}</TableCell><TableCell className="text-right font-medium tabular-nums">{n.format(row.units)}</TableCell><TableCell className="text-right tabular-nums">{decimal.format(row.average_units)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
      </div>
      <div className="grid gap-4 xl:grid-cols-2"><ProductRanking title="Top 10 · 00:00–11:59" description="Produtos com mais unidades vendidas pela manhã." rows={report.products.morning} limit={10} /><ProductRanking title="Top 10 · 12:00–23:59" description="Produtos com mais unidades vendidas à tarde e à noite." rows={report.products.evening} limit={10} /></div>
      <div className="grid gap-4 xl:grid-cols-2"><ProductRanking title="Top 20 · Sábado" description="Ranking histórico dos sábados por SKU." rows={report.products.saturday} limit={20} /><ProductRanking title="Top 20 · Domingo" description="Ranking histórico dos domingos por SKU." rows={report.products.sunday} limit={20} /></div>
    </div>;
  } catch (error) {
    return <Alert variant="destructive"><AlertCircle /><AlertTitle>Não foi possível carregar Relatórios</AlertTitle><AlertDescription>{error instanceof Error ? error.message : "Ocorreu um erro ao consultar os relatórios."}</AlertDescription></Alert>;
  }
}
