"use client";

import { Bar, BarChart, CartesianGrid, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

type MonthComparison = {
  asOf: string;
  start: string;
  end: string;
  previousStart: string;
  previousEnd: string;
  currentRevenue: number;
  previousRevenue: number;
  daily: Array<{ date: string; label: string; current: number; previous: number }>;
};

function formatDate(value: string) {
  return `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;
}

export function MonthlyComparisonChart({ data }: { data: MonthComparison | null }) {
  if (!data) return null;
  const change = data.previousRevenue > 0 ? ((data.currentRevenue - data.previousRevenue) / data.previousRevenue) * 100 : null;

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle>Faturamento por período</CardTitle>
            <CardDescription>Compare os dias selecionados com o período imediatamente anterior de mesma duração.</CardDescription>
          </div>
          <div className="grid grid-cols-2 gap-x-5 gap-y-1 text-sm lg:text-right">
            <span className="text-muted-foreground">Selecionado</span><strong className="tabular-nums">{currency.format(data.currentRevenue)}</strong>
            <span className="text-muted-foreground">Período anterior</span><strong className="tabular-nums">{currency.format(data.previousRevenue)}</strong>
            <span className="text-muted-foreground">Variação</span><strong className={change !== null && change < 0 ? "text-red-600" : "text-emerald-600"}>{change === null ? "—" : `${change >= 0 ? "+" : ""}${change.toFixed(1).replace(".", ",")}%`}</strong>
          </div>
        </div>
        <form className="flex flex-wrap items-end gap-2 pt-1" action="/dashboard">
          <label className="grid gap-1 text-xs font-medium">De<Input name="start" type="date" defaultValue={data.start} className="w-40" /></label>
          <label className="grid gap-1 text-xs font-medium">Até<Input name="end" type="date" defaultValue={data.end} max={data.asOf} className="w-40" /></label>
          <Button type="submit">Aplicar</Button>
        </form>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted-foreground">Período selecionado: {formatDate(data.start)} até {formatDate(data.end)} · Comparação: {formatDate(data.previousStart)} até {formatDate(data.previousEnd)}</p>
        <div className="h-[330px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.daily} margin={{ top: 12, right: 16, left: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={22} />
              <YAxis tickLine={false} axisLine={false} width={74} tickFormatter={(value) => currency.format(Number(value))} />
              <Tooltip formatter={(value) => currency.format(Number(value))} labelFormatter={(value) => `Dia ${value}`} />
              <Legend />
              <Bar dataKey="current" name="Período selecionado" fill="#2563eb" radius={[5, 5, 0, 0]} maxBarSize={24} />
              <Line type="monotone" dataKey="previous" name="Período anterior" stroke="#f59e0b" strokeWidth={3} dot={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
