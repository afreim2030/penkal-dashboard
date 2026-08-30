import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";

const n=new Intl.NumberFormat("pt-BR",{maximumFractionDigits:0});
const brl=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
const days:Record<number,string>={1:"Segunda-feira",2:"Terça-feira",3:"Quarta-feira",4:"Quinta-feira",5:"Sexta-feira",6:"Sábado",7:"Domingo"};

export default async function Page(){
 try{
  const supabase=await createClient();
  const {data,error}=await supabase.rpc("get_sales_time_reports");
  if(error) throw new Error(error.message);
  const report=(data??{periods:[],hours:[],weekdays:[]}) as {periods:Array<{period:string;orders:number;units:number;revenue:number}>;hours:Array<{hour:number;units:number;orders:number}>;weekdays:Array<{weekday:number;orders:number;units:number;days_observed:number}>};
  const max=Math.max(1,...report.hours.map(x=>x.units));
  return <div className="flex flex-col gap-5"><div><h1 className="text-3xl font-semibold tracking-tight">Relatórios de vendas</h1><p className="text-muted-foreground text-sm">Horários e dias com maior volume de vendas.</p></div><div className="grid gap-4 sm:grid-cols-2">{report.periods.map(p=><Card key={p.period}><CardHeader className="pb-2"><CardDescription>{p.period}</CardDescription><CardTitle>{n.format(p.units)} unidades</CardTitle></CardHeader><CardContent className="text-muted-foreground text-xs">{n.format(p.orders)} pedidos · {brl.format(p.revenue)}</CardContent></Card>)}</div><div className="grid gap-4 lg:grid-cols-2"><Card><CardHeader><CardTitle>Top horários</CardTitle><CardDescription>Horários ordenados por unidades vendidas.</CardDescription></CardHeader><CardContent className="flex flex-col gap-3">{report.hours.map(row=><div key={row.hour} className="grid grid-cols-[50px_1fr_60px] items-center gap-2 text-sm"><span className="font-medium">{String(row.hour).padStart(2,"0")}:00</span><div className="h-6 rounded bg-muted overflow-hidden"><div className="h-full rounded bg-primary/75" style={{width:`${Math.max(5,row.units/max*100)}%`}}/></div><span className="text-right tabular-nums">{n.format(row.units)}</span></div>)}</CardContent></Card><Card><CardHeader><CardTitle>Dia da semana</CardTitle><CardDescription>Pedidos e unidades por dia observado.</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Dia</TableHead><TableHead className="text-right">Dias</TableHead><TableHead className="text-right">Pedidos</TableHead><TableHead className="text-right">Unidades</TableHead></TableRow></TableHeader><TableBody>{report.weekdays.map(row=><TableRow key={row.weekday}><TableCell className="font-medium">{days[row.weekday]??row.weekday}</TableCell><TableCell className="text-right tabular-nums">{n.format(row.days_observed)}</TableCell><TableCell className="text-right tabular-nums">{n.format(row.orders)}</TableCell><TableCell className="text-right font-medium tabular-nums">{n.format(row.units)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card></div></div>;
 }catch(error){return <Alert variant="destructive"><AlertCircle/><AlertTitle>Não foi possível carregar Relatórios</AlertTitle><AlertDescription>{error instanceof Error?error.message:"Ocorreu um erro ao consultar os relatórios."}</AlertDescription></Alert>}
}