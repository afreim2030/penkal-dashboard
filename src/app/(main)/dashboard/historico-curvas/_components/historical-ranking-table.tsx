"use client";

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
function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function HistoricalRankingTable({ rows }: { rows: HistoricalRankingDashboardRow[] }) {
  const [filter, setFilter] = useState<Filter>("todos");
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
        .sort(
          (left, right) =>
            priorityOrder[left.priority] - priorityOrder[right.priority] || left.historicalRank - right.historicalRank,
        ),
    [filter, rows],
  );
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
              {[
                "Prioridade",
                "SKU",
                "Produto",
                "Rank histórico",
                "Curva histórica",
                "Unidades históricas",
                "Curva atual",
                "Vendas atuais",
                "Faturamento",
                "Visitas",
                "FULL",
                "Anúncio",
                "Situação",
              ].map((label) => (
                <th key={label} className="whitespace-nowrap px-3 py-3 font-medium">
                  {label}
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
