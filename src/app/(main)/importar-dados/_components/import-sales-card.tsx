"use client";

import { useRef, useState } from "react";

import { AlertCircle, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

import type { SalesImportResult } from "../_lib/sales-import-types";

export function ImportSalesCard() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<SalesImportResult | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  async function handleImport() {
    if (!file || isProcessing) return;
    setIsProcessing(true);
    setResult(null);
    setRequestError(null);
    const body = new FormData();
    body.set("file", file);

    try {
      const response = await fetch("/api/importacoes/sales", { method: "POST", body });
      const payload = (await response.json()) as SalesImportResult | { message?: string };
      if (!response.ok) {
        setRequestError(payload.message ?? "Não foi possível importar o arquivo.");
        return;
      }
      setResult(payload as SalesImportResult);
    } catch {
      setRequestError("Não foi possível enviar o arquivo. Tente novamente.");
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="mt-0.5 size-5 text-muted-foreground" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <CardTitle>Vendas</CardTitle>
            <CardDescription>Relatório de vendas do Mercado Livre</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="sales-file">Arquivo XLSX</FieldLabel>
            <Input
              ref={inputRef}
              id="sales-file"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              disabled={isProcessing}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setResult(null);
                setRequestError(null);
              }}
            />
            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
              <Button type="button" variant="outline" disabled={isProcessing} onClick={() => inputRef.current?.click()}>
                <Upload data-icon="inline-start" />
                Selecionar arquivo
              </Button>
              <p className="max-w-full truncate text-muted-foreground text-sm" aria-live="polite">
                {file?.name ?? "Nenhum arquivo selecionado"}
              </p>
            </div>
            <FieldDescription>Somente .xlsx, com até 10 MB. O arquivo não será armazenado.</FieldDescription>
          </Field>
        </FieldGroup>

        {isProcessing && (
          <Alert>
            <Spinner />
            <AlertTitle>Processando vendas...</AlertTitle>
            <AlertDescription>Isso pode levar alguns instantes.</AlertDescription>
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
          <Alert>
            <CheckCircle2 />
            <AlertTitle>Importação concluída</AlertTitle>
            <AlertDescription>
              <dl className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                <div>Vendas processadas: {result.salesProcessed}</div>
                <div>Itens de venda: {result.saleItems}</div>
                <div>Resumos de pacotes: {result.packageSummaries}</div>
                <div>Resumos de troca: {result.exchangeSummaries}</div>
                <div>Linhas inseridas: {result.insertedRows}</div>
                <div>Linhas já existentes: {result.existingRows}</div>
                <div>SKUs não identificados: {result.unidentifiedSkus}</div>
                <div>MLBs não identificados: {result.unidentifiedMlbs}</div>
                <div>Erros: {result.errors}</div>
              </dl>
              {result.problems.length > 0 && (
                <ul className="mt-3 flex list-disc flex-col gap-1 pl-5">
                  {result.problems.map((problem) => (
                    <li key={`${problem.line}-${problem.message}`}>
                      Linha {problem.line} — {problem.message}
                    </li>
                  ))}
                </ul>
              )}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter className="justify-end">
        <Button type="button" disabled={!file || isProcessing} onClick={handleImport}>
          {isProcessing ? <Spinner data-icon="inline-start" /> : <Upload data-icon="inline-start" />}
          Importar
        </Button>
      </CardFooter>
    </Card>
  );
}
