"use client";

import { useRef, useState } from "react";

import { AlertCircle, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

import type { FullImportResult } from "../_lib/full-import-types";

export function ImportFullInventoryCard() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<FullImportResult | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  async function handleImport() {
    if (!file || isProcessing) return;
    setIsProcessing(true);
    setResult(null);
    setRequestError(null);
    const body = new FormData();
    body.set("file", file);

    try {
      const response = await fetch("/api/importacoes/full-inventory", { method: "POST", body });
      const payload = (await response.json()) as FullImportResult | { message?: string };
      if (!response.ok) {
        setRequestError(payload.message ?? "Não foi possível importar o arquivo.");
        return;
      }
      setResult(payload as FullImportResult);
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
            <CardTitle>Estoque FULL</CardTitle>
            <CardDescription>Fotografia atual do estoque no FULL do Mercado Livre</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="full-inventory-file">Arquivo XLSX</FieldLabel>
            <Input
              ref={inputRef}
              id="full-inventory-file"
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
            <FieldDescription>Somente a aba Resumo é importada. O arquivo não será armazenado.</FieldDescription>
          </Field>
        </FieldGroup>

        {isProcessing && (
          <Alert>
            <Spinner />
            <AlertTitle>Processando estoque FULL...</AlertTitle>
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
            <AlertTitle>{result.message}</AlertTitle>
            <AlertDescription>
              <dl className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                <div>Registros processados: {result.recordsProcessed}</div>
                <div>SKUs identificados: {result.identifiedSkus}</div>
                <div>SKUs não identificados: {result.unidentifiedSkus}</div>
                <div>MLBs identificados: {result.identifiedMlbs}</div>
                <div>MLBs não identificados: {result.unidentifiedMlbs}</div>
                <div>SKUs com estoque &gt; 0: {result.positiveStockSkus}</div>
                <div>SKUs com estoque = 0: {result.zeroStockSkus}</div>
                <div>Quantidade total no FULL: {result.totalQuantityFull}</div>
                <div>Unidades que afetam Tempo de estoque: {result.totalUnitsAffectStockTime}</div>
                <div>Registros inseridos: {result.insertedRows}</div>
                <div>Erros: {result.errors}</div>
              </dl>
              {result.problems.length > 0 && (
                <ul className="mt-3 flex list-disc flex-col gap-1 pl-5">
                  {result.problems.map((problem) => (
                    <li key={`${problem.line}-${problem.message}`}>
                      Linha {problem.line} — {problem.severity === "warning" ? "Aviso: " : ""}
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
        <Button type="button" disabled={!file || isProcessing} onClick={handleImport}>
          {isProcessing ? <Spinner data-icon="inline-start" /> : <Upload data-icon="inline-start" />}
          Importar
        </Button>
      </CardFooter>
    </Card>
  );
}
