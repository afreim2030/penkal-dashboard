"use client";

import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const chartConfig = {
  current: { label: "Mês atual", color: "hsl(var(--primary))" },
  previous: { label: "Mês passado", color: "hsl(var(--muted-foreground))" },
} satisfies ChartConfig;

type MonthComparison = {
  asOf: string;
  currentMonthStart: string;
  previousMonthStart: string;
  currentRevenue: number;
  previousRevenue: number;
  daily: Array<{ day: number; current: number; previous: number }>;
};

function monthLabel(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

export function MonthlyComparisonChart({ data }: { data: MonthComparison | null }) {
  if (!data) return null;
  const change = data.previousRevenue > 0 ? ((data.currentRevenue - data.previousRevenue) / data.previousRevenue) * 100 : null;

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Mês atual vs. mês passado</CardTitle>
          <CardDescription>Faturamento acumulado até o mesmo dia do mês. Dados até {data.asOf.slice(8, 10)}/{data.asOf.slice(5, 7)}.</CardDescription>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-2xl font-semibold tabular-nums">{currency.format(data.currentRevenue)}</p>
          <p className={`text-xs font-medium ${change === null ? "text-muted-foreground" : change >= 0 ? "text-emerald-600" : "text-red-600"}`}>
            {change === null ? "Sem comparação anterior" : `${change >= 0 ? "+" : ""}${change.toFixed(1).replace(".", ",")}% vs. ${monthLabel(data.previousMonthStart)}`}
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[280px] w-full">
          <LineChart data={data.daily} margin={{ left: 4, right: 12, top: 10, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={(value) => String(value)} />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} width={76} tickFormatter={(value) => currency.format(Number(value))} />
            <Tooltip formatter={(value) => currency.format(Number(value))} labelFormatter={(label) => `Dia ${label}`} />
            <Legend />
            <Line type="monotone" dataKey="current" name={monthLabel(data.currentMonthStart)} stroke="var(--color-current)" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
            <Line type="monotone" dataKey="previous" name={monthLabel(data.previousMonthStart)} stroke="var(--color-previous)" strokeWidth={2} strokeDasharray="5 5" dot={false} activeDot={{ r: 4 }} />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
