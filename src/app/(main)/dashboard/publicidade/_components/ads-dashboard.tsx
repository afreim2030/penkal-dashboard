"use client";

import { useMemo, useState } from "react";

import { ArrowDownUp, Info } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import type { AdsDashboardData } from "../_lib/load-ads-dashboard";

const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const percent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function optionalPercent(value: number | null) {
  return value === null ? "—" : percent.format(value);
}

function optionalDecimal(value: number | null) {
  return value === null ? "—" : decimal.format(value);
}

type CampaignSort = "campaignName" | "investment" | "revenue" | "clicks" | "sales" | "acos" | "roas";
type ListingSort = "mlb" | "title" | "investment" | "revenue" | "sales" | "acos";

function SortHeader<T extends string>({
  label,
  value,
  active,
  direction,
  onChange,
}: {
  label: string;
  value: T;
  active: T;
  direction: "asc" | "desc";
  onChange: (value: T) => void;
}) {
  return (
    <TableHead className="text-right">
      <button className="inline-flex items-center gap-1 font-medium hover:text-foreground" onClick={() => onChange(value)}>
        {label}
        <ArrowDownUp className={active === value ? "size-3 text-foreground" : "size-3"} />
      </button>
    </TableHead>
  );
}

export function AdsDashboard({ data }: { data: AdsDashboardData }) {
  const [campaignSort, setCampaignSort] = useState<CampaignSort>("investment");
  const [campaignDirection, setCampaignDirection] = useState<"asc" | "desc">("desc");
  const [listingSort, setListingSort] = useState<ListingSort>("investment");
  const [listingDirection, setListingDirection] = useState<"asc" | "desc">("desc");
  const changeCampaignSort = (next: CampaignSort) => {
    if (next === campaignSort) setCampaignDirection((current) => (current === "desc" ? "asc" : "desc"));
    else {
      setCampaignSort(next);
      setCampaignDirection("desc");
    }
  };
  const changeListingSort = (next: ListingSort) => {
    if (next === listingSort) setListingDirection((current) => (current === "desc" ? "asc" : "desc"));
    else {
      setListingSort(next);
      setListingDirection("desc");
    }
  };
  const campaigns = useMemo(
    () => [...data.campaigns].sort((left, right) => {
      const leftValue = left[campaignSort] ?? (typeof left[campaignSort] === "string" ? "" : -1);
      const rightValue = right[campaignSort] ?? (typeof right[campaignSort] === "string" ? "" : -1);
      const comparison = typeof leftValue === "string" && typeof rightValue === "string" ? leftValue.localeCompare(rightValue, "pt-BR") : Number(leftValue) - Number(rightValue);
      return campaignDirection === "desc" ? -comparison : comparison;
    }),
    [campaignDirection, campaignSort, data.campaigns],
  );
  const listings = useMemo(
    () => [...data.listings].sort((left, right) => {
      const leftValue = left[listingSort] ?? (typeof left[listingSort] === "string" ? "" : -1);
      const rightValue = right[listingSort] ?? (typeof right[listingSort] === "string" ? "" : -1);
      const comparison = typeof leftValue === "string" && typeof rightValue === "string" ? leftValue.localeCompare(rightValue, "pt-BR") : Number(leftValue) - Number(rightValue);
      return listingDirection === "desc" ? -comparison : comparison;
    }),
    [data.listings, listingDirection, listingSort],
  );
  if (!data.period || data.summary.rows === 0) {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Publicidade</h1>
          <p className="text-muted-foreground text-sm">
            Investimento, alcance, cliques, vendas, ACOS e ROAS do Mercado Livre.
          </p>
        </div>
        <Alert>
          <Info />
          <AlertTitle>Nenhum relatório de publicidade importado</AlertTitle>
          <AlertDescription>
            A estrutura do painel está pronta. Quando os dados de campanhas forem importados, os indicadores aparecerão
            aqui sem misturar publicidade com vendas orgânicas.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Publicidade</h1>
        <p className="text-muted-foreground text-sm">
          Período do relatório: {formatDate(data.period.start)} até {formatDate(data.period.end)}.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Investimento</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{currency.format(data.summary.investment)}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            {integer.format(data.summary.campaigns)} campanhas
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Receita atribuída</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{currency.format(data.summary.revenue)}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            {integer.format(data.summary.sales)} vendas atribuídas
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>ACOS</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{optionalPercent(data.summary.acos)}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">Investimento ÷ receita atribuída</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>ROAS</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{optionalDecimal(data.summary.roas)}x</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">Receita atribuída ÷ investimento</CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Impressões</CardDescription>
            <CardTitle className="text-xl tabular-nums">{integer.format(data.summary.impressions)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Cliques</CardDescription>
            <CardTitle className="text-xl tabular-nums">{integer.format(data.summary.clicks)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>CTR</CardDescription>
            <CardTitle className="text-xl tabular-nums">{percent.format(data.summary.ctr)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>CPC médio</CardDescription>
            <CardTitle className="text-xl tabular-nums">{currency.format(data.summary.cpc)}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Campanhas</CardTitle>
          <CardDescription>Ordenadas pelo investimento do período selecionado no relatório.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortHeader label="Campanha" value="campaignName" active={campaignSort} direction={campaignDirection} onChange={changeCampaignSort} />
                <SortHeader label="Investimento" value="investment" active={campaignSort} direction={campaignDirection} onChange={changeCampaignSort} />
                <SortHeader label="Receita" value="revenue" active={campaignSort} direction={campaignDirection} onChange={changeCampaignSort} />
                <SortHeader label="Cliques" value="clicks" active={campaignSort} direction={campaignDirection} onChange={changeCampaignSort} />
                <SortHeader label="Vendas" value="sales" active={campaignSort} direction={campaignDirection} onChange={changeCampaignSort} />
                <SortHeader label="ACOS" value="acos" active={campaignSort} direction={campaignDirection} onChange={changeCampaignSort} />
                <SortHeader label="ROAS" value="roas" active={campaignSort} direction={campaignDirection} onChange={changeCampaignSort} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((row) => (
                <TableRow key={row.campaignName}>
                  <TableCell className="font-medium">{row.campaignName}</TableCell>
                  <TableCell className="text-right tabular-nums">{currency.format(row.investment)}</TableCell>
                  <TableCell className="text-right tabular-nums">{currency.format(row.revenue)}</TableCell>
                  <TableCell className="text-right tabular-nums">{integer.format(row.clicks)}</TableCell>
                  <TableCell className="text-right tabular-nums">{integer.format(row.sales)}</TableCell>
                  <TableCell className="text-right tabular-nums">{optionalPercent(row.acos)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {optionalDecimal(row.roas)}
                    {row.roas === null ? "" : "x"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Anúncios com maior investimento</CardTitle>
          <CardDescription>Consolidado pelo MLB dentro do mesmo período de publicidade.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <SortHeader label="MLB" value="mlb" active={listingSort} direction={listingDirection} onChange={changeListingSort} />
                <SortHeader label="Produto" value="title" active={listingSort} direction={listingDirection} onChange={changeListingSort} />
                <SortHeader label="Investimento" value="investment" active={listingSort} direction={listingDirection} onChange={changeListingSort} />
                <SortHeader label="Receita" value="revenue" active={listingSort} direction={listingDirection} onChange={changeListingSort} />
                <SortHeader label="Vendas" value="sales" active={listingSort} direction={listingDirection} onChange={changeListingSort} />
                <SortHeader label="ACOS" value="acos" active={listingSort} direction={listingDirection} onChange={changeListingSort} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {listings.map((row, index) => (
                <TableRow key={`${row.mlb ?? "sem-mlb"}-${index}`}>
                  <TableCell className="font-medium">{row.mlb ?? "—"}</TableCell>
                  <TableCell className="max-w-[480px] truncate" title={row.title}>
                    {row.title ?? "Anúncio não vinculado"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{currency.format(row.investment)}</TableCell>
                  <TableCell className="text-right tabular-nums">{currency.format(row.revenue)}</TableCell>
                  <TableCell className="text-right tabular-nums">{integer.format(row.sales)}</TableCell>
                  <TableCell className="text-right tabular-nums">{optionalPercent(row.acos)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
