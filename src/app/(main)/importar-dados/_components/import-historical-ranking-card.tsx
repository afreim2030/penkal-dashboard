"use client";

import { useRef, useState } from "react";

import { AlertCircle, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

import type { HistoricalRankingImportResult } from "../_lib/historical-ranking-import-types";

export function ImportHistoricalRankingCard() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<HistoricalRankingImportResult | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  async function importFile() {
    if (!file || processing) return;
    setProcessing(true);
    setResult(null);
    setRequestError(null);
    const form = new FormData();
    form.set("file", file);
    try {
      const response = await fetch("/api/importacoes/historico-curvas", { method: "POST", body: form });
      const payload = (await response.json()) as HistoricalRankingImportResult | { message?: string };
      if (!response.ok) setRequestError(payload.message ?? "Não foi possível importar o histórico.");
      else setResult(payload as HistoricalRankingImportResult);
    } catch {
      setRequestError("Não foi possível enviar o arquivo. Tente novamente.");
    } finally {
      setProcessing(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="mt-0.5 size-5 text-muted-foreground" />
          <div>
            <CardTitle>Ranking histórico por SKU</CardTitle>
            <p className="mt-1 text-muted-foreground text-sm">
              Base consolidada para comparar o histórico da conta com os resultados atuais.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="historical-ranking-file">Arquivo XLSX</FieldLabel>
            <Input
              ref={inputRef}
              id="historical-ranking-file"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              disabled={processing}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setResult(null);
                setRequestError(null);
              }}
            />
            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
              <Button type="button" variant="outline" disabled={processing} onClick={() => inputRef.current?.click()}>
                <Upload data-icon="inline-start" />
                Selecionar arquivo
              </Button>
              <p className="max-w-full truncate text-muted-foreground text-sm">
                {file?.name ?? "Nenhum arquivo selecionado"}
              </p>
            </div>
            <FieldDescription>
              Colunas necessárias: SKU, Nome e Quantidade vendida. A importação substitui somente o ranking histórico da
              conta ativa.
            </FieldDescription>
          </Field>
        </FieldGroup>
        {processing && (
          <Alert>
            <Spinner />
            <AlertTitle>Processando ranking histórico...</AlertTitle>
            <AlertDescription>Os produtos serão vinculados somente pelo SKU.</AlertDescription>
          </Alert>
        )}
        {requestError && (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>Não foi possível concluir</AlertTitle>
            <AlertDescription>{requestError}</AlertDescription>
          </Alert>
        )}
        {result && (
          <Alert variant={result.errors ? "destructive" : "default"}>
            <CheckCircle2 />
            <AlertTitle>{result.message}</AlertTitle>
            <AlertDescription>
              <dl className="mt-2 grid gap-1 sm:grid-cols-2">
                <div>SKUs processados: {result.recordsProcessed}</div>
                <div>SKUs vinculados: {result.identifiedSkus}</div>
                <div>SKUs não localizados: {result.unidentifiedSkus}</div>
                <div>Unidades históricas: {result.totalHistoricalUnits.toLocaleString("pt-BR")}</div>
              </dl>
              {result.problems.length > 0 && (
                <ul className="mt-3 list-disc space-y-1 pl-5">
                  {result.problems.map((problem) => (
                    <li key={`${problem.line}-${problem.message}`}>
                      Linha {problem.line} — {problem.severity === "warning" ? "Aviso: " : "Erro: "}
                      {problem.message}
                    </li>
                  ))}
                </ul>
              )}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter className="justify-end">
        <Button type="button" disabled={!file || processing} onClick={importFile}>
          {processing ? <Spinner data-icon="inline-start" /> : <Upload data-icon="inline-start" />}Importar
        </Button>
      </CardFooter>
    </Card>
  );
}
