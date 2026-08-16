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
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<SalesImportResult | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  async function handleImport() {
    if (!files.length || isProcessing) return;
    setIsProcessing(true);
    setResult(null);
    setRequestError(null);
    const body = new FormData();
    files.forEach((file) => {
      body.append("files", file);
    });

    try {
      const response = await fetch("/api/importacoes/sales", { method: "POST", body });
      const payload = (await response.json()) as SalesImportResult | { message?: string };
      if (!response.ok) {
        setRequestError(payload.message ?? "Não foi possível importar os arquivos.");
        return;
      }
      setResult(payload as SalesImportResult);
    } catch {
      setRequestError("Não foi possível enviar os arquivos. Tente novamente.");
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
            <CardDescription>Relatórios de vendas do Mercado Livre</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="sales-file">Arquivos XLSX</FieldLabel>
            <Input
              ref={inputRef}
              id="sales-file"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              multiple
              className="sr-only"
              disabled={isProcessing}
              onChange={(event) => {
                setFiles(Array.from(event.target.files ?? []));
                setResult(null);
                setRequestError(null);
              }}
            />
            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
              <Button type="button" variant="outline" disabled={isProcessing} onClick={() => inputRef.current?.click()}>
                <Upload data-icon="inline-start" />
                Selecionar arquivos
              </Button>
              <p className="max-w-full truncate text-muted-foreground text-sm" aria-live="polite">
                {files.length === 0
                  ? "Nenhum arquivo selecionado"
                  : files.length +
                    " arquivo" +
                    (files.length === 1 ? "" : "s") +
                    " selecionado" +
                    (files.length === 1 ? "" : "s")}
              </p>
            </div>
            <FieldDescription>Somente .xlsx, com até 10 MB por arquivo.</FieldDescription>
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
                <div>Linhas: {result.totals.rows}</div>
                <div>Itens de venda: {result.totals.saleItems}</div>
                <div>Novas: {result.totals.insertedRows}</div>
                <div>Atualizadas: {result.totals.updatedRows}</div>
                <div>Duplicadas exatas: {result.totals.exactDuplicates}</div>
                <div>Versões antigas ignoradas: {result.totals.oldIgnoredRows}</div>
                <div>Conflitos: {result.totals.conflicts}</div>
                <div>Erros: {result.totals.errors}</div>
              </dl>
              <div className="mt-3 flex flex-col gap-3">
                {result.files.map((fileResult) => (
                  <div key={fileResult.fileName} className="rounded-md border p-3 text-sm">
                    <p className="truncate font-medium" title={fileResult.fileName}>
                      {fileResult.fileName}
                    </p>
                    <p className="text-muted-foreground">
                      Período: {fileResult.periodStart ?? "não encontrado"} — {fileResult.periodEnd ?? "não encontrado"}
                    </p>
                    <p className="text-muted-foreground">
                      Exportado em: {fileResult.sourceExportedAt ?? "não informado"}
                    </p>
                    <p>
                      Novas {fileResult.insertedRows} · Atualizadas {fileResult.updatedRows} · Duplicadas{" "}
                      {fileResult.exactDuplicates} · Antigas {fileResult.oldIgnoredRows} · Conflitos{" "}
                      {fileResult.conflicts}
                    </p>
                    {fileResult.problems.length > 0 && (
                      <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
                        {fileResult.problems.map((problem) => (
                          <li key={`${fileResult.fileName}-${problem.line}-${problem.message}`}>
                            {problem.line ? `Linha ${problem.line} — ` : ""}
                            {problem.message}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
      <CardFooter className="justify-end">
        <Button type="button" disabled={!files.length || isProcessing} onClick={handleImport}>
          {isProcessing ? <Spinner data-icon="inline-start" /> : <Upload data-icon="inline-start" />}
          Importar
        </Button>
      </CardFooter>
    </Card>
  );
}
