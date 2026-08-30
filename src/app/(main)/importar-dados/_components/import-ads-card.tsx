"use client";

import { useRef, useState } from "react";
import { AlertCircle, BadgeDollarSign, CheckCircle2, Upload } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

interface Result { totals: { processed: number; errors: number; duplicates: number }; files: { fileName: string; periodStart: string | null; periodEnd: string | null; processed: number; duplicate: boolean; problems: { line: number; message: string }[] }[] }
const MAX_FILES = 20;
const MAX_FILE_SIZE = 5 * 1024 * 1024;

export function ImportAdsCard() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleImport() {
    if (!files.length || processing) return;
    setError(null); setResult(null);
    if (files.length > MAX_FILES) return setError(`Selecione no máximo ${MAX_FILES} arquivos por lote.`);
    const invalid = files.find((file) => !file.name.toLocaleLowerCase("pt-BR").endsWith(".xlsx") || file.size === 0 || file.size > MAX_FILE_SIZE);
    if (invalid) return setError(`O arquivo ${invalid.name} deve ser XLSX e ter até 5 MB.`);
    setProcessing(true);
    try {
      const formData = new FormData();
      for (const file of files) formData.append("files", file);
      const response = await fetch("/api/importacoes/publicidade", { method: "POST", body: formData });
      const payload = await response.json() as Result & { message?: string };
      if (!response.ok) setError(payload.message ?? "Não foi possível importar publicidade.");
      else setResult(payload);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Não foi possível importar publicidade."); }
    finally { setProcessing(false); }
  }

  return <Card>
    <CardHeader><div className="flex items-start gap-3"><BadgeDollarSign className="mt-0.5 size-5 text-muted-foreground" aria-hidden="true" /><div className="flex flex-col gap-1"><CardTitle>Publicidade</CardTitle><CardDescription>Investimento, receita atribuída, ACOS e ROAS dos anúncios patrocinados.</CardDescription></div></div></CardHeader>
    <CardContent className="flex flex-col gap-4">
      <FieldGroup><Field><FieldLabel htmlFor="ads-files">Relatórios XLSX</FieldLabel><Input ref={inputRef} id="ads-files" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" multiple className="sr-only" disabled={processing} onChange={(event) => { setFiles(Array.from(event.target.files ?? [])); setResult(null); setError(null); }} /><div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center"><Button type="button" variant="outline" disabled={processing} onClick={() => inputRef.current?.click()}><Upload data-icon="inline-start" />Selecionar arquivos</Button><span className="text-muted-foreground text-sm">{files.length ? `${files.length} arquivo${files.length === 1 ? "" : "s"}` : "Nenhum arquivo selecionado"}</span></div><FieldDescription>Use o “Relatório de anúncios” do Mercado Ads. Até 20 arquivos por lote.</FieldDescription></Field></FieldGroup>
      {processing ? <Alert><Spinner /><AlertTitle>Processando publicidade...</AlertTitle><AlertDescription>As campanhas e anúncios serão consolidados no painel de Publicidade.</AlertDescription></Alert> : null}
      {error ? <Alert variant="destructive"><AlertCircle /><AlertTitle>Não foi possível concluir</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
      {result ? <Alert variant={result.totals.errors ? "destructive" : undefined}>{result.totals.errors ? <AlertCircle /> : <CheckCircle2 />}<AlertTitle>{result.totals.errors ? "Importação com pendências" : "Publicidade importada"}</AlertTitle><AlertDescription><p>{result.totals.processed} linhas processadas · {result.totals.duplicates} arquivo(s) duplicado(s) · {result.totals.errors} erro(s)</p><div className="mt-3 flex flex-col gap-2">{result.files.map((file) => <div key={file.fileName} className="rounded-md border p-2 text-sm"><p className="truncate font-medium" title={file.fileName}>{file.fileName}</p><p className="text-muted-foreground">{file.periodStart ?? "—"} até {file.periodEnd ?? "—"} · {file.processed} processadas{file.duplicate ? " · já importado" : ""}</p>{file.problems.slice(0, 3).map((problem) => <p key={`${problem.line}-${problem.message}`} className="text-destructive text-xs">{problem.line ? `Linha ${problem.line}: ` : ""}{problem.message}</p>)}</div>)}</div></AlertDescription></Alert> : null}
    </CardContent>
    <CardFooter className="justify-end"><Button type="button" disabled={!files.length || processing} onClick={handleImport}>{processing ? <Spinner data-icon="inline-start" /> : <Upload data-icon="inline-start" />}Importar publicidade</Button></CardFooter>
  </Card>;
}
