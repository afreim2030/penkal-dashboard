"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, History, Save } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CampaignHistoryData } from "../_lib/load-campaign-history";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const percent = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const CHANGE_TYPES = ["Orçamento", "ACOS alvo", "Produtos", "Campanha", "Outro"];

function formatDateTime(value: string | null) {
  if (!value) return "Sem registro";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));
}

function ageBadge(days: number) {
  if (days >= 14) return <Badge variant="destructive">{days} dias</Badge>;
  if (days >= 10) return <Badge variant="secondary">{days} dias · atenção</Badge>;
  return <Badge variant="outline">{days} dias</Badge>;
}

export function CampaignHistory({ data }: { data: CampaignHistoryData }) {
  const router = useRouter();
  const [campaignName, setCampaignName] = useState(data.campaigns[0]?.campaignName ?? "");
  const [changeType, setChangeType] = useState(CHANGE_TYPES[0]);
  const [status, setStatus] = useState("");
  const [notes, setNotes] = useState("");
  const [filter, setFilter] = useState<"all" | "attention" | "late">("all");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const campaigns = useMemo(() => data.campaigns.filter((item) => filter === "all" || (filter === "attention" ? item.daysWithoutChange >= 10 : item.daysWithoutChange >= 14)), [data.campaigns, filter]);

  async function save() {
    if (!campaignName || saving) return;
    setSaving(true); setError(null); setSuccess(false);
    try {
      const response = await fetch("/api/publicidade/alteracoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaignName, changeType, status, notes }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível registrar a alteração.");
      setNotes(""); setSuccess(true); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível registrar a alteração."); }
    finally { setSaving(false); }
  }

  return <div className="flex flex-col gap-4">
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><History className="size-5" /> Histórico de alterações</CardTitle><CardDescription>Registre mudanças de estratégia. Os indicadores atuais são gravados junto com cada alteração para comparação futura.</CardDescription></CardHeader><CardContent className="flex flex-col gap-4">
      <div className="grid gap-3 lg:grid-cols-2"><label className="flex flex-col gap-1 text-sm font-medium">Campanha<select className="h-9 rounded-md border bg-background px-3 text-sm" value={campaignName} onChange={(event) => setCampaignName(event.target.value)}>{data.campaigns.map((item) => <option key={item.campaignName} value={item.campaignName}>{item.campaignName}</option>)}</select></label><label className="flex flex-col gap-1 text-sm font-medium">Tipo de alteração<select className="h-9 rounded-md border bg-background px-3 text-sm" value={changeType} onChange={(event) => setChangeType(event.target.value)}>{CHANGE_TYPES.map((item) => <option key={item}>{item}</option>)}</select></label><label className="flex flex-col gap-1 text-sm font-medium">Status após a alteração<Input value={status} onChange={(event) => setStatus(event.target.value)} placeholder="Ex.: Ativa, Pausada ou Em observação" maxLength={80} /></label><label className="flex flex-col gap-1 text-sm font-medium">Observação<textarea className="min-h-20 resize-y rounded-md border bg-background px-3 py-2 text-sm" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="O que mudou e qual resultado é esperado?" maxLength={1000} /></label></div>
      <div className="flex justify-end"><Button onClick={save} disabled={!campaignName || saving}>{saving ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}{saving ? "Salvando..." : "Registrar alteração"}</Button></div>
      {error ? <Alert variant="destructive"><AlertCircle /><AlertTitle>Não foi possível salvar</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {success ? <Alert><CheckCircle2 /><AlertTitle>Alteração registrada</AlertTitle><AlertDescription>O histórico e a contagem de dias foram atualizados.</AlertDescription></Alert> : null}
    </CardContent></Card>

    <Card><CardHeader><CardTitle>Acompanhamento das campanhas</CardTitle><CardDescription>Normal: 0–9 dias · atenção: 10–13 dias · alerta: 14 dias ou mais.</CardDescription><div className="flex flex-wrap gap-2 pt-2"><Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>Todas</Button><Button size="sm" variant={filter === "attention" ? "default" : "outline"} onClick={() => setFilter("attention")}>10+ dias</Button><Button size="sm" variant={filter === "late" ? "default" : "outline"} onClick={() => setFilter("late")}>14+ dias</Button></div></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Campanha</TableHead><TableHead>Status</TableHead><TableHead>Última alteração</TableHead><TableHead>Dias</TableHead><TableHead className="text-right">Investimento</TableHead><TableHead className="text-right">ACOS</TableHead><TableHead className="text-right">ROAS</TableHead></TableRow></TableHeader><TableBody>{campaigns.map((row) => <TableRow key={row.campaignName}><TableCell className="max-w-72 font-medium"><p className="truncate" title={row.campaignName}>{row.campaignName}</p>{row.lastChangeType ? <p className="text-muted-foreground text-xs">{row.lastChangeType}</p> : null}</TableCell><TableCell>{row.status}</TableCell><TableCell>{formatDateTime(row.lastChangedAt)}</TableCell><TableCell>{ageBadge(row.daysWithoutChange)}</TableCell><TableCell className="text-right tabular-nums">{currency.format(row.investment)}</TableCell><TableCell className="text-right tabular-nums">{row.acos === null ? "—" : percent.format(row.acos)}</TableCell><TableCell className="text-right tabular-nums">{row.roas === null ? "—" : `${decimal.format(row.roas)}x`}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>

    <Card><CardHeader><CardTitle>Registros recentes</CardTitle><CardDescription>Métricas preservadas no momento de cada alteração.</CardDescription></CardHeader><CardContent className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Campanha</TableHead><TableHead>Alteração</TableHead><TableHead>Observação</TableHead><TableHead className="text-right">Investimento</TableHead><TableHead className="text-right">ROAS</TableHead></TableRow></TableHeader><TableBody>{data.history.length ? data.history.slice(0, 30).map((row) => <TableRow key={row.id}><TableCell>{formatDateTime(row.changedAt)}</TableCell><TableCell className="max-w-64 truncate font-medium" title={row.campaignName}>{row.campaignName}</TableCell><TableCell>{row.changeType}</TableCell><TableCell className="max-w-80 truncate" title={row.notes ?? undefined}>{row.notes ?? "—"}</TableCell><TableCell className="text-right tabular-nums">{currency.format(row.investment)}</TableCell><TableCell className="text-right tabular-nums">{row.roas === null ? "—" : `${decimal.format(row.roas)}x`}</TableCell></TableRow>) : <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Nenhuma alteração registrada ainda.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
  </div>;
}
