"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useMemo, useState } from "react";

import type { HistoricalRankingDashboardRow } from "../_lib/load-historical-ranking-dashboard";

type Filter = "todos" | "recuperar" | "sem-venda" | "sem-full" | "inativos";
const labels: Record<Filter, string> = {
  todos: "Todos",
  recuperar: "Precisa recuperar",
  "sem-venda": "Sem vender com estoque",
  "sem-full": "Sem estoque FULL",
  inativos: "Pausados/excluídos",
};
const priorityOrder = { Crítica: 0, Alta: 1, Média: 2, Normal: 3 };
const curveOrder = { A: 1, B: 2, C: 3, D: 4, E: 5, "Sem vendas": 6 };
type SortKey = "priority" | "sku" | "product" | "historicalRank" | "historicalCurve" | "historicalUnits" | "currentCurve" | "currentUnits" | "revenue" | "visits" | "full" | "listing" | "situation";
type SortDirection = "asc" | "desc";
const headers: Array<{ key: SortKey; label: string }> = [
  { key: "priority", label: "Prioridade" }, { key: "sku", label: "SKU" }, { key: "product", label: "Produto" },
  { key: "historicalRank", label: "Rank histórico" }, { key: "historicalCurve", label: "Curva histórica" },
  { key: "historicalUnits", label: "Unidades históricas" }, { key: "currentCurve", label: "Curva atual" },
  { key: "currentUnits", label: "Vendas atuais" }, { key: "revenue", label: "Faturamento" },
  { key: "visits", label: "Visitas" }, { key: "full", label: "FULL" }, { key: "listing", label: "Anúncio" },
  { key: "situation", label: "Situação" },
];
const descendingByDefault = new Set<SortKey>(["historicalUnits", "currentUnits", "revenue", "visits", "full"]);
function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function HistoricalRankingTable({ rows }: { rows: HistoricalRankingDashboardRow[] }) {
  const [filter, setFilter] = useState<Filter>("todos");
  const [sortKey, setSortKey] = useState<SortKey>("priority");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const visible = useMemo(
    () =>
      rows
        .filter(
          (row) =>
            filter === "todos" ||
            (filter === "recuperar" && row.situation === "Precisa recuperar") ||
            (filter === "sem-venda" && row.situation === "Sem vender com estoque") ||
            (filter === "sem-full" && row.situation === "Sem estoque FULL") ||
            (filter === "inativos" && ["Anúncio pausado", "Anúncio excluído"].includes(row.situation)),
        )
        .sort((left, right) => {
          const value = (row: HistoricalRankingDashboardRow): string | number => {
            switch (sortKey) {
              case "priority": return priorityOrder[row.priority];
              case "sku": return row.sku;
              case "product": return row.productName;
              case "historicalRank": return row.historicalRank;
              case "historicalCurve": return curveOrder[row.historicalCurve] ?? 99;
              case "historicalUnits": return row.historicalUnits;
              case "currentCurve": return curveOrder[row.currentCurve] ?? 99;
              case "currentUnits": return row.currentUnits;
              case "revenue": return row.currentRevenue;
              case "visits": return row.currentVisits;
              case "full": return row.fullStock;
              case "listing": return row.listingStatus;
              case "situation": return row.situation;
            }
          };
          const leftValue = value(left);
          const rightValue = value(right);
          const comparison = typeof leftValue === "string" && typeof rightValue === "string"
            ? leftValue.localeCompare(rightValue, "pt-BR", { numeric: true })
            : Number(leftValue) - Number(rightValue);
          return comparison === 0
            ? left.historicalRank - right.historicalRank
            : comparison * (sortDirection === "asc" ? 1 : -1);
        }),
    [filter, rows, sortDirection, sortKey],
  );
  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDirection((direction) => direction === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDirection(descendingByDefault.has(key) ? "desc" : "asc"); }
  };
  return (
    <section className="rounded-xl border bg-card">
      <div className="flex flex-wrap gap-2 border-b p-3">
        {(Object.keys(labels) as Filter[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-md px-3 py-2 text-sm font-medium ${filter === key ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/70"}`}
          >
            {labels[key]}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1250px] text-sm">
          <thead className="border-b bg-muted/40 text-left text-muted-foreground">
            <tr>
              {headers.map(({ key, label }) => (
                <th key={key} className="whitespace-nowrap px-3 py-3 font-medium">
                  <button type="button" onClick={() => toggleSort(key)} className="inline-flex items-center gap-1 hover:text-foreground">
                    {label}{sortKey === key ? sortDirection === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3" />}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.sku} className="border-b last:border-0">
                <td
                  className={
                    row.priority === "Crítica" ? "px-3 py-3 font-semibold text-red-600" : "px-3 py-3 font-medium"
                  }
                >
                  {row.priority}
                </td>
                <td className="px-3 py-3 font-mono">{row.sku}</td>
                <td className="max-w-72 truncate px-3 py-3" title={row.productName}>
                  {row.productName}
                </td>
                <td className="px-3 py-3 tabular-nums">#{row.historicalRank}</td>
                <td className="px-3 py-3 font-semibold">{row.historicalCurve}</td>
                <td className="px-3 py-3 tabular-nums">{row.historicalUnits.toLocaleString("pt-BR")}</td>
                <td className="px-3 py-3 font-semibold">{row.currentCurve}</td>
                <td className="px-3 py-3 tabular-nums">{row.currentUnits.toLocaleString("pt-BR")}</td>
                <td className="px-3 py-3 tabular-nums">{money(row.currentRevenue)}</td>
                <td className="px-3 py-3 tabular-nums">{row.currentVisits.toLocaleString("pt-BR")}</td>
                <td className="px-3 py-3 tabular-nums">{row.fullStock.toLocaleString("pt-BR")}</td>
                <td className="px-3 py-3">{row.listingStatus}</td>
                <td className="px-3 py-3 font-medium">{row.situation}</td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={13} className="px-3 py-10 text-center text-muted-foreground">
                  Nenhum produto neste filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
