"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AbcdeDashboardData, Curve, ProductPeriodComparison } from "../_lib/load-abcde-dashboard";

const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const percentage = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const curveRank: Record<Curve, number> = { A: 1, B: 2, C: 3, D: 4, E: 5 };

function CurveBadge({ curve }: { curve: Curve }) {
  const styles = { A: "bg-emerald-600 text-white", B: "bg-blue-600 text-white", C: "bg-amber-500 text-white", D: "bg-orange-600 text-white", E: "bg-slate-600 text-white" };
  return <Badge className={styles[curve]}>Curva {curve}</Badge>;
}
function SortButton({ label, active, direction, onClick }: { label: string; active: boolean; direction: "asc" | "desc"; onClick: () => void }) {
  const Icon = active ? (direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return <button type="button" onClick={onClick} className="inline-flex items-center gap-1 font-medium hover:text-foreground">{label}<Icon className="size-3" /></button>;
}
function PeriodCell({ data }: { data?: { visits: number; sales: number; units: number; revenue: number; conversion: number } }) {
  if (!data) return <span className="text-muted-foreground">—</span>;
  return <div className="min-w-32 space-y-0.5 text-right text-xs"><p className="font-medium tabular-nums">{currency.format(data.revenue)}</p><p className="text-muted-foreground">{integer.format(data.units)} un · {integer.format(data.visits)} visitas</p><p className="text-muted-foreground">{integer.format(data.sales)} vendas · {percentage.format(data.conversion)}</p></div>;
}
export function CurveDataTables({ curveData, comparison7, comparison30 }: { curveData: AbcdeDashboardData; comparison7: ProductPeriodComparison | null; comparison30: ProductPeriodComparison | null }) {
  const [sortKey, setSortKey] = useState<"currentCurve" | "movement" | "visits" | "sales" | "conversion" | "revenue">("revenue");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [windowDays, setWindowDays] = useState<7 | 30>(7);
  const sortedRows = useMemo(() => [...curveData.rows].sort((a, b) => {
    const movement = { caiu: 3, manteve: 2, subiu: 1, novo: 0 };
    const av = sortKey === "currentCurve" ? curveRank[a.currentCurve] : sortKey === "movement" ? movement[a.movement] : sortKey === "visits" ? a.currentVisits : sortKey === "sales" ? a.currentSales : sortKey === "conversion" ? a.currentConversion : a.currentRevenue;
    const bv = sortKey === "currentCurve" ? curveRank[b.currentCurve] : sortKey === "movement" ? movement[b.movement] : sortKey === "visits" ? b.currentVisits : sortKey === "sales" ? b.currentSales : sortKey === "conversion" ? b.currentConversion : b.currentRevenue;
    return (Number(av) - Number(bv)) * (sortDirection === "asc" ? 1 : -1);
  }), [curveData.rows, sortDirection, sortKey]);
  const toggle = (key: typeof sortKey) => { if (key === sortKey) setSortDirection((value) => value === "asc" ? "desc" : "asc"); else { setSortKey(key); setSortDirection(key === "currentCurve" ? "asc" : "desc"); } };
  const comparison = windowDays === 7 ? comparison7 : comparison30;
  const labels = windowDays === 7 ? ["Últimos 7d", "8–14d", "15–21d", "22–28d"] : ["Últimos 30d", "31–60d", "61–90d", "91–120d"];
  return <div className="flex flex-col gap-5">
    <Card><CardHeader><CardTitle>Produtos e mudança de curva</CardTitle><CardDescription>Clique no título das colunas para ordenar os produtos.</CardDescription></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>SKU / MLB</TableHead><TableHead>Produto</TableHead><TableHead><SortButton label="Curva atual" active={sortKey === "currentCurve"} direction={sortDirection} onClick={() => toggle("currentCurve")} /></TableHead><TableHead><SortButton label="Mudança" active={sortKey === "movement"} direction={sortDirection} onClick={() => toggle("movement")} /></TableHead><TableHead className="text-right"><SortButton label="Visitas" active={sortKey === "visits"} direction={sortDirection} onClick={() => toggle("visits")} /></TableHead><TableHead className="text-right"><SortButton label="Vendas" active={sortKey === "sales"} direction={sortDirection} onClick={() => toggle("sales")} /></TableHead><TableHead className="text-right"><SortButton label="Conversão" active={sortKey === "conversion"} direction={sortDirection} onClick={() => toggle("conversion")} /></TableHead><TableHead className="text-right"><SortButton label="Faturamento" active={sortKey === "revenue"} direction={sortDirection} onClick={() => toggle("revenue")} /></TableHead></TableRow></TableHeader><TableBody>{sortedRows.map((row) => <TableRow key={`${row.sku ?? ""}-${row.mlb ?? ""}`}><TableCell className="whitespace-nowrap font-medium"><div>{row.sku ?? "—"}</div><div className="text-muted-foreground text-xs">{row.mlb ?? ""}</div></TableCell><TableCell className="min-w-64 max-w-96"><p className="truncate" title={row.productName}>{row.productName}</p></TableCell><TableCell><CurveBadge curve={row.currentCurve} /></TableCell><TableCell>{row.previousCurve ? <span className={row.movement === "caiu" ? "font-medium text-red-600" : row.movement === "subiu" ? "font-medium text-emerald-600" : "text-muted-foreground"}>{row.previousCurve} → {row.currentCurve}</span> : <span className="text-muted-foreground text-xs">Sem comparação</span>}</TableCell><TableCell className="text-right tabular-nums">{integer.format(row.currentVisits)}</TableCell><TableCell className="text-right tabular-nums">{integer.format(row.currentSales)}</TableCell><TableCell className="text-right tabular-nums">{percentage.format(row.currentConversion)}</TableCell><TableCell className="text-right tabular-nums">{currency.format(row.currentRevenue)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
    <Card><CardHeader><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><CardTitle>Comparativo por períodos</CardTitle><CardDescription>Compare o mesmo produto em quatro blocos consecutivos.</CardDescription></div><div className="flex gap-2"><button type="button" onClick={() => setWindowDays(7)} className={`rounded-md px-3 py-2 text-sm font-medium ${windowDays === 7 ? "bg-primary text-primary-foreground" : "bg-muted"}`}>7 / 14 / 21 / 28 dias</button><button type="button" onClick={() => setWindowDays(30)} className={`rounded-md px-3 py-2 text-sm font-medium ${windowDays === 30 ? "bg-primary text-primary-foreground" : "bg-muted"}`}>30 / 60 / 90 / 120 dias</button></div></div></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>SKU / Produto</TableHead>{labels.map((label) => <TableHead key={label} className="text-right">{label}</TableHead>)}</TableRow></TableHeader><TableBody>{(comparison?.rows ?? []).map((row) => <TableRow key={`${row.sku ?? ""}-${row.mlb ?? ""}`}><TableCell className="min-w-64"><p className="font-medium">{row.sku ?? "—"} <span className="font-normal text-muted-foreground">{row.mlb ?? ""}</span></p><p className="max-w-60 truncate text-muted-foreground text-xs" title={row.productName}>{row.productName}</p></TableCell>{[1, 2, 3, 4].map((period) => <TableCell key={period}><PeriodCell data={row.periods[String(period)]} /></TableCell>)}</TableRow>)}</TableBody></Table></CardContent></Card>
  </div>;
}
