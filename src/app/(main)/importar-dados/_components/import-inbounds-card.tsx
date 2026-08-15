"use client";

import { useRef, useState } from "react";

import { AlertCircle, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

import type { InboundsImportResult } from "../_lib/inbounds-import-types";

export function ImportInboundsCard() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<InboundsImportResult | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  let selectedFilesLabel = "Nenhum arquivo selecionado";
  if (files.length === 1) selectedFilesLabel = files[0].name;
  else if (files.length > 1) selectedFilesLabel = `${files.length} arquivos selecionados`;

  async function handleImport() {
    if (files.length === 0 || isProcessing) return;
    setIsProcessing(true);
    setResult(null);
    setRequestError(null);
    const body = new FormData();
    for (const file of files) body.append("files", file);

    try {
      const response = await fetch("/api/importacoes/inbounds", { method: "POST", body });
      const payload = (await response.json()) as InboundsImportResult | { message?: string };
      if (!response.ok) {
        setRequestError(payload.message ?? "Não foi possível importar os arquivos.");
        return;
      }
      setResult(payload as InboundsImportResult);
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
            <CardTitle>Envios FULL</CardTitle>
            <CardDescription>Histórico de produtos enviados e recebidos pelo FULL</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="inbounds-files">Arquivos CSV</FieldLabel>
            <Input
              ref={inputRef}
              id="inbounds-files"
              type="file"
              accept=".csv,text/csv"
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
                {selectedFilesLabel}
              </p>
            </div>
            <FieldDescription>
              Um ou vários CSVs, com até 10 MB cada. Os arquivos não serão armazenados.
            </FieldDescription>
          </Field>
        </FieldGroup>

        {isProcessing && (
          <Alert>
            <Spinner />
            <AlertTitle>Processando Envios FULL...</AlertTitle>
            <AlertDescription>Os arquivos são registrados e processados individualmente.</AlertDescription>
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
            {result.errors ? <AlertCircle /> : <CheckCircle2 />}
            <AlertTitle>{result.message}</AlertTitle>
            <AlertDescription>
              <dl className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                <div>Arquivos processados: {result.filesProcessed}</div>
                <div>Envios identificados: {result.inboundIds}</div>
                <div>Registros processados: {result.recordsProcessed}</div>
                <div>Registros inseridos: {result.insertedRows}</div>
                <div>Registros já existentes: {result.existingRows}</div>
                <div>Conflitos históricos: {result.historicalConflicts}</div>
                <div>SKUs identificados: {result.identifiedSkus}</div>
                <div>SKUs não identificados: {result.unidentifiedSkus}</div>
                <div>MLBs identificados: {result.identifiedMlbs}</div>
                <div>MLBs não identificados: {result.unidentifiedMlbs}</div>
                <div>Unidades declaradas: {result.unitsDeclared}</div>
                <div>Unidades processadas: {result.unitsProcessed}</div>
                <div>Diferença líquida: {result.unitsDifference}</div>
                <div>Unidades aptas: {result.unitsSellable}</div>
                <div>Unidades não aptas: {result.unitsUnsellable}</div>
                <div>Unidades para identificar: {result.unitsUnidentified}</div>
                <div>Erros: {result.errors}</div>
              </dl>
              {result.problems.length > 0 && (
                <ul className="mt-3 flex list-disc flex-col gap-1 pl-5">
                  {result.problems.map((problem) => (
                    <li key={`${problem.fileName}-${problem.line}-${problem.severity}-${problem.message}`}>
                      {problem.fileName ? `${problem.fileName} — ` : ""}
                      {problem.line > 0 ? `linha ${problem.line} — ` : ""}
                      {problem.severity === "warning" ? "Aviso: " : "Erro: "}
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
        <Button type="button" disabled={files.length === 0 || isProcessing} onClick={handleImport}>
          {isProcessing ? <Spinner data-icon="inline-start" /> : <Upload data-icon="inline-start" />}
          Importar
        </Button>
      </CardFooter>
    </Card>
  );
}
