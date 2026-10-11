"use client";

import { ArrowDownUp } from "lucide-react";
import { useMemo, useState } from "react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export type ProfitProductRow = {
  sku: string;
  name: string;
  units: number;
  revenue: number;
  productCosts: number;
  operationalCosts: number;
  fees: number;
  shippingCosts: number;
  adjustments: number;
  adsInvestment: number;
  afterAds: number;
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });

type SortKey = "sku" | "name" | "units" | "revenue" | "productCosts" | "fees" | "shippingCosts" | "adjustments" | "adsInvestment" | "afterAds" | "margin";

function Header({ label, value, current, direction, onSort }: { label: string; value: SortKey; current: SortKey; direction: "asc" | "desc"; onSort: (value: SortKey) => void }) {
  const active = current === value;
  return (
    <TableHead className={value === "sku" || value === "name" ? "" : "text-right"}>
      <button className="inline-flex items-center gap-1 font-medium hover:text-foreground" onClick={() => onSort(value)}>
        {label}<ArrowDownUp className={active ? "size-3 text-foreground" : "size-3"} />
        {active ? <span className="sr-only">{direction === "asc" ? "crescente" : "decrescente"}</span> : null}
      </button>
    </TableHead>
  );
}

export function ProfitResultsTable({ rows }: { rows: ProfitProductRow[] }) {
  const [sort, setSort] = useState<SortKey>("afterAds");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const changeSort = (next: SortKey) => {
    if (next === sort) setDirection((value) => value === "asc" ? "desc" : "asc");
    else { setSort(next); setDirection(next === "sku" || next === "name" ? "asc" : "desc"); }
  };
  const sorted = useMemo(() => [...rows].sort((a, b) => {
    if (sort === "sku") return direction === "asc" ? a.sku.localeCompare(b.sku, "pt-BR", { numeric: true }) : b.sku.localeCompare(a.sku, "pt-BR", { numeric: true });
    if (sort === "name") return direction === "asc" ? a.name.localeCompare(b.name, "pt-BR") : b.name.localeCompare(a.name, "pt-BR");
    const value = (row: ProfitProductRow) => {
      if (sort === "margin") return row.revenue > 0 ? row.afterAds / row.revenue : 0;
      if (sort === "units") return row.units;
      if (sort === "revenue") return row.revenue;
      if (sort === "productCosts") return row.productCosts;
      if (sort === "fees") return row.fees;
      if (sort === "shippingCosts") return row.shippingCosts;
      if (sort === "adjustments") return row.adjustments;
      if (sort === "adsInvestment") return row.adsInvestment;
      return row.afterAds;
    };
    const result = value(a) - value(b);
    return direction === "asc" ? result : -result;
  }), [rows, sort, direction]);

  return <Table><TableHeader><TableRow>
    <Header label="SKU" value="sku" current={sort} direction={direction} onSort={changeSort} />
    <Header label="Produto" value="name" current={sort} direction={direction} onSort={changeSort} />
    <Header label="Unidades" value="units" current={sort} direction={direction} onSort={changeSort} />
    <Header label="Faturamento" value="revenue" current={sort} direction={direction} onSort={changeSort} />
    <Header label="Custo produto" value="productCosts" current={sort} direction={direction} onSort={changeSort} />
    <Header label="Tarifas" value="fees" current={sort} direction={direction} onSort={changeSort} />
    <Header label="Fretes" value="shippingCosts" current={sort} direction={direction} onSort={changeSort} />
    <Header label="Ajustes" value="adjustments" current={sort} direction={direction} onSort={changeSort} />
    <Header label="Ads" value="adsInvestment" current={sort} direction={direction} onSort={changeSort} />
    <Header label="Lucro após Ads" value="afterAds" current={sort} direction={direction} onSort={changeSort} />
    <Header label="Margem" value="margin" current={sort} direction={direction} onSort={changeSort} />
  </TableRow></TableHeader><TableBody>
    {sorted.length === 0 ? <TableRow><TableCell colSpan={11} className="py-8 text-center text-muted-foreground">Não há vendas para este período.</TableCell></TableRow> : sorted.map((row) => {
      const margin = row.revenue > 0 ? row.afterAds / row.revenue : 0;
      return <TableRow key={row.sku}><TableCell className="font-medium">{row.sku}</TableCell><TableCell className="max-w-80 truncate" title={row.name}>{row.name}</TableCell><TableCell className="text-right tabular-nums">{integer.format(row.units)}</TableCell><TableCell className="text-right tabular-nums">{money.format(row.revenue)}</TableCell><TableCell className="text-right tabular-nums">{money.format(row.productCosts)}</TableCell><TableCell className="text-right tabular-nums">{money.format(row.fees)}</TableCell><TableCell className="text-right tabular-nums">{money.format(row.shippingCosts)}</TableCell><TableCell className="text-right tabular-nums">{money.format(row.adjustments)}</TableCell><TableCell className="text-right tabular-nums">{money.format(row.adsInvestment)}</TableCell><TableCell className={row.afterAds < 0 ? "text-right font-semibold tabular-nums text-red-600" : "text-right font-semibold tabular-nums text-emerald-600"}>{money.format(row.afterAds)}</TableCell><TableCell className={margin < 0 ? "text-right font-medium tabular-nums text-red-600" : "text-right font-medium tabular-nums text-emerald-600"}>{percent.format(margin)}</TableCell></TableRow>;
    })}
  </TableBody></Table>;
}
